const path = require("path");
const { createAccount, findByIdentifier, verifyPassword, getAllNonAdminAccounts, deleteAccountByIdNonAdmin, getAllStatus, setAccountStatus, updateCommitteeInfo, getCommitteeMemberInfoList, getAccountById, createAccountByAdmin, updateAccountByAdmin, getAccountsByTypeAndStatus } = require("../model/accountDao");
const { createReviewerApplicationOnce, getApplicationByReviewerId, getApplicationsByStatus, getApprovedReviewerApplications, setApplicationStatus } = require("../model/applicationDao");
const abstractDao = require("../model/abstractDao");
const announcementDao = require("../model/announcementDao");

function sendView(res, filename) {
  return res.sendFile(path.join(__dirname, "..", "view", filename));
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function shouldUseMockRender(res) {
  return typeof res?.render === "function" && !res?.app;
}

function getAccountStatusViewModel(status) {
  const s = String(status || "Pending");
  if (s === "Approved") return { status: "Approved", badge: "badge-approved", message: "Your account has been approved." };
  if (s === "Denied") return { status: "Denied", badge: "badge-denied", message: "Your account has been denied. Please contact an administrator if you believe this is a mistake." };
  return { status: "Pending", badge: "badge-pending", message: "Your account is waiting for approval." };
}

function isAbstractComplete(abs) {
  const finalStatus = String(abs?.finalStatus || "Pending").trim();
  return Boolean(abs?.isComplete) || ["Approved", "Denied"].includes(finalStatus);
}

function getSubmissionPipelineViewModel(abs) {
  if (!abs) return { label: "No Submission", badge: "badge", message: "You have not submitted an abstract yet." };
  const submissionState = String(abs.submissionState || "").trim();
  const assignmentStatus = String(abs.assignmentStatus || "Unassigned").trim();
  const finalStatus = String(abs.finalStatus || "Pending").trim();

  if (submissionState === "Draft") {
    return { label: "Draft", badge: "badge-draft", message: "Your abstract is saved as a draft and has not entered review yet." };
  }
  if (finalStatus === "Approved") {
    return { label: "Approved", badge: "badge-approved", message: "Your abstract has been approved and is now complete." };
  }
  if (finalStatus === "Denied") {
    return { label: "Denied", badge: "badge-denied", message: "Your abstract has been denied and is now complete." };
  }
  if (assignmentStatus === "Assigned") {
    return {
      label: "Assigned to Reviewer",
      badge: "badge-approved",
      message: abs.assignedReviewerName ? `Your abstract is currently assigned to ${escapeHtml(abs.assignedReviewerName)} for review.` : "Your abstract is currently assigned to a reviewer."
    };
  }
  return { label: "Awaiting Reviewer Assignment", badge: "badge-pending", message: "Your abstract has been submitted and is waiting to be assigned to a reviewer." };
}

async function loadActiveAnnouncements() {
  try {
    if (process.env.NODE_ENV === "test") return [];
    if (!announcementDao || typeof announcementDao.getActiveAnnouncements !== "function") return [];
    const announcements = await announcementDao.getActiveAnnouncements();
    return Array.isArray(announcements) ? announcements : [];
  } catch (err) {
    return [];
  }
}

function renderAnnouncementPopupAssets(announcements) {
  const active = Array.isArray(announcements) ? announcements.filter(Boolean) : [];
  if (!active.length) return "";

  const items = active.map((item, index) => {
    const title = escapeHtml(item.title || "Announcement");
    const description = String(item.description || "").trim();
    const preview = escapeHtml(description.length > 140 ? `${description.slice(0, 140)}…` : description);
    const fullDescription = escapeHtml(description);
    const createdBy = escapeHtml(item.createdByName || item.createdByEmail || item.createdByRole || "Committee Member");
    const creatorRole = escapeHtml(item.createdByRole || "Committee");
    const expiresAt = item.expiresAt ? escapeHtml(new Date(item.expiresAt).toLocaleString()) : "";
    const createdAt = item.createdAt ? escapeHtml(new Date(item.createdAt).toLocaleString()) : "";
    return `
      <article class="announcement-popup-card" data-announcement-card tabindex="0" role="button" aria-expanded="false" aria-label="Open announcement: ${title}">
        <button class="announcement-close" type="button" aria-label="Close announcement">×</button>
        <div class="announcement-summary">
          <div class="announcement-chip">Announcement</div>
          <h3>${title}</h3>
          <p>${preview || "Open this notice to view more details."}</p>
          ${expiresAt ? `<div class="announcement-meta">Expires ${expiresAt}</div>` : ""}
        </div>
        <div class="announcement-details" hidden>
          <div class="announcement-meta"><strong>Created by:</strong> ${createdBy} (${creatorRole})</div>
          ${createdAt ? `<div class="announcement-meta"><strong>Posted:</strong> ${createdAt}</div>` : ""}
          ${expiresAt ? `<div class="announcement-meta"><strong>Expires:</strong> ${expiresAt}</div>` : ""}
          <div class="announcement-fulltext">${fullDescription || "No additional details were provided."}</div>
        </div>
      </article>`;
  }).join("");

  return `
    <style>
      .announcement-popup-stack{position:fixed;right:18px;bottom:18px;display:flex;flex-direction:column;gap:12px;z-index:9999;max-width:min(380px,calc(100vw - 24px));}
      .announcement-popup-card{background:#ffffff;border:1px solid rgba(15,23,42,.12);border-radius:16px;box-shadow:0 18px 38px rgba(15,23,42,.18);padding:16px 18px 14px 18px;cursor:pointer;position:relative;transition:transform .18s ease, box-shadow .18s ease, max-height .18s ease;overflow:hidden;}
      .announcement-popup-card:hover{transform:translateY(-1px);box-shadow:0 20px 42px rgba(15,23,42,.22);}
      .announcement-popup-card:focus-visible{outline:3px solid rgba(37,99,235,.25);outline-offset:2px;}
      .announcement-chip{display:inline-flex;align-items:center;gap:6px;background:#eff6ff;color:#1d4ed8;border-radius:999px;padding:4px 9px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:10px;}
      .announcement-popup-card h3{margin:0 28px 8px 0;font-size:1rem;line-height:1.35;}
      .announcement-popup-card p{margin:0;color:#334155;line-height:1.45;}
      .announcement-meta{margin-top:10px;color:#64748b;font-size:.86rem;line-height:1.35;}
      .announcement-close{position:absolute;top:10px;right:10px;border:none;background:transparent;font-size:1rem;line-height:1;color:#64748b;cursor:pointer;padding:4px 6px;border-radius:999px;}
      .announcement-close:hover{background:rgba(148,163,184,.15);color:#0f172a;}
      .announcement-details{margin-top:14px;padding-top:12px;border-top:1px solid rgba(148,163,184,.25);}
      .announcement-fulltext{margin-top:12px;white-space:pre-wrap;color:#0f172a;line-height:1.5;}
      .announcement-popup-card.is-expanded .announcement-summary p{-webkit-line-clamp:unset;}
      @media (max-width: 640px){.announcement-popup-stack{left:12px;right:12px;bottom:12px;max-width:none;}}
    </style>
    <div class="announcement-popup-stack" aria-live="polite" aria-label="Active announcements">${items}</div>
    <script>
      (function(){
        var cards = Array.prototype.slice.call(document.querySelectorAll('[data-announcement-card]'));
        cards.forEach(function(card){
          var closeBtn = card.querySelector('.announcement-close');
          var details = card.querySelector('.announcement-details');
          function toggle(forceOpen){
            var shouldOpen = typeof forceOpen === 'boolean' ? forceOpen : !card.classList.contains('is-expanded');
            card.classList.toggle('is-expanded', shouldOpen);
            card.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
            if (details) details.hidden = !shouldOpen;
          }
          card.addEventListener('click', function(event){
            if (event.target === closeBtn) return;
            toggle();
          });
          card.addEventListener('keydown', function(event){
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              toggle();
            }
          });
          if (closeBtn) {
            closeBtn.addEventListener('click', function(event){
              event.stopPropagation();
              card.remove();
              var stack = document.querySelector('.announcement-popup-stack');
              if (stack && !stack.children.length) stack.remove();
            });
          }
        });
      })();
    </script>`;
}

function withAnnouncementPopups(html, announcements) {
  const popupMarkup = renderAnnouncementPopupAssets(announcements);
  if (!popupMarkup) return html;
  return String(html || "").replace(/<\/body>/i, `${popupMarkup}</body>`);
}



function renderAccountStatusPage(res, accountType, status) {
  const vm = getAccountStatusViewModel(status);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Account Status • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/" aria-label="home">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
              </div>
    </header>

    <main class="page">
      <section class="card">
        <div class="dashboard-shell">
          <section class="dashboard-hero hero-committee">
            <span class="dashboard-kicker">${escapeHtml(accountType)} Account</span>
            <h1>Account Status</h1>
            <p>${escapeHtml(vm.message)}</p>
            <div style="margin-top:14px;">
              <span class="badge ${vm.badge}">${escapeHtml(vm.status)}</span>
            </div>
          </section>

          <section class="dashboard-grid">
            <div class="tile tile-accent-committee">
              <h2>What this means</h2>
              <p>${vm.status === "Pending" ? "Your account can log in, but approval-only actions are temporarily unavailable until an administrator reviews your request." : "Your account cannot access approval-only actions in its current state."}</p>
            </div>
          </section>

          <div style="margin-top:14px;">
            <a class="btn btn-secondary" href="/gallery">Approved Gallery</a>
        <a class="btn btn-secondary" href="/announcements/create">Create Announcement</a>
          </div>

          <form method="post" action="/logout" style="margin-top: 6px;">
            <button class="btn btn-secondary" type="submit">Logout</button>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`;
  return res.status(200).send(html);
}

function requireAuth(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  next();
}

function requireStudent(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  if (req.session.user.accountType !== "Student") return res.status(403).send("Forbidden");
  next();
}

function requireReviewer(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  if (req.session.user.accountType !== "Reviewer") return res.status(403).send("Forbidden");
  next();
}

function requireCommittee(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  if (req.session.user.accountType !== "Committee") return res.status(403).send("Forbidden");
  next();
}

function requireCommitteeOrAdmin(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  if (!["Committee", "Admin"].includes(req.session.user.accountType)) return res.status(403).send("Forbidden");
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  if (req.session.user.accountType !== "Admin") return res.status(403).send("Forbidden");
  next();
}

function getIndex(req, res) {
  return sendView(res, "index.html");
}

function renderLoginPage(errorMessage = "") {
  const safeError = escapeHtml(errorMessage || "");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Login • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/" aria-label="home">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
    </header>

    <main class="page">
      <section class="card" aria-label="login-card">
        <h1 class="card-title">Login</h1>

        <form class="form" method="post" action="/login" aria-label="login-form">
          <label class="label">
            <span>Email or Username</span>
            <input class="input" type="text" name="identifier" autocomplete="username" />
          </label>

          <label class="label">
            <span>Password</span>
            <input class="input" type="password" name="password" autocomplete="current-password" />
          </label>

          ${safeError ? `<p style="margin:0;color:#b91c1c;font-size:.9rem;">${safeError}</p>` : ""}

          <button class="btn" type="submit">Login</button>

          <a class="btn btn-secondary" href="/register" aria-label="create-account-button">
            Create New Account
          </a>
        </form>

        <p class="muted">Passwords are now securely hashed.</p>
      </section>
    </main>
  </body>
</html>`;
}

function getLogin(req, res) {
  const errorMessage = req.query?.error === "invalid" ? "Invalid credentials. Please try again." : "";
  return res.status(200).send(renderLoginPage(errorMessage));
}

function getDashboard(req, res) {
  if (!req.session?.user) return res.redirect("/login");

  const type = req.session.user.accountType;
  const status = req.session.user.status || "Approved";

  if (type === "Committee" && status !== "Approved") {
    return renderAccountStatusPage(res, "Committee", status);
  }

  if (status === "Denied") return sendView(res, "dashboard.html");

  if (type === "Student") return getStudentDashboard(req, res);
  if (type === "Reviewer") return getReviewerDashboard(req, res);
  if (type === "Committee") return getCommitteeDashboard(req, res);
  if (type === "Admin") return getAdminDashboard(req, res);

  return sendView(res, "dashboard.html");
}

function getRegister(req, res) {
  return sendView(res, "register.html");
}

function getRegisterStudent(req, res) {
  return sendView(res, "register-student.html");
}

function getRegisterReviewer(req, res) {
  return sendView(res, "register-reviewer.html");
}

function getRegisterCommittee(req, res) {
  return sendView(res, "register-committee.html");
}

async function postLogin(req, res) {
  try {
    const identifier = String(req.body?.identifier || "").trim();
    const password = String(req.body?.password || "");

    if (!identifier || !password) return res.redirect("/login?error=invalid");

    const account = await findByIdentifier(identifier);
    if (!account) return res.redirect("/login?error=invalid");

    const ok = await verifyPassword(account, password);
    if (!ok) return res.redirect("/login?error=invalid");

    await new Promise((resolve, reject) => {
      req.session.regenerate((err) => {
        if (err) return reject(err);

        req.session.user = {
          id: String(account._id),
          accountType: account.accountType,
          email: account.email || null,
          username: account.username || null,
          status: account.status || null
        };

        req.session.save((saveErr) => {
          if (saveErr) return reject(saveErr);
          resolve();
        });
      });
    });

    return res.redirect("/dashboard");
  } catch (err) {
    return res.status(500).send(`Login error: ${err.message}`);
  }
}

function postLogout(req, res) {
  if (!req.session) return res.redirect("/");

  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    return res.redirect("/");
  });
}

async function postRegisterStudent(req, res) {
  try {
    await createAccount({
      accountType: "Student",
      email: req.body?.email,
      password: req.body?.password
    });
    return res.redirect("/login");
  } catch (err) {
    return res.status(400).send(`Could not create student account: ${err.message}`);
  }
}

async function postRegisterReviewer(req, res) {
  try {
    await createAccount({
      accountType: "Reviewer",
      email: req.body?.email,
      password: req.body?.password,
      subjectArea: req.body?.subjectArea
    });
    return res.redirect("/login");
  } catch (err) {
    return res.status(400).send(`Could not create reviewer account: ${err.message}`);
  }
}

async function postRegisterCommittee(req, res) {
  try {
    await createAccount({
      accountType: "Committee",
      email: req.body?.email,
      password: req.body?.password,
      subjectArea: req.body?.subjectArea
    });
    return res.redirect("/login");
  } catch (err) {
    return res.status(400).send(`Could not create committee account: ${err.message}`);
  }
}


async function getAdminManageAccounts(req, res) {
  try {
    const accounts = await getAllNonAdminAccounts();

    const groups = {
      Student: [],
      Reviewer: [],
      Committee: []
    };

    for (const a of accounts) {
      const t = a.accountType || "Other";
      if (!groups[t]) groups[t] = [];
      groups[t].push(a);
    }

    const renderGroup = (type) => {
      const list = groups[type] || [];
      const rows = list
        .map((a) => {
          const id = escapeHtml(a._id);
          const email = escapeHtml(a.email || "");
          const username = escapeHtml(a.username || "");
          const subjectArea = escapeHtml(a.subjectArea || "");
          const status = escapeHtml(a.status || "Pending");

          let actions = `
                <form method="post" action="/admin/accounts/${id}/delete" style="margin:0;">
                  <button class="btn btn-danger" type="submit">Delete</button>
                </form>`;

          if (type === "Committee" && status === "Pending") {
            actions = `
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                  <form method="post" action="/admin/accounts/${id}/approve" style="margin:0;">
                    <button class="btn" type="submit">Approve</button>
                  </form>
                  <form method="post" action="/admin/accounts/${id}/deny" style="margin:0;">
                    <button class="btn btn-danger" type="submit">Deny</button>
                  </form>
                  <form method="post" action="/admin/accounts/${id}/delete" style="margin:0;">
                    <button class="btn btn-secondary" type="submit">Delete</button>
                  </form>
                </div>`;
          }

          return `
            <tr>
              <td>${email || username}</td>
              <td>${email}</td>
              <td>${username}</td>
              <td>${subjectArea}</td>
              <td>${status}</td>
              <td><div style="display:flex; gap:8px; flex-wrap:wrap;"><a class="btn btn-secondary" href="/admin/accounts/${id}/edit">Edit</a>${actions}</div></td>
            </tr>
          `;
        })
        .join("");

      return `
        <h2 class="section-title">${escapeHtml(type)} Accounts</h2>
        <div class="table-wrap">
          <table class="table" aria-label="${escapeHtml(type)} accounts table">
            <thead>
              <tr>
                <th>Display</th>
                <th>Email</th>
                <th>Username</th>
                <th>Subject Area</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="6" class="muted">No accounts.</td></tr>`}
            </tbody>
          </table>
        </div>
      `;
    };

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Manage Accounts • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
              </div>
    </header>

    <main class="page">
      <section class="card">
        <h1 class="card-title">Manage Accounts</h1>
        <p class="muted" style="margin-top:0;">Admin accounts are hidden and cannot be deleted here.</p>
        <div style="margin-top:12px; margin-bottom:18px;"><a class="btn" href="/admin/accounts/create">Create New Account</a></div>

        ${renderGroup("Student")}
        ${renderGroup("Reviewer")}
        ${renderGroup("Committee")}

        <div style="margin-top:16px;">
          <a class="btn btn-secondary" href="/announcements/manage">Manage Announcements</a>
        <a class="btn btn-secondary" href="/dashboard">Back to Dashboard</a>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Could not load accounts: ${err.message}`);
  }
}

async function postAdminDeleteAccount(req, res) {
  try {
    const id = req.params.id;
    await deleteAccountByIdNonAdmin(id);
    return res.redirect("/admin/accounts");
  } catch (err) {
    return res.status(400).send(`Could not delete account: ${err.message}`);
  }
}





async function getReviewerDashboard(req, res) {
  try {
    const reviewerId = req.session?.user?.id;
    if (!reviewerId) return res.redirect("/login");

    const accountStatus = req.session?.user?.status || "Approved";
    const assignedAbstractsPromise = abstractDao.getAssignedAbstractsByReviewerId
      ? abstractDao.getAssignedAbstractsByReviewerId(reviewerId)
      : abstractDao.getAssignedAbstractByReviewerId
        ? abstractDao.getAssignedAbstractByReviewerId(reviewerId).then((item) => item ? [item] : [])
        : Promise.resolve([]);
    const [application, assignedAbstracts] = await Promise.all([
      getApplicationByReviewerId(reviewerId),
      assignedAbstractsPromise
    ]);
    const applicationStatus = application?.status || null;
    const assignedList = Array.isArray(assignedAbstracts) ? assignedAbstracts : [];
    const selectedAbstract = assignedList[0] || null;
    const readyCount = assignedList.filter((abs) => !isAbstractComplete(abs) && !(Array.isArray(abs.pendingFeedback) && abs.pendingFeedback.length > 0)).length;
    const pendingCount = assignedList.filter((abs) => Array.isArray(abs.pendingFeedback) && abs.pendingFeedback.length > 0).length;
    const draftCount = assignedList.filter((abs) => abs?.feedbackDraft).length;
    const completeCount = assignedList.filter((abs) => isAbstractComplete(abs)).length;

    let primaryTile = `
      <div class="tile tile-accent-reviewer dashboard-feature-tile">
        <div class="dashboard-tile-topline">
          <h2>Reviewer Application</h2>
          <span class="badge badge-pending">Application</span>
        </div>
        <p>${accountStatus === "Approved"
          ? "Volunteer for reviewing or judging roles by submitting your application."
          : "Your reviewer account must be approved before you can submit an application."}</p>
        <div class="dashboard-tile-actions">
          <span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>
          ${accountStatus === "Approved" ? `<a class="btn btn-secondary" href="/reviewer/application">Submit Application</a>` : ``}
        </div>
      </div>`;

    if (application && applicationStatus === "Pending") {
      primaryTile = `
        <div class="tile tile-accent-reviewer dashboard-feature-tile">
          <div class="dashboard-tile-topline">
            <h2>My Application</h2>
            <span class="badge badge-pending">Pending</span>
          </div>
          <p>Your application is currently under review. You can view it, but you cannot edit or resubmit it.</p>
          <div class="dashboard-tile-actions">
            <a class="btn btn-secondary" href="/reviewer/application">View Application</a>
          </div>
        </div>`;
    } else if (application && (applicationStatus === "Approved" || applicationStatus === "Denied")) {
      primaryTile = `
        <div class="tile tile-accent-reviewer dashboard-feature-tile">
          <div class="dashboard-tile-topline">
            <h2>Application Closed</h2>
            <span class="badge badge-${applicationStatus.toLowerCase()}">${applicationStatus}</span>
          </div>
          <p>Your reviewer application has been ${applicationStatus.toLowerCase()}. You can no longer open or resubmit it.</p>
          <div class="dashboard-tile-actions"><span class="badge badge-${applicationStatus.toLowerCase()}">${applicationStatus}</span></div>
        </div>`;
    }

    if (shouldUseMockRender(res)) {
      return res.render("dashboard-reviewer", { application, status: applicationStatus, accountStatus, assignedAbstracts: assignedList });
    }

    const assignedWorkText = assignedList.length === 0
      ? "No abstracts have been assigned to you yet."
      : assignedList.length === 1
        ? `You currently have 1 assigned abstract: <strong>${escapeHtml(selectedAbstract.title || "Untitled Abstract")}</strong>.`
        : `You currently have <strong>${assignedList.length}</strong> assigned abstracts. Open your review queue to choose which abstract you want to work on.`;

    const workflowText = assignedList.length === 0
      ? "Submit feedback with a recommendation of Approved, Work In Progress, or Denied once an abstract is assigned to you."
      : `${readyCount} ready, ${draftCount} draft saved, ${pendingCount} pending committee review, ${completeCount} complete.`;

    const workflowBadge = assignedList.length === 0
      ? `<span class="badge badge-pending">No Assignments</span>`
      : pendingCount > 0
        ? `<span class="badge badge-pending">${pendingCount} Pending Review</span>`
        : draftCount > 0
          ? `<span class="badge badge-draft">${draftCount} Draft Saved</span>`
          : readyCount > 0
            ? `<span class="badge">${readyCount} Ready</span>`
            : `<span class="badge badge-approved">${completeCount} Complete</span>`;

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reviewer Dashboard • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/" aria-label="home">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <div class="dashboard-shell">
          <section class="dashboard-hero hero-reviewer dashboard-hero-clean">
            <div class="dashboard-hero-copy">
              <span class="dashboard-kicker">Review Team</span>
              <h1>Reviewer Dashboard</h1>
              <p>Choose an assigned abstract, save review drafts, and move feedback through committee approval without crowding the dashboard.</p>
            </div>
            <div class="dashboard-hero-stats" aria-label="reviewer summary">
              <div class="dashboard-stat-pill">
                <span class="dashboard-stat-label">Assigned</span>
                <strong>${assignedList.length}</strong>
              </div>
              <div class="dashboard-stat-pill">
                <span class="dashboard-stat-label">Ready</span>
                <strong>${readyCount}</strong>
              </div>
              <div class="dashboard-stat-pill">
                <span class="dashboard-stat-label">Complete</span>
                <strong>${completeCount}</strong>
              </div>
            </div>
          </section>

          <section class="dashboard-quick-links" aria-label="reviewer quick links">
            <a class="dashboard-quick-link dashboard-quick-link-primary" href="/reviewer/abstract">Open Review Queue</a>
            <a class="dashboard-quick-link" href="/reviewer/application">Reviewer Application</a>
            <a class="dashboard-quick-link" href="/gallery">Approved Gallery</a>
          </section>

          <section class="dashboard-grid dashboard-grid-clean">
            <div class="tile tile-accent-reviewer dashboard-feature-tile">
              <div class="dashboard-tile-topline">
                <h2>Assigned Work</h2>
                <span class="badge ${assignedList.length ? "badge-approved" : "badge-pending"}">${assignedList.length ? `${assignedList.length} Assigned` : "Unassigned"}</span>
              </div>
              <p>${assignedWorkText}</p>
              <div class="dashboard-tile-actions">${assignedList.length ? `<a class="btn btn-secondary" href="/reviewer/abstract">Open Queue</a>` : `<span class="badge badge-pending">Waiting for Assignment</span>`}</div>
            </div>
            <div class="tile tile-accent-reviewer dashboard-feature-tile">
              <div class="dashboard-tile-topline">
                <h2>Feedback Workflow</h2>
                ${workflowBadge}
              </div>
              <p>${workflowText}</p>
              <div class="dashboard-tile-actions">${assignedList.length ? `<a class="btn btn-secondary" href="/reviewer/abstract">Continue Reviews</a>` : `<span class="badge badge-pending">No Open Reviews</span>`}</div>
            </div>
            ${primaryTile}
          </section>

          <section class="dashboard-secondary-panel">
            <div class="dashboard-secondary-header">
              <div>
                <h2>Additional Tools</h2>
                <p class="muted">Supporting actions stay here so the main dashboard remains focused on your assigned review work.</p>
              </div>
            </div>
            <div class="dashboard-secondary-grid">
              <a class="dashboard-mini-card" href="/reviewer/application">
                <span class="dashboard-mini-label">Application</span>
                <strong>Reviewer Application</strong>
                <small>View or submit your volunteer application based on your account status.</small>
              </a>
              <a class="dashboard-mini-card" href="/gallery">
                <span class="dashboard-mini-label">Gallery</span>
                <strong>Approved Gallery</strong>
                <small>Read fully approved abstracts and previous winners.</small>
              </a>
            </div>
          </section>

          <form method="post" action="/logout" style="margin-top: 2px;">
            <button class="btn btn-secondary" type="submit">Logout</button>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`;

    const announcements = await loadActiveAnnouncements();
    return res.status(200).send(withAnnouncementPopups(html, announcements));
  } catch (err) {
    if (shouldUseMockRender(res)) {
      return res.render("dashboard-reviewer", { application: null, status: null, error: err.message });
    }
    return res.status(500).send(`Could not load reviewer dashboard: ${err.message}`);
  }
}

async function getStudentDashboard(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect("/login");

    const accountStatus = req.session?.user?.status || "Approved";
    const existing = await abstractDao.getAbstractByStudentId(userId);
    const submissionState = String(existing?.submissionState || "").trim();
    const finalStatus = String(existing?.finalStatus || "Pending").trim();
    const pipelineStatus = getSubmissionPipelineViewModel(existing);

    const statusBadges = [];
    if (accountStatus !== "Approved") {
      statusBadges.push(`<span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>`);
    }
    if (submissionState) {
      statusBadges.push(`<span class="badge ${submissionState === "Draft" ? "badge-draft" : "badge-submitted"}">${escapeHtml(submissionState)}</span>`);
    }
    if (existing && submissionState !== "Draft") {
      statusBadges.push(`<span class="badge ${pipelineStatus.badge}">${escapeHtml(pipelineStatus.label)}</span>`);
    }
    if (existing && finalStatus && !["Pending", ""].includes(finalStatus)) {
      statusBadges.push(`<span class="badge badge-${finalStatus.toLowerCase()}">${escapeHtml(finalStatus)}</span>`);
    }

    const canSubmit = accountStatus === "Approved";
    const abstractComplete = isAbstractComplete(existing);

    const primaryLabel = existing
      ? submissionState === "Draft"
        ? "Continue Draft"
        : abstractComplete
          ? "View Final Status"
          : "Update Submission"
      : "Start Submission";

    const primaryAction = abstractComplete
      ? `<a class="btn" href="/student/abstract">View Final Status</a>`
      : canSubmit
        ? `<a class="btn" href="/student/abstract/submit">${primaryLabel}</a>`
        : `<span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>`;

    const secondaryTile = existing
      ? submissionState === "Draft"
        ? `<div class="tile tile-accent-student dashboard-feature-tile">
            <div class="dashboard-tile-topline">
              <h2>Draft in Progress</h2>
              <span class="badge badge-draft">Draft</span>
            </div>
            <p>Your abstract has been saved as a draft. ${canSubmit ? "Come back anytime to finish and submit it." : "Approval is required before you can continue editing and submit it."}</p>
            <div class="dashboard-tile-actions">
              ${canSubmit ? `<a class="btn btn-secondary" href="/student/abstract/submit">Continue Draft</a>` : `<span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>`}
            </div>
          </div>`
        : abstractComplete
          ? `<div class="tile tile-accent-student dashboard-feature-tile">
              <div class="dashboard-tile-topline">
                <h2>Final Decision</h2>
                <span class="badge badge-${finalStatus.toLowerCase()}">${escapeHtml(finalStatus)}</span>
              </div>
              <p>${pipelineStatus.message} The abstract is complete and can no longer be changed by the student.</p>
              <div class="dashboard-tile-actions">
                <a class="btn btn-secondary" href="/student/abstract">View Final Decision</a>
              </div>
            </div>`
          : `<div class="tile tile-accent-student dashboard-feature-tile">
              <div class="dashboard-tile-topline">
                <h2>View My Abstract</h2>
                <span class="badge ${pipelineStatus.badge}">${escapeHtml(pipelineStatus.label)}</span>
              </div>
              <p>${pipelineStatus.message} Open your submitted abstract to view its status, feedback history, and latest details.</p>
              <div class="dashboard-tile-actions">
                <a class="btn btn-secondary" href="/student/abstract">View My Abstract</a>
              </div>
            </div>`
      : `<div class="tile tile-accent-student dashboard-feature-tile">
          <div class="dashboard-tile-topline">
            <h2>Submission Access</h2>
            <span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>
          </div>
          <p>${canSubmit ? "You can begin a new abstract now and save drafts as you work." : "Your student account must be approved before you can create or submit an abstract."}</p>
          <div class="dashboard-tile-actions">
            <span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>
          </div>
        </div>`;

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Student Dashboard • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/" aria-label="home">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
        <a class="btn btn-secondary" href="/gallery">Approved Gallery</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <div class="dashboard-shell">
          <section class="dashboard-hero hero-student dashboard-hero-clean">
            <div class="dashboard-hero-copy">
              <span class="dashboard-kicker">Research Submission</span>
              <h1>Student Dashboard</h1>
              <p>Draft, submit, and track your abstract in a cleaner workspace that keeps the next step front and center.</p>
            </div>
            <div class="dashboard-hero-stats" aria-label="student summary">
              <div class="dashboard-stat-pill">
                <span class="dashboard-stat-label">Account</span>
                <strong>${escapeHtml(accountStatus)}</strong>
              </div>
              <div class="dashboard-stat-pill">
                <span class="dashboard-stat-label">Submission</span>
                <strong>${existing ? escapeHtml(submissionState || "Started") : "None"}</strong>
              </div>
              <div class="dashboard-stat-pill">
                <span class="dashboard-stat-label">Decision</span>
                <strong>${escapeHtml(finalStatus)}</strong>
              </div>
            </div>
          </section>

          <section class="dashboard-quick-links" aria-label="student quick links">
            <a class="dashboard-quick-link dashboard-quick-link-primary" href="/student/abstract${abstractComplete ? "" : "/submit"}">${abstractComplete ? "View Final Status" : primaryLabel}</a>
            ${existing ? `<a class="dashboard-quick-link" href="/student/abstract">View My Abstract</a>` : ""}
            <a class="dashboard-quick-link" href="/gallery">Approved Gallery</a>
          </section>

          <section class="dashboard-grid dashboard-grid-clean">
            <div class="tile tile-accent-student dashboard-feature-tile">
              <div class="dashboard-tile-topline">
                <h2>${primaryLabel}</h2>
                <span class="badge ${pipelineStatus.badge}">${pipelineStatus.label}</span>
              </div>
              <p>${abstractComplete ? "Your final committee-approved decision is available here. Student editing is now closed." : canSubmit ? "Create a new abstract, revise your saved draft, or update your latest submission." : "Approval is required before abstract submission becomes available."}</p>
              <div class="dashboard-tile-actions">
                ${primaryAction}
              </div>
            </div>

            ${secondaryTile}
            <div class="tile tile-accent-student dashboard-feature-tile">
              <div class="dashboard-tile-topline">
                <h2>Submission Progress</h2>
                <span class="badge ${pipelineStatus.badge}">${pipelineStatus.label}</span>
              </div>
              <p>${pipelineStatus.message}</p>
              <div class="dashboard-tile-actions">
                ${statusBadges.join("") || `<span class="badge ${pipelineStatus.badge}">${pipelineStatus.label}</span>`}
              </div>
            </div>
          </section>

          <section class="dashboard-secondary-panel">
            <div class="dashboard-secondary-header">
              <div>
                <h2>Additional Tools</h2>
                <p class="muted">Reference tools and published work stay here so the main dashboard remains focused on your submission.</p>
              </div>
            </div>
            <div class="dashboard-secondary-grid">
              <a class="dashboard-mini-card" href="/gallery">
                <span class="dashboard-mini-label">Gallery</span>
                <strong>Approved Gallery</strong>
                <small>Browse fully approved abstracts and previous winners.</small>
              </a>
              ${existing ? `<a class="dashboard-mini-card" href="/student/abstract">
                <span class="dashboard-mini-label">Submission</span>
                <strong>View My Abstract</strong>
                <small>Open your current abstract, review notes, and feedback history.</small>
              </a>` : ""}
            </div>
          </section>

          <form method="post" action="/logout" style="margin-top: 2px;">
            <button class="btn btn-secondary" type="submit">Logout</button>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`;

    const announcements = await loadActiveAnnouncements();
    return res.status(200).send(withAnnouncementPopups(html, announcements));
  } catch (err) {
    return res.status(500).send(`Could not load student dashboard: ${err.message}`);
  }
}

async function getAbstractSubmitForm(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect("/login");
    const accountStatus = req.session?.user?.status || "Approved";
    if (accountStatus !== "Approved") return res.redirect("/dashboard");

    const existing = await abstractDao.getAbstractByStudentId(userId);
    if (isAbstractComplete(existing)) {
      return res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Submit Abstract • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/student/abstract">View My Abstract</a>
        <a class="btn btn-secondary" href="/dashboard">Back</a>
      </div>
    </header>
    <main class="page">
      <section class="card">
        <h1 class="card-title">Abstract Locked</h1>
        <p class="muted">This abstract has a final status and is complete. Students can no longer change it.</p>
        <div style="margin-top:14px;"><a class="btn" href="/student/abstract">View Final Status</a></div>
      </section>
    </main>
  </body>
</html>`);
    }

    const title = escapeHtml(existing?.title || "");
    const description = escapeHtml(existing?.description || "");
    const subjectArea = escapeHtml(existing?.studentField || "");
    const presentationType = String(existing?.presentationType || "Poster");
    const submissionState = String(existing?.submissionState || "Draft");
    const lastUpdated = existing?.lastUpdated
      ? escapeHtml(new Date(existing.lastUpdated).toLocaleString())
      : "";

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Submit Abstract • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
        <a class="btn btn-secondary" href="/dashboard">Back</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <div class="dashboard-shell">
          <section class="dashboard-hero hero-student">
            <span class="dashboard-kicker">Abstract Workspace</span>
            <h1>${existing ? "Edit Your Abstract" : "Start Your Abstract"}</h1>
            <p>Use Save Draft to keep your work in progress, then come back later and submit when you are ready.</p>
            <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
              <span class="badge ${submissionState === "Draft" ? "badge-draft" : "badge-submitted"}">${escapeHtml(submissionState)}</span>
              ${lastUpdated ? `<span class="badge">Updated ${lastUpdated}</span>` : ""}
            </div>
          </section>

          <form class="form" method="post" action="/student/abstract/submit" aria-label="submit-abstract-form">
            <label class="label">
              <span>Title</span>
              <input class="input" type="text" name="title" value="${title}" />
            </label>

            <label class="label">
              <span>Description</span>
              <textarea class="input" name="description" rows="8">${description}</textarea>
            </label>

            <label class="label">
              <span>Subject Area</span>
              <input class="input" type="text" name="subjectArea" value="${subjectArea}" placeholder="Ex. Biology, Computer Science, Sociology" />
            </label>

            <label class="label">
              <span>Type of Abstract</span>
              <select class="input" name="presentationType">
                <option value="Poster" ${presentationType === "Poster" ? "selected" : ""}>Poster</option>
                <option value="Oral" ${presentationType === "Oral" ? "selected" : ""}>Oral Presentation</option>
              </select>
            </label>

            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
              <button class="btn btn-secondary" type="submit" name="intent" value="draft">Save Draft</button>
              <button class="btn" type="submit" name="intent" value="submit">Submit Abstract</button>
            </div>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Could not load abstract form: ${err.message}`);
  }
}

async function postAbstractSubmit(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect("/login");
    const accountStatus = req.session?.user?.status || "Approved";
    if (accountStatus !== "Approved") return res.redirect("/dashboard");

    const existing = await abstractDao.getAbstractByStudentId(userId);
    if (isAbstractComplete(existing)) return res.status(400).send("Could not submit abstract: this abstract is complete and can no longer be changed by the student");

    const intent = String(req.body?.intent || "submit").trim().toLowerCase();
    const title = String(req.body?.title || "").trim();
    const description = String(req.body?.description || "").trim();

    if (intent !== "draft" && (!title || !description)) {
      if (shouldUseMockRender(res)) {
        return res.render("abstract-submit", { error: "Title and description are required." });
      }
      return res.status(400).send("Could not submit abstract: title is required");
    }

    if (intent === "draft") {
      const draftFn = abstractDao.saveStudentAbstractDraft || abstractDao.upsertStudentAbstract;
      await draftFn(userId, {
        title: req.body?.title,
        description: req.body?.description,
        subjectArea: req.body?.subjectArea,
        presentationType: req.body?.presentationType,
        submissionState: "Draft"
      });
    } else {
      // compatibility across older and newer DAO/test names
      const saveFn = abstractDao.upsertStudentAbstract || abstractDao.saveStudentAbstract || abstractDao.submitStudentAbstract;
      await saveFn(userId, {
        title: req.body?.title,
        description: req.body?.description,
        subjectArea: req.body?.subjectArea,
        presentationType: req.body?.presentationType,
        submissionState: "Submitted"
      });
    }

    return res.redirect("/dashboard");
  } catch (err) {
    if (shouldUseMockRender(res)) {
      return res.render("abstract-submit", { error: `Could not submit abstract: ${err.message}` });
    }
    return res.status(400).send(`Could not submit abstract: ${err.message}`);
  }
}

async function getStudentAbstractView(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect("/login");

    const abs = await abstractDao.getAbstractByStudentId(userId);

    if (!abs) {
      const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Abstract • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
        <a class="btn btn-secondary" href="/dashboard">Back</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <h1 class="card-title">My Abstract</h1>
        <p class="muted">You have not submitted an abstract yet.</p>
      </section>
    </main>
  </body>
</html>`;
      return res.status(200).send(html);
    }

    const title = escapeHtml(abs.title || "");
    const description = escapeHtml(abs.description || "");
    const presentationType = escapeHtml(abs.presentationType || "");
    const finalStatus = escapeHtml(abs.finalStatus || "Pending");
    const abstractComplete = isAbstractComplete(abs);
    const completedAt = abs.completedAt ? escapeHtml(new Date(abs.completedAt).toLocaleString()) : "";
    const lastUpdated = abs.lastUpdated ? escapeHtml(new Date(abs.lastUpdated).toLocaleString()) : "";
    const feedbackRows = (abs.feedbackHistory || [])
      .map((f) => {
        const date = f.date ? escapeHtml(new Date(f.date).toLocaleString()) : "";
        return `<tr>
          <td>${date}</td>
          <td>${escapeHtml(f.reviewerName || "")}</td>
          <td>${escapeHtml(f.decision || "Comment")}</td>
          <td>${escapeHtml(f.comment || "")}</td>
        </tr>`;
      })
      .join("");

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Abstract • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
        <a class="btn btn-secondary" href="/dashboard">Back</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <h1 class="card-title">My Abstract</h1>

        <div class="kv">
          <div><span class="muted">Type:</span> ${presentationType}</div>
          <div><span class="muted">Final Status:</span> <strong>${finalStatus}</strong></div>
          <div><span class="muted">Last Updated:</span> ${lastUpdated}</div>
          ${completedAt ? `<div><span class="muted">Completed:</span> ${completedAt}</div>` : ""}
        </div>

        <hr class="divider" />

        <h2 style="margin: 0 0 8px 0;">${title}</h2>
        <p style="white-space: pre-wrap;">${description}</p>

        <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          ${abstractComplete ? `<span class="badge badge-${finalStatus.toLowerCase()}">Complete</span><span class="muted">This abstract can no longer be changed by the student.</span>` : `<a class="btn" href="/student/abstract/submit">Edit / Resubmit</a>`}
        </div>

        <hr class="divider" />

        <h2 style="margin: 0 0 8px 0;">Feedback History</h2>
        <div class="table-wrap">
          <table class="table" aria-label="feedback history">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reviewer</th>
                <th>Decision</th>
                <th>Feedback</th>
              </tr>
            </thead>
            <tbody>
              ${feedbackRows || `<tr><td colspan="4" class="muted">No feedback yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Could not load abstract: ${err.message}`);
  }
}


async function getReviewerApplication(req, res) {
  try {
    const reviewerId = req.session?.user?.id;
    if (!reviewerId) return res.redirect('/login');
    const accountStatus = req.session?.user?.status || 'Approved';
    if (accountStatus !== 'Approved') return res.redirect('/dashboard');

    const application = await getApplicationByReviewerId(reviewerId);

    if (!application) {
      return sendView(res, "reviewer-application.html");
    }

    if (application.status === 'Approved' || application.status === 'Denied') {
      return res.redirect('/dashboard');
    }

    const roles = (application.roles || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>My Reviewer Application • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
        <a class="btn btn-secondary" href="/dashboard">Back</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <div class="dashboard-shell">
          <section class="dashboard-hero hero-reviewer">
            <span class="dashboard-kicker">Application Status</span>
            <h1>My Reviewer Application</h1>
            <p>Your application has been submitted and is currently view-only.</p>
            <div style="margin-top:14px;"><span class="badge badge-pending">Pending</span></div>
          </section>

          <section class="dashboard-grid" style="grid-template-columns: 1fr 1fr;">
            <div class="tile tile-accent-reviewer"><h2>Applicant Name</h2><p>${escapeHtml(application.name || '')}</p></div>
            <div class="tile tile-accent-reviewer"><h2>Email</h2><p>${escapeHtml(application.email || '')}</p></div>
            <div class="tile tile-accent-reviewer"><h2>Department</h2><p>${escapeHtml(application.department || '')}</p></div>
            <div class="tile tile-accent-reviewer"><h2>Volunteer Roles</h2><ul style="margin:0; padding-left:18px;">${roles}</ul></div>
          </section>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Could not load reviewer application: ${err.message}`);
  }
}



async function postReviewerApplication(req, res) {
  try {
    const reviewerId = req.session.user.id;
    const accountStatus = req.session?.user?.status || 'Approved';
    if (accountStatus !== 'Approved') return res.redirect('/dashboard');
    const existing = await getApplicationByReviewerId(reviewerId);
    if (existing) {
      return res.status(400).send("Application already submitted.");
    }

    const roles = req.body?.roles;

    await createReviewerApplicationOnce(reviewerId, {
      name: req.body?.name,
      roles,
      department: req.body?.department,
      email: req.body?.email
    });

    return res.redirect("/dashboard");
  } catch (err) {
    return res.status(400).send(`Could not submit application: ${err.message}`);
  }
}

async function getReviewerAssignedAbstractView(req, res) {
  try {
    const reviewerId = req.session?.user?.id;
    if (!reviewerId) return res.redirect("/login");

    const assignedAbstracts = abstractDao.getAssignedAbstractsByReviewerId
      ? await abstractDao.getAssignedAbstractsByReviewerId(reviewerId)
      : await abstractDao.getAssignedAbstractByReviewerId(reviewerId).then((item) => item ? [item] : []);
    const assignedList = Array.isArray(assignedAbstracts) ? assignedAbstracts : [];

    if (!assignedList.length) {
      return res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Assigned Abstracts • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/dashboard">Back</a>
      </div>
    </header>
    <main class="page">
      <section class="card">
        <h1 class="card-title">Assigned Abstracts</h1>
        <p class="muted">No abstract has been assigned to you.</p>
      </section>
    </main>
  </body>
</html>`);
    }

    const requestedId = String(req.params?.id || req.query?.abstractId || "").trim();
    const abs = assignedList.find((item) => String(item._id) === requestedId) || assignedList[0];
    const assignedAt = abs.assignedAt ? escapeHtml(new Date(abs.assignedAt).toLocaleString()) : "";
    const pendingFeedback = Array.isArray(abs.pendingFeedback) ? abs.pendingFeedback : [];
    const feedbackDraft = abs.feedbackDraft || null;
    const abstractComplete = isAbstractComplete(abs);
    const draftComment = escapeHtml(feedbackDraft?.comment || "");
    const draftUpdated = feedbackDraft?.lastUpdated ? escapeHtml(new Date(feedbackDraft.lastUpdated).toLocaleString()) : "";
    const queueLinks = assignedList.map((item) => {
      const itemPending = Array.isArray(item.pendingFeedback) && item.pendingFeedback.length > 0;
      const itemComplete = isAbstractComplete(item);
      const itemDraft = Boolean(item.feedbackDraft);
      const badge = itemComplete
        ? `<span class="badge badge-${escapeHtml(String(item.finalStatus || "pending").toLowerCase())}">Complete</span>`
        : itemPending
          ? `<span class="badge badge-pending">Pending</span>`
          : itemDraft
            ? `<span class="badge badge-draft">Draft</span>`
            : `<span class="badge">Ready</span>`;
      return `<div style="display:flex; justify-content:space-between; gap:10px; align-items:center; border:1px solid #e5e7eb; border-radius:10px; padding:10px 12px; ${String(item._id) === String(abs._id) ? 'background:#f8fafc;' : ''}">
        <div>
          <a href="/reviewer/abstract/${escapeHtml(item._id)}"><strong>${escapeHtml(item.title || "Untitled Abstract")}</strong></a>
          <div class="muted" style="margin-top:4px;">${escapeHtml(item.studentName || "Student")}</div>
        </div>
        <div>${badge}</div>
      </div>`;
    }).join("");
    const completionBanner = abstractComplete
      ? `<div style="margin:12px 0 0 0;"><span class="badge badge-${escapeHtml(String(abs.finalStatus || "pending").toLowerCase())}">Final Status: ${escapeHtml(abs.finalStatus || "Pending")}</span></div>`
      : pendingFeedback.length > 0
        ? `<div style="margin:12px 0 0 0;"><span class="badge badge-pending">Feedback Pending Committee Approval</span></div>`
        : feedbackDraft
          ? `<div style="margin:12px 0 0 0; display:flex; gap:8px; flex-wrap:wrap; align-items:center;"><span class="badge badge-draft">Draft Saved</span>${draftUpdated ? `<span class="muted">Updated ${draftUpdated}</span>` : ""}</div>`
          : "";
    const releaseRows = (Array.isArray(abs.feedbackHistory) ? abs.feedbackHistory : [])
      .map((item) => `
          <tr>
            <td>${escapeHtml(item.date ? new Date(item.date).toLocaleString() : "")}</td>
            <td>${escapeHtml(item.decision || "")}</td>
            <td>${escapeHtml(item.comment || "")}</td>
          </tr>`)
      .join("");

    const feedbackForm = abstractComplete
      ? `<p class="muted">This abstract now has a final released status of <strong>${escapeHtml(abs.finalStatus || "Pending")}</strong>. No additional reviewer edits are allowed.</p>`
      : pendingFeedback.length > 0
        ? `<p class="muted">You already have feedback awaiting committee review for this abstract.</p>`
        : `<form class="form" method="post" action="/reviewer/abstract/${escapeHtml(abs._id)}/feedback">
          <label class="label"><span>Project State</span>
            <select class="input" name="decision" required>
              <option value="" ${!feedbackDraft?.decision ? "selected" : ""}>Select a state</option>
              <option value="Approved" ${feedbackDraft?.decision === "Approved" ? "selected" : ""}>Approved</option>
              <option value="Work In Progress" ${feedbackDraft?.decision === "Work In Progress" ? "selected" : ""}>Work In Progress</option>
              <option value="Denied" ${feedbackDraft?.decision === "Denied" ? "selected" : ""}>Denied</option>
            </select>
          </label>
          <label class="label"><span>Feedback</span><textarea class="input" name="comment" rows="8" required>${draftComment}</textarea></label>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
            <button class="btn btn-secondary" type="submit" name="intent" value="draft">Save Draft</button>
            <button class="btn" type="submit" name="intent" value="submit">Submit Feedback</button>
          </div>
        </form>`;

    return res.status(200).send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Assigned Abstracts • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/dashboard">Back</a>
      </div>
    </header>
    <main class="page">
      <section class="card">
        <div style="display:grid; grid-template-columns:minmax(260px, 320px) 1fr; gap:20px; align-items:start;">
          <aside>
            <h1 class="card-title" style="margin-bottom:10px;">Review Queue</h1>
            <p class="muted" style="margin-top:0;">Choose which assigned abstract you want to review.</p>
            <div style="display:flex; flex-direction:column; gap:10px;">${queueLinks}</div>
          </aside>
          <div>
            <h1 class="card-title">Assigned Abstract</h1>
            <div class="kv">
              <div><span class="muted">Student:</span> ${escapeHtml(abs.studentName || "")}</div>
              <div><span class="muted">Field:</span> ${escapeHtml(abs.studentField || "")}</div>
              <div><span class="muted">Type:</span> ${escapeHtml(abs.presentationType || "")}</div>
              <div><span class="muted">Assigned:</span> ${assignedAt}</div>
            </div>
            ${completionBanner}
            <hr class="divider" />
            <h2 style="margin: 0 0 8px 0;">${escapeHtml(abs.title || "")}</h2>
            <p style="white-space: pre-wrap;">${escapeHtml(abs.description || "")}</p>

            <hr class="divider" />
            <h2 style="margin: 0 0 8px 0;">Review Feedback</h2>
            <p class="muted" style="margin-top:0;">Your feedback is sent to committee members first. They must approve it before the student can view it.</p>
            ${feedbackForm}

            <hr class="divider" />
            <h2 style="margin: 0 0 8px 0;">Released Feedback History</h2>
            <div class="table-wrap">
              <table class="table" aria-label="released feedback history">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Decision</th>
                    <th>Feedback</th>
                  </tr>
                </thead>
                <tbody>
                  ${releaseRows || `<tr><td colspan="3" class="muted">No released feedback yet.</td></tr>`}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </main>
  </body>
</html>`);
  } catch (err) {
    return res.status(500).send(`Could not load assigned abstract: ${err.message}`);
  }
}

async function postReviewerSubmitFeedback(req, res) {
  try {
    const reviewerId = req.session?.user?.id;
    if (!reviewerId) return res.redirect("/login");

    const intent = String(req.body?.intent || "submit").trim().toLowerCase();
    if (intent === "draft") {
      await abstractDao.saveReviewerFeedbackDraft(req.params.id, reviewerId, {
        decision: req.body?.decision,
        comment: req.body?.comment
      });
    } else {
      await abstractDao.submitReviewerFeedback(req.params.id, reviewerId, {
        decision: req.body?.decision,
        comment: req.body?.comment
      });
    }
    return res.redirect(`/reviewer/abstract/${req.params.id}`);
  } catch (err) {
    return res.status(400).send(`Could not save feedback: ${err.message}`);
  }
}

function getAbstractManagementBasePath(req) {
  return req.session?.user?.accountType === "Admin" ? "/admin/abstracts" : "/committee/abstracts";
}

function getAbstractManagementRoleLabel(req) {
  return req.session?.user?.accountType === "Admin" ? "Admin" : "Committee";
}

async function getAbstractManagementPage(req, res) {
  try {
    const abstracts = abstractDao.getAllAbstracts ? await abstractDao.getAllAbstracts() : [];
    const basePath = getAbstractManagementBasePath(req);
    const roleLabel = getAbstractManagementRoleLabel(req);

    const rows = abstracts
      .map((abs) => {
        const id = escapeHtml(abs._id);
        const assignment = String(abs.assignmentStatus || "Unassigned") === "Assigned"
          ? `<span class="badge badge-approved">Assigned</span><div class="muted" style="margin-top:6px;">${escapeHtml(abs.assignedReviewerName || "")}</div>`
          : `<span class="badge badge-pending">Unassigned</span>`;

        return `
          <tr>
            <td>${escapeHtml(abs.studentName || "")}</td>
            <td>${escapeHtml(abs.studentField || "")}</td>
            <td>${escapeHtml(abs.title || "")}</td>
            <td>${escapeHtml(abs.presentationType || "")}</td>
            <td>${escapeHtml(abs.submissionState || "")}</td>
            <td>${escapeHtml(abs.finalStatus || "")}</td>
            <td>${assignment}</td>
            <td>
              <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <a class="btn btn-secondary" href="${basePath}/${id}/edit">Edit</a>
                <form method="post" action="${basePath}/${id}/delete" style="margin:0;" onsubmit="return confirm('Delete this abstract? This cannot be undone.');">
                  <button class="btn btn-danger" type="submit">Delete</button>
                </form>
              </div>
            </td>
          </tr>
        `;
      })
      .join("");

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Manage Abstracts • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/announcements/manage">Manage Announcements</a>
        <a class="btn btn-secondary" href="/dashboard">Back to Dashboard</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <h1 class="card-title">Manage Abstracts</h1>
        <p class="muted" style="margin-top:0;">${roleLabel} users can manually update or delete any abstract in the system.</p>
        <div class="table-wrap">
          <table class="table" aria-label="all abstracts table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Subject Area</th>
                <th>Title</th>
                <th>Type</th>
                <th>Submission State</th>
                <th>Final Status</th>
                <th>Assignment</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="8" class="muted">No abstracts found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Could not load abstracts: ${err.message}`);
  }
}

async function getAbstractEditForm(req, res) {
  try {
    const abs = await abstractDao.getAbstractById(req.params.id);
    if (!abs) return res.status(404).send("Abstract not found");

    const basePath = getAbstractManagementBasePath(req);
    const assignmentDetails = String(abs.assignmentStatus || "Unassigned") === "Assigned"
      ? `Assigned to ${escapeHtml(abs.assignedReviewerName || "Reviewer")}`
      : "Unassigned";

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Edit Abstract • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="${basePath}" aria-label="abstracts">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="${basePath}">Back to Abstracts</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <h1 class="card-title">Edit Abstract</h1>
        <p class="muted" style="margin-top:0;">Student: ${escapeHtml(abs.studentName || "")}${abs.studentField ? ` • ${escapeHtml(abs.studentField)}` : ""}</p>
        <div style="margin-bottom:14px; display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <span class="badge ${String(abs.assignmentStatus || "Unassigned") === "Assigned" ? "badge-approved" : "badge-pending"}">${escapeHtml(abs.assignmentStatus || "Unassigned")}</span>
          <span class="muted">${assignmentDetails}</span>
        </div>
        <form class="form" method="post" action="${basePath}/${escapeHtml(abs._id)}/edit">
          <label class="label"><span>Title</span><input class="input" type="text" name="title" value="${escapeHtml(abs.title || "")}" /></label>
          <label class="label"><span>Description</span><textarea class="input" name="description" rows="10">${escapeHtml(abs.description || "")}</textarea></label>
          <label class="label"><span>Author</span><input class="input" type="text" name="studentName" value="${escapeHtml(abs.studentName || "")}" /></label>
          <label class="label"><span>Subject Area</span><input class="input" type="text" name="subjectArea" value="${escapeHtml(abs.studentField || "")}" /></label>
          <label class="label"><span>Presentation Type</span>
            <select class="input" name="presentationType" required>
              <option value="Poster" ${abs.presentationType === "Poster" ? "selected" : ""}>Poster</option>
              <option value="Oral" ${abs.presentationType === "Oral" ? "selected" : ""}>Oral</option>
            </select>
          </label>
          <label class="label"><span>Submission State</span>
            <select class="input" name="submissionState" required>
              <option value="Draft" ${abs.submissionState === "Draft" ? "selected" : ""}>Draft</option>
              <option value="Submitted" ${abs.submissionState === "Submitted" ? "selected" : ""}>Submitted</option>
            </select>
          </label>
          <label class="label"><span>Final Status</span>
            <select class="input" name="finalStatus" required>
              <option value="Pending" ${abs.finalStatus === "Pending" ? "selected" : ""}>Pending</option>
              <option value="Approved" ${abs.finalStatus === "Approved" ? "selected" : ""}>Approved</option>
              <option value="Denied" ${abs.finalStatus === "Denied" ? "selected" : ""}>Denied</option>
            </select>
          </label>
          <p class="muted" style="margin-top:0;">Changing an abstract to Draft will automatically clear any current reviewer assignment.</p>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="btn" type="submit">Save Changes</button>
            <a class="btn btn-secondary" href="${basePath}">Cancel</a>
          </div>
        </form>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(400).send(`Could not load abstract: ${err.message}`);
  }
}

async function postStudentAddComment(req, res) {
  try {
    const accountId = req.session?.user?.id;
    const accountType = String(req.session?.user?.accountType || "").trim();
    if (!accountId) return res.redirect("/login");
    if (["Committee", "Admin"].includes(accountType)) {
      return res.status(403).send("Committee members and admins cannot leave gallery comments");
    }
    await abstractDao.addComment(req.params.id, accountId, {
      comment: req.body?.comment
    });
    return res.redirect(`/gallery/${req.params.id}`);
  } catch (err) {
    return res.status(400).send(`Could not save comment: ${err.message}`);
  }
}

async function postAbstractEdit(req, res) {
  try {
    await abstractDao.updateAbstractById(req.params.id, {
      title: req.body?.title,
      description: req.body?.description,
      studentName: req.body?.studentName,
      subjectArea: req.body?.subjectArea,
      presentationType: req.body?.presentationType,
      submissionState: req.body?.submissionState,
      finalStatus: req.body?.finalStatus
    });
    return res.redirect(getAbstractManagementBasePath(req));
  } catch (err) {
    return res.status(400).send(`Could not update abstract: ${err.message}`);
  }
}

async function postAbstractDelete(req, res) {
  try {
    await abstractDao.deleteAbstractById(req.params.id);
    return res.redirect(getAbstractManagementBasePath(req));
  } catch (err) {
    return res.status(400).send(`Could not delete abstract: ${err.message}`);
  }
}

async function getCommitteeDashboardData() {
  const [pendingApplications, allPendingAccounts, submittedAbstracts, approvedReviewerAccounts, approvedReviewerApplications, allAbstracts] = await Promise.all([
    getApplicationsByStatus("Pending"),
    getAllStatus("Pending"),
    abstractDao.getSubmittedAbstracts ? abstractDao.getSubmittedAbstracts() : Promise.resolve([]),
    getAccountsByTypeAndStatus ? getAccountsByTypeAndStatus("Reviewer", "Approved") : Promise.resolve([]),
    getApprovedReviewerApplications ? getApprovedReviewerApplications() : Promise.resolve([]),
    abstractDao.getAllAbstracts ? abstractDao.getAllAbstracts() : Promise.resolve([])
  ]);

  const pendingAccounts = allPendingAccounts.filter((a) => a.accountType === "Student" || a.accountType === "Reviewer");
  const pendingAbstracts = submittedAbstracts.filter((a) => a.finalStatus === "Pending");
  const pendingFeedbackAbstracts = allAbstracts.filter((a) => Array.isArray(a.pendingFeedback) && a.pendingFeedback.length > 0);
  const eligibleReviewerIds = new Set(approvedReviewerApplications.map((a) => String(a.reviewerId)));
  const eligibleReviewers = approvedReviewerAccounts.filter((a) => eligibleReviewerIds.has(String(a._id)));

  return {
    pendingApplications,
    pendingAccounts,
    submittedAbstracts,
    pendingAbstracts,
    pendingFeedbackAbstracts,
    eligibleReviewers
  };
}

function renderCommitteeApplicationRows(pendingApplications) {
  return pendingApplications
    .map((a) => {
      const id = escapeHtml(a._id);
      const name = escapeHtml(a.name);
      const dept = escapeHtml(a.department);
      const email = escapeHtml(a.email);
      const roles = escapeHtml((a.roles || []).join(", "));
      return `
        <tr>
          <td>${name}</td>
          <td>${roles}</td>
          <td>${dept}</td>
          <td>${email}</td>
          <td>
            <form method="post" action="/committee/applications/${id}/approve" style="display:inline;">
              <button class="btn" type="submit">Approve</button>
            </form>
            <form method="post" action="/committee/applications/${id}/deny" style="display:inline; margin-left:8px;">
              <button class="btn btn-danger" type="submit">Deny</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCommitteeAccountRows(pendingAccounts) {
  return pendingAccounts
    .map((a) => {
      const id = escapeHtml(a._id);
      const email = escapeHtml(a.email || "");
      const type = escapeHtml(a.accountType || "");
      const subject = escapeHtml(a.subjectArea || "");
      return `
        <tr>
          <td>${email}</td>
          <td>${type}</td>
          <td>${subject}</td>
          <td>
            <form method="post" action="/committee/accounts/${id}/approve" style="display:inline;">
              <button class="btn" type="submit">Approve</button>
            </form>
            <form method="post" action="/committee/accounts/${id}/deny" style="display:inline; margin-left:8px;">
              <button class="btn btn-danger" type="submit">Deny</button>
            </form>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCommitteeAbstractRows(pendingAbstracts, eligibleReviewers) {
  const reviewerOptions = eligibleReviewers
    .map((r) => `<option value="${escapeHtml(r._id)}">${escapeHtml(r.username || r.email || "Reviewer")} (${escapeHtml(r.subjectArea || "No subject area")})</option>`)
    .join("");

  return pendingAbstracts
    .map((abs) => {
      const abstractId = escapeHtml(abs._id);
      const assigned = String(abs.assignmentStatus || "Unassigned") === "Assigned";
      return `
        <tr>
          <td>${escapeHtml(abs.studentName || "")}</td>
          <td>${escapeHtml(abs.studentField || abs.subjectArea || "")}</td>
          <td>${escapeHtml(abs.title || "")}</td>
          <td>${escapeHtml(abs.presentationType || "")}</td>
          <td>${assigned ? `<span class="badge badge-approved">Assigned</span><div class="muted" style="margin-top:6px;">${escapeHtml(abs.assignedReviewerName || "")}</div>` : `<span class="badge badge-pending">Unassigned</span>`}</td>
          <td>
            ${assigned
              ? `<div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                  <form method="post" action="/committee/abstracts/${abstractId}/unassign" style="margin:0;">
                    <button class="btn btn-danger" type="submit">Unassign</button>
                  </form>
                  <span class="muted">Unassign before reassigning.</span>
                  <form method="post" action="/committee/abstracts/${abstractId}/approvefinal" style="margin:0;">
                    <button class="btn" type="submit">Approve</button>
                  </form>
                </div>`
              : `<form method="post" action="/committee/abstracts/${abstractId}/assign" style="display:flex; gap:8px; flex-wrap:wrap; align-items:center; margin:0;">
                  <select class="input" name="reviewerId" style="min-width:240px;">
                    <option value="">Select reviewer</option>
                    ${reviewerOptions}
                  </select>
                  <button class="btn" type="submit">Assign</button>
                </form>`}
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderCommitteePendingFeedbackRows(pendingFeedbackAbstracts) {
  return pendingFeedbackAbstracts
    .map((abs) => {
      const abstractId = escapeHtml(abs._id);
      return (abs.pendingFeedback || []).map((item, index) => `
        <tr>
          <td>${escapeHtml(abs.studentName || "")}</td>
          <td>${escapeHtml(abs.title || "")}</td>
          <td>${escapeHtml(item.reviewerName || abs.assignedReviewerName || "Reviewer")}</td>
          <td>${escapeHtml(item.decision || "")}</td>
          <td style="white-space: pre-wrap;">${escapeHtml(item.comment || "")}</td>
          <td>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <form method="post" action="/committee/abstracts/${abstractId}/feedback/${index}/approve" style="margin:0;">
                <button class="btn" type="submit">Release to Student</button>
              </form>
              <form method="post" action="/committee/abstracts/${abstractId}/feedback/${index}/deny" style="margin:0;">
                <button class="btn btn-danger" type="submit">Deny Release</button>
              </form>
            </div>
          </td>
        </tr>
      `).join("");
    })
    .join("");
}

async function getCommitteeDashboard(req, res) {
  try {
    const { pendingApplications, pendingAccounts, submittedAbstracts, pendingFeedbackAbstracts, eligibleReviewers } = await getCommitteeDashboardData();
    const pendingFeedbackCount = pendingFeedbackAbstracts.reduce((sum, abs) => sum + ((abs.pendingFeedback || []).length), 0);

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Committee Dashboard • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/" aria-label="home">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <div class="dashboard-shell">
          <section class="dashboard-hero hero-committee committee-hero-clean">
            <div class="committee-hero-copy">
              <span class="dashboard-kicker">Committee Review</span>
              <h1>Committee Dashboard</h1>
              <p>Open the specific queue you need without crowding the landing page. Priority counts stay visible here, while the detailed work remains inside each management area.</p>
            </div>
            <div class="committee-hero-stats" aria-label="committee summary">
              <div class="committee-stat-pill">
                <span class="committee-stat-label">Submitted</span>
                <strong>${submittedAbstracts.length}</strong>
              </div>
              <div class="committee-stat-pill">
                <span class="committee-stat-label">Feedback</span>
                <strong>${pendingFeedbackCount}</strong>
              </div>
              <div class="committee-stat-pill">
                <span class="committee-stat-label">Reviewers</span>
                <strong>${eligibleReviewers.length}</strong>
              </div>
            </div>
          </section>

          <section class="committee-quick-links" aria-label="committee quick links">
            <a class="committee-quick-link committee-quick-link-primary" href="/committee/abstracts">Manage Abstracts</a>
            <a class="committee-quick-link" href="/committee/applications">Review Applications</a>
            <a class="committee-quick-link" href="/committee/accounts">Pending Accounts</a>
            <a class="committee-quick-link" href="/committee/feedback">Review Feedback</a>
          </section>

          <section class="dashboard-grid committee-dashboard-grid-clean">
            <div class="tile tile-accent-committee committee-feature-tile">
              <div class="committee-tile-topline">
                <h2>Manage Abstracts</h2>
                <span class="badge badge-pending">${submittedAbstracts.length} Submitted</span>
              </div>
              <p>Assign reviewers, reassign submissions, and maintain abstract records from one focused queue.</p>
              <div class="committee-tile-actions"><a class="btn btn-secondary" href="/committee/abstracts">Open Queue</a></div>
            </div>
            <div class="tile tile-accent-committee committee-feature-tile">
              <div class="committee-tile-topline">
                <h2>Review Applications</h2>
                <span class="badge badge-pending">${pendingApplications.length} Pending</span>
              </div>
              <p>Approve or deny reviewer volunteer applications when you are ready to process them.</p>
              <div class="committee-tile-actions"><a class="btn btn-secondary" href="/committee/applications">Open Queue</a></div>
            </div>
            <div class="tile tile-accent-committee committee-feature-tile">
              <div class="committee-tile-topline">
                <h2>Pending Accounts</h2>
                <span class="badge badge-pending">${pendingAccounts.length} Pending</span>
              </div>
              <p>Review student and reviewer account requests without mixing them into the rest of the dashboard.</p>
              <div class="committee-tile-actions"><a class="btn btn-secondary" href="/committee/accounts">Open Queue</a></div>
            </div>
            <div class="tile tile-accent-committee committee-feature-tile">
              <div class="committee-tile-topline">
                <h2>Review Feedback</h2>
                <span class="badge badge-pending">${pendingFeedbackCount} Pending</span>
              </div>
              <p>Approve reviewer feedback for release to students, or deny it before it becomes visible.</p>
              <div class="committee-tile-actions"><a class="btn btn-secondary" href="/committee/feedback">Open Queue</a></div>
            </div>
          </section>

          <section class="committee-secondary-panel">
            <div class="committee-secondary-header">
              <div>
                <h2>Additional Tools</h2>
                <p class="muted">Supporting actions are grouped here so the main dashboard stays focused on active queues.</p>
              </div>
            </div>
            <div class="committee-secondary-grid">
              <a class="committee-mini-card" href="/committee/info">
                <span class="committee-mini-label">Profile</span>
                <strong>My Info</strong>
                <small>Update your public committee details.</small>
              </a>
              <a class="committee-mini-card" href="/gallery">
                <span class="committee-mini-label">Gallery</span>
                <strong>Approved Gallery</strong>
                <small>View published abstracts and past winners.</small>
              </a>
              <a class="committee-mini-card" href="/announcements/create">
                <span class="committee-mini-label">Announcements</span>
                <strong>Create Announcement</strong>
                <small>Post time-limited notices for all users.</small>
              </a>
              <a class="committee-mini-card" href="/announcements/manage">
                <span class="committee-mini-label">Announcements</span>
                <strong>Manage Yours</strong>
                <small>Edit, end, or review your active notices.</small>
              </a>
            </div>
          </section>

          <form method="post" action="/logout" style="margin-top: 2px;">
            <button class="btn btn-secondary" type="submit">Logout</button>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`;

    const announcements = await loadActiveAnnouncements();
    return res.status(200).send(withAnnouncementPopups(html, announcements));
  } catch (err) {
    return res.status(500).send(`Could not load dashboard: ${err.message}`);
  }
}

async function getCommitteeApplicationsPage(req, res) {
  try {
    const { pendingApplications } = await getCommitteeDashboardData();
    const applicationRows = renderCommitteeApplicationRows(pendingApplications);
    const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Review Applications • Abstract Portal</title><link rel="stylesheet" href="/css/styles.css" /></head>
<body>
<header class="topbar" aria-label="topbar"><a class="brand" href="/dashboard" aria-label="home"><div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div><span class="brand-name">Abstract Portal</span></a><div class="topbar-actions"><a class="btn btn-secondary" href="/dashboard">Dashboard</a></div></header>
<main class="page"><section class="card"><div class="dashboard-shell"><h1>Review Applications</h1><p class="muted" style="margin-top:0;">Pending reviewer volunteer applications are listed here.</p><div class="table-wrap"><table class="table" aria-label="pending applications"><thead><tr><th>Name</th><th>Roles</th><th>Department</th><th>Email</th><th>Decision</th></tr></thead><tbody>${applicationRows || `<tr><td colspan="5" class="muted">No pending applications.</td></tr>`}</tbody></table></div></div></section></main>
</body></html>`;
    const announcements = await loadActiveAnnouncements();
    return res.status(200).send(withAnnouncementPopups(html, announcements));
  } catch (err) {
    return res.status(500).send(`Could not load applications: ${err.message}`);
  }
}

async function getCommitteeAccountsPage(req, res) {
  try {
    const { pendingAccounts } = await getCommitteeDashboardData();
    const accountRows = renderCommitteeAccountRows(pendingAccounts);
    const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Pending Accounts • Abstract Portal</title><link rel="stylesheet" href="/css/styles.css" /></head>
<body>
<header class="topbar" aria-label="topbar"><a class="brand" href="/dashboard" aria-label="home"><div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div><span class="brand-name">Abstract Portal</span></a><div class="topbar-actions"><a class="btn btn-secondary" href="/dashboard">Dashboard</a></div></header>
<main class="page"><section class="card"><div class="dashboard-shell"><h1>Pending Student & Reviewer Accounts</h1><p class="muted" style="margin-top:0;">Only student and reviewer accounts can be approved here.</p><div class="table-wrap"><table class="table" aria-label="pending user accounts"><thead><tr><th>Email</th><th>Type</th><th>Subject Area</th><th>Decision</th></tr></thead><tbody>${accountRows || `<tr><td colspan="4" class="muted">No pending accounts.</td></tr>`}</tbody></table></div></div></section></main>
</body></html>`;
    const announcements = await loadActiveAnnouncements();
    return res.status(200).send(withAnnouncementPopups(html, announcements));
  } catch (err) {
    return res.status(500).send(`Could not load accounts: ${err.message}`);
  }
}

async function getCommitteeFeedbackPage(req, res) {
  try {
    const { pendingFeedbackAbstracts } = await getCommitteeDashboardData();
    const pendingFeedbackRows = renderCommitteePendingFeedbackRows(pendingFeedbackAbstracts);
    const html = `<!doctype html>
<html lang="en"><head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" /><title>Review Feedback • Abstract Portal</title><link rel="stylesheet" href="/css/styles.css" /></head>
<body>
<header class="topbar" aria-label="topbar"><a class="brand" href="/dashboard" aria-label="home"><div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div><span class="brand-name">Abstract Portal</span></a><div class="topbar-actions"><a class="btn btn-secondary" href="/dashboard">Dashboard</a></div></header>
<main class="page"><section class="card"><div class="dashboard-shell"><h1>Pending Reviewer Feedback</h1><p class="muted" style="margin-top:0;">Reviewer feedback is hidden from students until a committee member approves its release.</p><div class="table-wrap"><table class="table" aria-label="pending reviewer feedback"><thead><tr><th>Student</th><th>Abstract</th><th>Reviewer</th><th>Decision</th><th>Feedback</th><th>Actions</th></tr></thead><tbody>${pendingFeedbackRows || `<tr><td colspan="6" class="muted">No reviewer feedback is waiting for committee review.</td></tr>`}</tbody></table></div></div></section></main>
</body></html>`;
    const announcements = await loadActiveAnnouncements();
    return res.status(200).send(withAnnouncementPopups(html, announcements));
  } catch (err) {
    return res.status(500).send(`Could not load reviewer feedback: ${err.message}`);
  }
}

async function postCommitteeAssignAbstract(req, res) {
  try {
    const reviewerId = String(req.body?.reviewerId || "").trim();
    if (!reviewerId) return res.status(400).send("Could not assign abstract: reviewerId is required");
    await abstractDao.assignAbstractToReviewer(req.params.id, reviewerId);
    return res.redirect("/committee/abstracts");
  } catch (err) {
    return res.status(400).send(`Could not assign abstract: ${err.message}`);
  }
}

async function postCommitteeUnassignAbstract(req, res) {
  try {
    await abstractDao.unassignAbstract(req.params.id);
    return res.redirect("/committee/abstracts");
  } catch (err) {
    return res.status(400).send(`Could not unassign abstract: ${err.message}`);
  }
}

async function postCommitteeApproveAbstract(req, res) {
  try {
    await abstractDao.setFinalApproval(req.params.id, "Approved")
    return res.redirect("/committee/abstracts");
  } catch (err) {
    return res.status(400).send(`Could not approve abstract: ${err.message}`);
  }
}

async function postCommitteeApproveReviewerFeedback(req, res) {
  try {
    await abstractDao.approveReviewerFeedback(req.params.id, req.params.index);
    return res.redirect("/committee/feedback");
  } catch (err) {
    return res.status(400).send(`Could not approve reviewer feedback: ${err.message}`);
  }
}

async function postCommitteeDenyReviewerFeedback(req, res) {
  try {
    await abstractDao.denyReviewerFeedback(req.params.id, req.params.index);
    return res.redirect("/committee/feedback");
  } catch (err) {
    return res.status(400).send(`Could not deny reviewer feedback: ${err.message}`);
  }
}

async function postCommitteeApproveApplication(req, res) {
  try {
    await setApplicationStatus(req.params.id, "Approved");
    return res.redirect("/committee/applications");
  } catch (err) {
    return res.status(400).send(`Could not approve application: ${err.message}`);
  }
}

async function postCommitteeDenyApplication(req, res) {
  try {
    await setApplicationStatus(req.params.id, "Denied");
    return res.redirect("/committee/applications");
  } catch (err) {
    return res.status(400).send(`Could not deny application: ${err.message}`);
  }
}

async function postCommitteeApproveAccount(req, res) {
  try {
    const account = await getAccountById(req.params.id);
    if (!account || !["Student", "Reviewer"].includes(account.accountType)) {
      return res.status(403).send("Committee members can only approve student and reviewer accounts.");
    }
    await setAccountStatus(req.params.id, "Approved");
    return res.redirect(req.session?.user?.accountType === "Admin" ? "/admin/accounts" : "/committee/accounts");
  } catch (err) {
    return res.status(400).send(`Could not approve account: ${err.message}`);
  }
}

async function postCommitteeDenyAccount(req, res) {
  try {
    const account = await getAccountById(req.params.id);
    if (!account || !["Student", "Reviewer"].includes(account.accountType)) {
      return res.status(403).send("Committee members can only deny student and reviewer accounts.");
    }
    await setAccountStatus(req.params.id, "Denied");
    return res.redirect(req.session?.user?.accountType === "Admin" ? "/admin/accounts" : "/committee/accounts");
  } catch (err) {
    return res.status(400).send(`Could not deny account: ${err.message}`);
  }
}



function getCommitteeInfoForm(req, res) {
  return sendView(res, "committee-info-form.html");
}

async function postCommitteeInfoForm(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect("/login");

    const updated = await updateCommitteeInfo(userId, {
      name: req.body.name,
      loyolaEmail: req.body.loyolaEmail,
      departmentArea: req.body.departmentArea,
      description: req.body.description
    });

    // Keep session in sync (optional fields)
    if (updated?.committeeInfo) {
      req.session.user.committeeInfo = updated.committeeInfo;
    }

    return res.redirect("/dashboard");
  } catch (err) {
    return res.status(400).send(`Could not save committee info: ${err.message}`);
  }
}

async function getCommitteeMembersPage(req, res) {
  try {
    const committee = await getCommitteeMemberInfoList();

    const rows = committee
      .filter((a) => a.accountType === "Committee")
      .map((a) => {
        const info = a.committeeInfo || {};
        const name = escapeHtml(info.name || "");
        const email = escapeHtml(info.loyolaEmail || a.email || "");
        const dept = escapeHtml(info.departmentArea || "");
        const desc = escapeHtml(info.description || "");

        return `
          <tr>
            <td>${name || `<span class="muted">(not provided)</span>`}</td>
            <td>${email || `<span class="muted">(not provided)</span>`}</td>
            <td>${dept || `<span class="muted">(not provided)</span>`}</td>
            <td>${desc || `<span class="muted">(not provided)</span>`}</td>
          </tr>
        `;
      })
      .join("");

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Committee Member Info • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <span style="margin-left:14px;">
        <a class="btn btn-secondary" href="/dashboard">Back to Dashboard</a>
      </span>
    </header>

    <main class="page">
      <section class="card">
        <h1 class="card-title">Committee Member Info</h1>
        <p class="muted" style="margin-top:0;">Public contact information provided by committee members.</p>

        <div class="table-wrap">
          <table class="table" aria-label="committee member info">
            <thead>
              <tr>
                <th>Name</th>
                <th>Loyola Email</th>
                <th>Department Area</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="4" class="muted">No committee members found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Could not load committee members: ${err.message}`);
  }
}


async function getHistoricWinnerCreateForm(req, res) {
  try {
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Add Historic Winner • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/gallery" aria-label="gallery">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/gallery">Back to Gallery</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <h1 class="card-title">Add Historic Winner</h1>
        <p class="muted" style="margin-top:0;">Committee members and admins can manually add past winning abstracts to the gallery.</p>
        <form class="form" method="post" action="/gallery/historic/add">
          <label class="label"><span>Title</span><input class="input" type="text" name="title" required /></label>
          <label class="label"><span>Author</span><input class="input" type="text" name="studentName" required /></label>
          <label class="label"><span>Subject Area</span><input class="input" type="text" name="subjectArea" /></label>
          <label class="label"><span>Description</span><textarea class="input" name="description" rows="8" required></textarea></label>
          <label class="label"><span>Presentation Type</span>
            <select class="input" name="presentationType" required>
              <option value="Poster">Poster</option>
              <option value="Oral">Oral Presentation</option>
            </select>
          </label>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
            <button class="btn" type="submit">Add Historic Winner</button>
            <a class="btn btn-secondary" href="/gallery">Cancel</a>
          </div>
        </form>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Could not load historic winner form: ${err.message}`);
  }
}

async function postHistoricWinnerCreate(req, res) {
  try {
    await abstractDao.createHistoricWinner({
      title: req.body?.title,
      studentName: req.body?.studentName,
      subjectArea: req.body?.subjectArea,
      description: req.body?.description,
      presentationType: req.body?.presentationType
    });
    return res.redirect('/gallery');
  } catch (err) {
    return res.status(400).send(`Could not add historic winner: ${err.message}`);
  }
}

async function getAbstractGalleryPage(req, res) {
  try {
    const titleQuery = String(req.query?.q || "").trim();
    const typeQuery = String(req.query?.f || "").trim();
    const abstracts = abstractDao.getApprovedGalleryAbstracts ? await abstractDao.getApprovedGalleryAbstracts(titleQuery, typeQuery) : [];
    const rows = abstracts
      .map((abs) => `
        <tr>
          <td><a href="/gallery/${escapeHtml(abs._id)}">${escapeHtml(abs.title || "Untitled Abstract")}</a></td>
          <td>${escapeHtml(abs.studentName || "Unknown Author")}</td>
          <td>${escapeHtml(abs.presentationType || "")}</td>
        </tr>
      `)
      .join("");
    const types = abstracts
      .map((abs) => `
        <option value="${escapeHtml(abs.presentationType)}">${escapeHtml(abs.presentationType)}</option>
      `)
      .join("");
    const previousWinners = abstractDao.getPreviousWinners ? await abstractDao.getPreviousWinners(titleQuery) : [];
    const rowsP = previousWinners
      .map((abs) => `
        <tr>
          <td><a href="/gallery/${escapeHtml(abs._id)}">${escapeHtml(abs.title || "Untitled Abstract")}</a></td>
          <td>${escapeHtml(abs.studentName || "Unknown Author")}</td>
          <td>${escapeHtml(abs.presentationType || "")}</td>
        </tr>
      `)
      .join("");
    const searchSummary = titleQuery
      ? `<p class="muted" style="margin-top:8px;">Showing results for <strong>${escapeHtml(titleQuery)}</strong>.</p>`
      : "";
    const canManageHistoricWinners = req.session?.user?.accountType === "Committee" || req.session?.user?.accountType === "Admin";
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Approved Abstract Gallery • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
        <a class="btn btn-secondary" href="/dashboard">Back to Dashboard</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <h1 class="card-title">Approved Abstract Gallery</h1>
        <p class="muted" style="margin-top:0;">Browse all abstracts that reached a final approved decision. Select a title to open the full abstract with its description and author.</p>
        ${canManageHistoricWinners ? `<div style="margin:12px 0 0 0;"><a class="btn" href="/gallery/historic/add">Add Historic Winner</a></div>` : ""}
        <form class="form" method="get" action="/gallery" aria-label="gallery-search-form" style="margin: 18px 0 10px 0; display:grid; gap:10px; grid-template-columns: minmax(0, 1fr) auto auto; align-items:end;">
          <div>
            <label for="gallery-search">Search by title</label>
            <input id="gallery-search" name="q" type="text" value="${escapeHtml(titleQuery)}" placeholder="Enter a full or partial abstract title" />
          </div>
          <button class="btn btn-primary" type="submit">Search</button>
          <a class="btn btn-secondary" href="/gallery">Clear</a>
          <div>
            <label for="gallery-search">Filter by Type</label>
            <select name="f" id="cars">
              <option value="${escapeHtml(typeQuery)}">${escapeHtml(typeQuery)}</option>
              ${types}
            </select>
          </div>
        </form>
        ${searchSummary}

        <div class="table-wrap">
          <table class="table" aria-label="approved abstract gallery">
            <thead>
              <tr>
                <th>Title</th>
                <th>Author</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="3" class="muted">${titleQuery ? `No fully approved abstracts matched "${escapeHtml(titleQuery)}".` : `There are no fully approved abstracts in the gallery yet.`}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
      <section class="card">
        <h1 class="card-title">Previous Winners</h1>
        <p class="muted" style="margin-top:0;">Browse abstracts that won in previous years.</p>

        <div class="table-wrap">
          <table class="table" aria-label="previous winner gallery">
            <thead>
              <tr>
                <th>Title</th>
                <th>Author</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              ${rowsP || `<tr><td colspan="3" class="muted">${titleQuery ? `No previous winners matched "${escapeHtml(titleQuery)}".` : `There are no previous winners to display yet.`}</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Could not load gallery: ${err.message}`);
  }
}

async function getAbstractGalleryDetailPage(req, res) {
  try {
    const abs = await abstractDao.getAbstractById(req.params.id);
    if (!abs || ((String(abs.submissionState || "") !== "Submitted" || String(abs.finalStatus || "") !== "Approved" || !abs.isComplete) && !abs.isPreviousWinner)) {
      return res.status(404).send("Approved abstract not found");
    }
    const accountType = String(req.session?.user?.accountType || "").trim();
    const canLeaveComment = Boolean(req.session?.user?.id) && !["Committee", "Admin"].includes(accountType);
    const rows = (Array.isArray(abs.commentHistory) ? abs.commentHistory : []).map((item) => `
          <tr>
            <td><strong>${escapeHtml(item.commenter)}</strong></td>
            <td style="white-space: pre-wrap;">${escapeHtml(item.comment || "")}</td>
          </tr>
        `).join("");
    const commentSection = canLeaveComment
      ? `<form class="form" method="post" action="/gallery/${abs._id}/comment" aria-label="gallery-comment-form" style="margin-top:24px;">
            <label class="label">
              <span>Leave a comment</span>
              <textarea class="input" name="comment" rows="3" required></textarea>
            </label>
            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
              <button class="btn" type="submit">Post Comment</button>
            </div>
          </form>`
      : `<div class="tile" style="margin-top:24px;">
            <h2>Comments</h2>
            <p class="muted" style="margin:0;">Committee members and admins cannot leave gallery comments.</p>
          </div>`;
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(abs.title || "Approved Abstract")} • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/gallery">Back to Gallery</a>
        <a class="btn btn-secondary" href="/dashboard">Dashboard</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <h1 class="card-title">${escapeHtml(abs.title || "Untitled Abstract")}</h1>
        <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
          <span class="badge badge-approved">Approved</span>
          ${abs.isPreviousWinner ? `<span class="badge">Historic Winner</span>` : ""}
          <span class="badge">${escapeHtml(abs.presentationType || "Presentation")}</span>
          ${abs.subjectArea ? `<span class="badge">${escapeHtml(abs.subjectArea)}</span>` : ""}
        </div>

        <div class="dashboard-grid" style="margin-top:18px;">
          <div class="tile">
            <h2>Author</h2>
            <p><strong>${escapeHtml(abs.studentName || "Unknown Author")}</strong></p>
            <p class="muted">${escapeHtml(abs.studentField || "")}</p>
          </div>
          <div class="tile">
            <h2>Description</h2>
            <p style="white-space: pre-wrap;">${escapeHtml(abs.description || "")}</p>
          </div>
        </div>

        ${commentSection}

        <div class="table-wrap" style="margin-top:20px;">
          <table class="table" aria-label="comment section">
            <thead>
              <tr>
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td class="muted">No comments have been posted yet.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Could not load approved abstract: ${err.message}`);
  }
}



async function getAdminDashboard(req, res) {
  try {
    const announcements = await loadActiveAnnouncements();
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin Dashboard • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/" aria-label="home">
        <div class="logo" aria-hidden="true">
          <span class="logo-mark">AP</span>
        </div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/committee-members">Committee Member Info</a>
      </div>
    </header>

    <main class="page">
      <section class="card">
        <div class="dashboard-shell">
          <section class="dashboard-hero hero-admin dashboard-hero-clean">
            <div class="dashboard-hero-copy">
              <span class="dashboard-kicker">Administration</span>
              <h1>Admin Dashboard</h1>
              <p>Oversee account access, abstract records, announcements, and published work from a cleaner operations hub.</p>
            </div>
            <div class="dashboard-hero-stats" aria-label="admin summary">
              <div class="dashboard-stat-pill">
                <span class="dashboard-stat-label">Accounts</span>
                <strong>Manage</strong>
              </div>
              <div class="dashboard-stat-pill">
                <span class="dashboard-stat-label">Abstracts</span>
                <strong>Update</strong>
              </div>
              <div class="dashboard-stat-pill">
                <span class="dashboard-stat-label">Alerts</span>
                <strong>Broadcast</strong>
              </div>
            </div>
          </section>

          <section class="dashboard-quick-links" aria-label="admin quick links">
            <a class="dashboard-quick-link dashboard-quick-link-primary" href="/admin/accounts">Manage Accounts</a>
            <a class="dashboard-quick-link" href="/admin/abstracts">Manage Abstracts</a>
            <a class="dashboard-quick-link" href="/announcements/create">Create Announcement</a>
            <a class="dashboard-quick-link" href="/gallery">Approved Gallery</a>
          </section>

          <section class="dashboard-grid dashboard-grid-clean">
            <div class="tile tile-accent-admin dashboard-feature-tile">
              <div class="dashboard-tile-topline">
                <h2>Manage Accounts</h2>
                <span class="badge badge-pending">Access</span>
              </div>
              <p>Approve, remove, and maintain active user accounts across the system.</p>
              <div class="dashboard-tile-actions"><a class="btn btn-secondary" href="/admin/accounts">Open Accounts</a></div>
            </div>
            <div class="tile tile-accent-admin dashboard-feature-tile">
              <div class="dashboard-tile-topline">
                <h2>Manage Abstracts</h2>
                <span class="badge badge-pending">Records</span>
              </div>
              <p>Manually update or delete any abstract in the system.</p>
              <div class="dashboard-tile-actions"><a class="btn btn-secondary" href="/admin/abstracts">Open Abstracts</a></div>
            </div>
            <div class="tile tile-accent-admin dashboard-feature-tile">
              <div class="dashboard-tile-topline">
                <h2>Announcements</h2>
                <span class="badge badge-approved">System Wide</span>
              </div>
              <p>Publish time-limited notices and manage your existing alerts without crowding the main dashboard.</p>
              <div class="dashboard-tile-actions"><a class="btn" href="/announcements/create">New Announcement</a><a class="btn btn-secondary" href="/announcements/manage">Manage Yours</a></div>
            </div>
          </section>

          <section class="dashboard-secondary-panel">
            <div class="dashboard-secondary-header">
              <div>
                <h2>Additional Tools</h2>
                <p class="muted">Published-work browsing and reference tools live here so the main actions remain easy to scan.</p>
              </div>
            </div>
            <div class="dashboard-secondary-grid">
              <a class="dashboard-mini-card" href="/gallery">
                <span class="dashboard-mini-label">Gallery</span>
                <strong>Approved Gallery</strong>
                <small>Browse all fully approved abstracts and historic winners.</small>
              </a>
              <a class="dashboard-mini-card" href="/announcements/manage">
                <span class="dashboard-mini-label">Announcements</span>
                <strong>Manage Yours</strong>
                <small>Edit content, adjust expiry times, or end announcements early.</small>
              </a>
            </div>
          </section>

          <form method="post" action="/logout" style="margin-top: 2px;">
            <button class="btn btn-secondary" type="submit">Logout</button>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`;
    return res.status(200).send(withAnnouncementPopups(html, announcements));
  } catch (err) {
    return res.status(500).send(`Could not load admin dashboard: ${err.message}`);
  }
}

function getAnnouncementCreateForm(req, res) {
  const actorType = req.session?.user?.accountType || "Committee";
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Create Announcement • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/announcements/manage">Manage Announcements</a>
        <a class="btn btn-secondary" href="/dashboard">Back to Dashboard</a>
      </div>
    </header>
    <main class="page">
      <section class="card">
        <h1 class="card-title">Create Announcement</h1>
        <p class="muted" style="margin-top:0;">${escapeHtml(actorType)} notices appear as bottom-right popups for every signed-in user until the chosen expiry date and time.</p>
        <form class="form" method="post" action="/announcements/create">
          <label class="label"><span>Title</span><input class="input" type="text" name="title" maxlength="120" required /></label>
          <label class="label"><span>Description</span><textarea class="input" name="description" rows="6" maxlength="4000" required></textarea></label>
          <label class="label"><span>Expiry date and time</span><input class="input" type="datetime-local" name="expiresAt" required /></label>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
            <button class="btn" type="submit">Publish Announcement</button>
            <a class="btn btn-secondary" href="/dashboard">Cancel</a>
          </div>
        </form>
      </section>
    </main>
  </body>
</html>`;
  return res.status(200).send(html);
}

async function postAnnouncementCreate(req, res) {
  try {
    const createdById = req.session?.user?.id;
    const createdByName = req.session?.user?.username || req.session?.user?.email || "Committee Member";
    const createdByRole = req.session?.user?.accountType || "Committee";
    await announcementDao.createAnnouncement({
      title: req.body?.title,
      description: req.body?.description,
      expiresAt: req.body?.expiresAt,
      createdById,
      createdByName,
      createdByRole
    });
    return res.redirect('/dashboard');
  } catch (err) {
    return res.status(400).send(`Could not create announcement: ${err.message}`);
  }
}

async function getManageAnnouncementsPage(req, res) {
  try {
    const createdById = req.session?.user?.id;
    const announcements = await announcementDao.getAnnouncementsByCreator(createdById);
    const rows = announcements.map((item) => `
      <tr>
        <td>${escapeHtml(item.title || "Announcement")}</td>
        <td>${escapeHtml(item.description || "")}</td>
        <td>${item.expiresAt ? escapeHtml(new Date(item.expiresAt).toLocaleString()) : ""}</td>
        <td>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <a class="btn btn-secondary" href="/announcements/${escapeHtml(item._id)}/edit">Edit</a>
            <form method="post" action="/announcements/${escapeHtml(item._id)}/delete" style="margin:0;">
              <button class="btn btn-danger" type="submit">Delete</button>
            </form>
          </div>
        </td>
      </tr>
    `).join("");

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Manage Announcements • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/dashboard" aria-label="dashboard">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/dashboard">Back to Dashboard</a>
        <a class="btn" href="/announcements/create">New Announcement</a>
      </div>
    </header>
    <main class="page">
      <section class="card">
        <h1 class="card-title">Manage Your Announcements</h1>
        <p class="muted" style="margin-top:0;">You can edit the content, change the expiry time, or remove any announcement you created.</p>
        <div class="table-wrap">
          <table class="table" aria-label="manage announcements table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Description</th>
                <th>Expires</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="4" class="muted">You have no active announcements.</td></tr>`}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(400).send(`Could not load announcements: ${err.message}`);
  }
}

async function getEditAnnouncementForm(req, res) {
  try {
    const createdById = req.session?.user?.id;
    const announcement = await announcementDao.getAnnouncementByIdForCreator(req.params.id, createdById);
    if (!announcement) return res.status(404).send("Announcement not found");

    const expiresLocal = announcement.expiresAt ? new Date(announcement.expiresAt).toISOString().slice(0, 16) : "";
    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Edit Announcement • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/announcements/manage" aria-label="announcements">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/announcements/manage">Back to Announcements</a>
      </div>
    </header>
    <main class="page">
      <section class="card">
        <h1 class="card-title">Edit Announcement</h1>
        <form class="form" method="post" action="/announcements/${escapeHtml(announcement._id)}/edit">
          <label class="label"><span>Title</span><input class="input" type="text" name="title" maxlength="120" required value="${escapeHtml(announcement.title || "")}" /></label>
          <label class="label"><span>Description</span><textarea class="input" name="description" rows="6" maxlength="4000" required>${escapeHtml(announcement.description || "")}</textarea></label>
          <label class="label"><span>Expiry date and time</span><input class="input" type="datetime-local" name="expiresAt" required value="${escapeHtml(expiresLocal)}" /></label>
          <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
            <button class="btn" type="submit">Save Changes</button>
            <a class="btn btn-secondary" href="/announcements/manage">Cancel</a>
          </div>
        </form>
      </section>
    </main>
  </body>
</html>`;
    return res.status(200).send(html);
  } catch (err) {
    return res.status(400).send(`Could not load announcement: ${err.message}`);
  }
}

async function postEditAnnouncement(req, res) {
  try {
    await announcementDao.updateAnnouncementByIdForCreator(req.params.id, req.session?.user?.id, {
      title: req.body?.title,
      description: req.body?.description,
      expiresAt: req.body?.expiresAt
    });
    return res.redirect('/announcements/manage');
  } catch (err) {
    return res.status(400).send(`Could not update announcement: ${err.message}`);
  }
}

async function postDeleteAnnouncement(req, res) {
  try {
    await announcementDao.deleteAnnouncementByIdForCreator(req.params.id, req.session?.user?.id);
    return res.redirect('/announcements/manage');
  } catch (err) {
    return res.status(400).send(`Could not delete announcement: ${err.message}`);
  }
}

function getAdminCreateAccountForm(req, res) {
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Create Account • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/admin/accounts" aria-label="accounts">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/admin/accounts">Back to Accounts</a>
      </div>
    </header>
    <main class="page">
      <section class="card">
        <h1 class="card-title">Create Account</h1>
        <form class="form" method="post" action="/admin/accounts/create">
          <label class="label"><span>Account Type</span>
            <select class="input" name="accountType" required>
              <option value="Student">Student</option>
              <option value="Reviewer">Reviewer</option>
              <option value="Committee">Committee</option>
              <option value="Admin">Admin</option>
            </select>
          </label>
          <label class="label"><span>Email</span><input class="input" type="email" name="email" /></label>
          <label class="label"><span>Username (optional)</span><input class="input" type="text" name="username" /></label>
          <label class="label"><span>Password</span><input class="input" type="password" name="password" required /></label>
          <label class="label"><span>Subject Area (optional)</span><input class="input" type="text" name="subjectArea" /></label>
          <label class="label"><span>Status</span>
            <select class="input" name="status">
              <option value="Pending">Pending</option>
              <option value="Approved">Approved</option>
              <option value="Denied">Denied</option>
            </select>
          </label>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="btn" type="submit">Create Account</button>
            <a class="btn btn-secondary" href="/admin/accounts">Cancel</a>
          </div>
        </form>
      </section>
    </main>
  </body>
</html>`;
  return res.status(200).send(html);
}

async function postAdminCreateAccount(req, res) {
  try {
    await createAccountByAdmin({
      accountType: req.body?.accountType,
      email: req.body?.email,
      username: req.body?.username,
      password: req.body?.password,
      subjectArea: req.body?.subjectArea,
      status: req.body?.status
    });
    return res.redirect("/admin/accounts");
  } catch (err) {
    return res.status(400).send(`Could not create account: ${err.message}`);
  }
}

async function getAdminEditAccountForm(req, res) {
  try {
    const account = await getAccountById(req.params.id);
    if (!account || account.accountType === "Admin") return res.status(404).send("Account not found");

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Edit Account • Abstract Portal</title>
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <header class="topbar" aria-label="topbar">
      <a class="brand" href="/admin/accounts" aria-label="accounts">
        <div class="logo" aria-hidden="true"><span class="logo-mark">AP</span></div>
        <span class="brand-name">Abstract Portal</span>
      </a>
      <div class="topbar-actions">
        <a class="btn btn-secondary" href="/admin/accounts">Back to Accounts</a>
      </div>
    </header>
    <main class="page">
      <section class="card">
        <h1 class="card-title">Edit Account</h1>
        <form class="form" method="post" action="/admin/accounts/${escapeHtml(account._id)}/edit">
          <label class="label"><span>Account Type</span>
            <select class="input" name="accountType" required>
              <option value="Student" ${account.accountType==="Student"?"selected":""}>Student</option>
              <option value="Reviewer" ${account.accountType==="Reviewer"?"selected":""}>Reviewer</option>
              <option value="Committee" ${account.accountType==="Committee"?"selected":""}>Committee</option>
            </select>
          </label>
          <label class="label"><span>Email</span><input class="input" type="email" name="email" value="${escapeHtml(account.email || "")}" /></label>
          <label class="label"><span>Username</span><input class="input" type="text" name="username" value="${escapeHtml(account.username || "")}" /></label>
          <label class="label"><span>New Password (leave blank to keep current)</span><input class="input" type="password" name="password" /></label>
          <label class="label"><span>Subject Area</span><input class="input" type="text" name="subjectArea" value="${escapeHtml(account.subjectArea || "")}" /></label>
          <label class="label"><span>Status</span>
            <select class="input" name="status">
              <option value="Pending" ${account.status==="Pending"?"selected":""}>Pending</option>
              <option value="Approved" ${account.status==="Approved"?"selected":""}>Approved</option>
              <option value="Denied" ${account.status==="Denied"?"selected":""}>Denied</option>
            </select>
          </label>
          <div style="display:flex; gap:12px; flex-wrap:wrap;">
            <button class="btn" type="submit">Save Changes</button>
            <a class="btn btn-secondary" href="/admin/accounts">Cancel</a>
          </div>
        </form>
      </section>
    </main>
  </body>
</html>`;
    return res.status(200).send(html);
  } catch (err) {
    return res.status(400).send(`Could not load account: ${err.message}`);
  }
}

async function postAdminEditAccount(req, res) {
  try {
    await updateAccountByAdmin(req.params.id, {
      accountType: req.body?.accountType,
      email: req.body?.email,
      username: req.body?.username,
      password: req.body?.password,
      subjectArea: req.body?.subjectArea,
      status: req.body?.status
    });
    return res.redirect("/admin/accounts");
  } catch (err) {
    return res.status(400).send(`Could not update account: ${err.message}`);
  }
}


module.exports = {
  getIndex,
  getLogin,
  getDashboard,
  getStudentDashboard,
  getReviewerDashboard,
  postLogin,
  postLogout,
  getAbstractSubmitForm,
  postAbstractSubmit,
  getStudentAbstractView,
  getRegister,
  getRegisterStudent,
  getRegisterReviewer,
  getRegisterCommittee,
  postRegisterStudent,
  postRegisterReviewer,
  postRegisterCommittee,
  requireAuth,
  requireStudent,
  requireAdmin,
  getAdminManageAccounts,
  getAdminCreateAccountForm,
  postAdminCreateAccount,
  getAdminEditAccountForm,
  postAdminEditAccount,
  postAdminDeleteAccount,
  requireReviewer,
  requireCommittee,
  requireCommitteeOrAdmin,
  getReviewerApplication,
  postReviewerApplication,
  getReviewerAssignedAbstractView,
  postReviewerSubmitFeedback,
  getAbstractManagementPage,
  getAbstractEditForm,
  postAbstractEdit,
  postAbstractDelete,
  getCommitteeDashboard,
  postCommitteeAssignAbstract,
  postCommitteeUnassignAbstract,
  postCommitteeApproveAbstract,
  postCommitteeApproveReviewerFeedback,
  postCommitteeDenyReviewerFeedback,
  postStudentAddComment,
  postCommitteeApproveApplication,
  postCommitteeDenyApplication,
  postCommitteeApproveAccount,
  postCommitteeDenyAccount,
  getCommitteeInfoForm,
  postCommitteeInfoForm,
  getCommitteeMembersPage,
  getCommitteeApplicationsPage,
  getCommitteeAccountsPage,
  getCommitteeFeedbackPage,
  getAbstractGalleryPage,
  getAbstractGalleryDetailPage,
  getHistoricWinnerCreateForm,
  postHistoricWinnerCreate,
  getAnnouncementCreateForm,
  postAnnouncementCreate,
  getManageAnnouncementsPage,
  getEditAnnouncementForm,
  postEditAnnouncement,
  postDeleteAnnouncement
};
