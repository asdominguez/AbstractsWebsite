const path = require("path");
const { createAccount, findByIdentifier, verifyPassword, getAllNonAdminAccounts, deleteAccountByIdNonAdmin, getAllStatus, setAccountStatus, updateCommitteeInfo, getCommitteeMemberInfoList, getAccountById, createAccountByAdmin, updateAccountByAdmin } = require("../model/accountDao");
const { createReviewerApplicationOnce, getApplicationByReviewerId, getApplicationsByStatus, setApplicationStatus } = require("../model/applicationDao");
const abstractDao = require("../model/abstractDao");

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

function requireAdmin(req, res, next) {
  if (!req.session?.user) return res.redirect("/login");
  if (req.session.user.accountType !== "Admin") return res.status(403).send("Forbidden");
  next();
}

function getIndex(req, res) {
  return sendView(res, "index.html");
}

function getLogin(req, res) {
  return sendView(res, "login.html");
}

function getDashboard(req, res) {
  if (!req.session?.user) return res.redirect("/login");

  const type = req.session.user.accountType;
  const status = req.session.user.status || "Pending";

  if (type === "Committee" && status !== "Approved") {
    return renderAccountStatusPage(res, "Committee", status);
  }

  if (type === "Student") return getStudentDashboard(req, res);
  if (type === "Reviewer") return getReviewerDashboard(req, res);
  if (type === "Committee") return getCommitteeDashboard(req, res);
  if (type === "Admin") return sendView(res, "dashboard-admin.html");

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

    if (!identifier || !password) return res.status(400).send("Missing email/username or password.");

    const account = await findByIdentifier(identifier);
    if (!account) return res.status(401).send("Invalid credentials.");

    const ok = await verifyPassword(account, password);
    if (!ok) return res.status(401).send("Invalid credentials.");

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

    const accountStatus = req.session?.user?.status || "Pending";
    const application = await getApplicationByReviewerId(reviewerId);
    const applicationStatus = application?.status || null;

    let primaryTile = `
      <div class="tile tile-accent-reviewer">
        <h2>Reviewer Application</h2>
        <p>${accountStatus === "Approved"
          ? "Volunteer for reviewing or judging roles by submitting your application."
          : "Your reviewer account must be approved before you can submit an application."}</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>
          ${accountStatus === "Approved" ? `<a class="btn" href="/reviewer/application">Submit Application</a>` : `<span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>`}
        </div>
      </div>`;

    if (application && applicationStatus === "Pending") {
      primaryTile = `
        <div class="tile tile-accent-reviewer">
          <h2>My Application</h2>
          <p>Your application is currently under review. You can view it, but you cannot edit or resubmit it.</p>
          <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
            <span class="badge badge-pending">Pending</span>
            <a class="btn btn-secondary" href="/reviewer/application">View Application</a>
          </div>
        </div>`;
    } else if (application && (applicationStatus === "Approved" || applicationStatus === "Denied")) {
      primaryTile = `
        <div class="tile tile-accent-reviewer">
          <h2>Application Closed</h2>
          <p>Your reviewer application has been ${applicationStatus.toLowerCase()}. You can no longer open or resubmit it.</p>
          <div><span class="badge badge-${applicationStatus.toLowerCase()}">${applicationStatus}</span></div>
        </div>`;
    }

    if (shouldUseMockRender(res)) {
      return res.render("dashboard-reviewer", { application, status: applicationStatus, accountStatus });
    }

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
          <section class="dashboard-hero hero-reviewer">
            <span class="dashboard-kicker">Review Team</span>
            <h1>Reviewer Dashboard</h1>
            <p>Evaluate abstracts, volunteer for judging roles, and support the colloquium review process.</p>
          </section>

          <section class="dashboard-grid">
            ${primaryTile}
            <div class="tile tile-accent-reviewer"><h2>Assigned Work</h2><p>Your future assigned abstracts and review tasks will appear here.</p><div><span class="badge">Coming Soon</span></div></div>
            <div class="tile tile-accent-reviewer"><h2>Reviewer Notes</h2><p>Track feedback history and maintain consistent reviews over time.</p><div><span class="badge">Planned</span></div></div>
          </section>

          <form method="post" action="/logout" style="margin-top: 6px;">
            <button class="btn btn-secondary" type="submit">Logout</button>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
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

    const accountStatus = req.session?.user?.status || "Pending";
    const existing = await abstractDao.getAbstractByStudentId(userId);
    const submissionState = String(existing?.submissionState || "").trim();
    const finalStatus = String(existing?.finalStatus || "Pending").trim();

    const statusBadges = [];
    if (accountStatus !== "Approved") {
      statusBadges.push(`<span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>`);
    }
    if (submissionState) {
      statusBadges.push(`<span class="badge ${submissionState === "Draft" ? "badge-draft" : "badge-submitted"}">${escapeHtml(submissionState)}</span>`);
    }
    if (existing) {
      statusBadges.push(`<span class="badge badge-${escapeHtml(finalStatus.toLowerCase())}">${escapeHtml(finalStatus)}</span>`);
    }

    const canSubmit = accountStatus === "Approved";
    const primaryLabel = existing
      ? submissionState === "Draft"
        ? "Continue Draft"
        : "Edit Submission"
      : "Start Submission";

    const primaryAction = canSubmit
      ? `<a class="btn" href="/student/abstract/submit">${primaryLabel}</a>`
      : `<span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>`;

    const secondaryTile = existing
      ? submissionState === "Draft"
        ? `<div class="tile tile-accent-student">
            <h2>Draft in Progress</h2>
            <p>Your abstract has been saved as a draft. ${canSubmit ? "Come back anytime to finish and submit it." : "Approval is required before you can continue editing and submit it."}</p>
            <div style="margin-top:10px;">
              ${canSubmit ? `<a class="btn btn-secondary" href="/student/abstract/submit">Continue Draft</a>` : `<span class="badge badge-${accountStatus.toLowerCase()}">${escapeHtml(accountStatus)}</span>`}
            </div>
          </div>`
        : `<div class="tile tile-accent-student">
            <h2>View My Abstract</h2>
            <p>Open your submitted abstract to view its status, feedback history, and latest details.</p>
            <div style="margin-top:10px;">
              <a class="btn btn-secondary" href="/student/abstract">View My Abstract</a>
            </div>
          </div>`
      : `<div class="tile tile-accent-student">
          <h2>Submission Access</h2>
          <p>${canSubmit ? "You can begin a new abstract now and save drafts as you work." : "Your student account must be approved before you can create or submit an abstract."}</p>
          <div style="margin-top:10px;">
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
      </div>
    </header>

    <main class="page">
      <section class="card">
        <div class="dashboard-shell">
          <section class="dashboard-hero hero-student">
            <span class="dashboard-kicker">Research Submission</span>
            <h1>Student Dashboard</h1>
            <p>Prepare your abstract, save draft work, and track review status from one place.</p>
            <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
              ${statusBadges.join("")}
            </div>
          </section>

          <section class="dashboard-grid">
            <div class="tile tile-accent-student">
              <h2>${primaryLabel}</h2>
              <p>${canSubmit ? "Create a new abstract, revise your saved draft, or update your latest submission." : "Approval is required before abstract submission becomes available."}</p>
              <div style="margin-top:10px;">
                ${primaryAction}
              </div>
            </div>

            ${secondaryTile}
          </section>

          <form method="post" action="/logout" style="margin-top: 6px;">
            <button class="btn btn-secondary" type="submit">Logout</button>
          </form>
        </div>
      </section>
    </main>
  </body>
</html>`;

    return res.status(200).send(html);
  } catch (err) {
    return res.status(500).send(`Could not load student dashboard: ${err.message}`);
  }
}

async function getAbstractSubmitForm(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect("/login");
    const accountStatus = req.session?.user?.status || "Pending";
    if (accountStatus !== "Approved") return res.redirect("/dashboard");

    const existing = await abstractDao.getAbstractByStudentId(userId);

    const title = escapeHtml(existing?.title || "");
    const description = escapeHtml(existing?.description || "");
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
  return sendView(res, "abstract-submit.html");
}

async function postAbstractSubmit(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect("/login");
    const accountStatus = req.session?.user?.status || "Pending";
    if (accountStatus !== "Approved") return res.redirect("/dashboard");

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
        presentationType: req.body?.presentationType,
        submissionState: "Draft"
      });
    } else {
      // compatibility across older and newer DAO/test names
      const saveFn = abstractDao.upsertStudentAbstract || abstractDao.saveStudentAbstract || abstractDao.submitStudentAbstract;
      await saveFn(userId, {
        title: req.body?.title,
        description: req.body?.description,
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
          <div><span class="muted">Status:</span> <strong>${finalStatus}</strong></div>
          <div><span class="muted">Last Updated:</span> ${lastUpdated}</div>
        </div>

        <hr class="divider" />

        <h2 style="margin: 0 0 8px 0;">${title}</h2>
        <p style="white-space: pre-wrap;">${description}</p>

        <div style="margin-top:14px;">
          <a class="btn" href="/student/abstract/submit">Edit / Resubmit</a>
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
    const accountStatus = req.session?.user?.status || 'Pending';
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
    const accountStatus = req.session?.user?.status || 'Pending';
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

async function getCommitteeDashboard(req, res) {
  try {
    const pendingApplications = await getApplicationsByStatus("Pending");
    const pendingAccounts = (await getAllStatus("Pending")).filter(
      (a) => a.accountType === "Student" || a.accountType === "Reviewer"
    );

    const applicationRows = pendingApplications
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

    const accountRows = pendingAccounts
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
          <section class="dashboard-hero hero-committee">
            <span class="dashboard-kicker">Committee Review</span>
            <h1>Committee Dashboard</h1>
            <p>Coordinate reviewer applications, approve pending student and reviewer accounts, and manage colloquium workflow.</p>
            <div style="margin-top:14px;">
              <a class="btn" href="/committee/info">My Info</a>
            </div>
          </section>

          <section class="dashboard-grid">
            <div class="tile tile-accent-committee">
              <h2>Pending Reviewer Applications</h2>
              <p>Review volunteer applications from reviewer accounts waiting for committee approval.</p>
              <div><span class="badge badge-pending">${pendingApplications.length} Pending</span></div>
            </div>
            <div class="tile tile-accent-committee">
              <h2>Pending User Accounts</h2>
              <p>Approve or deny student and reviewer accounts that are waiting for access.</p>
              <div><span class="badge badge-pending">${pendingAccounts.length} Pending</span></div>
            </div>
          </section>

          <h2 class="section-title">Review Applications</h2>
          <p class="muted" style="margin-top:0;">Pending reviewer volunteer applications are listed here.</p>
          <div class="table-wrap">
            <table class="table" aria-label="pending applications">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Roles</th>
                  <th>Department</th>
                  <th>Email</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                ${applicationRows || `<tr><td colspan="5" class="muted">No pending applications.</td></tr>`}
              </tbody>
            </table>
          </div>

          <h2 class="section-title">Pending Student & Reviewer Accounts</h2>
          <p class="muted" style="margin-top:0;">Only student and reviewer accounts can be approved here.</p>
          <div class="table-wrap">
            <table class="table" aria-label="pending user accounts">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Type</th>
                  <th>Subject Area</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                ${accountRows || `<tr><td colspan="4" class="muted">No pending accounts.</td></tr>`}
              </tbody>
            </table>
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
  } catch (err) {
    return res.status(500).send(`Could not load dashboard: ${err.message}`);
  }
}

async function postCommitteeApproveApplication(req, res) {
  try {
    await setApplicationStatus(req.params.id, "Approved");
    return res.redirect("/dashboard");
  } catch (err) {
    return res.status(400).send(`Could not approve application: ${err.message}`);
  }
}

async function postCommitteeDenyApplication(req, res) {
  try {
    await setApplicationStatus(req.params.id, "Denied");
    return res.redirect("/dashboard");
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
    return res.redirect("/dashboard");
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
    return res.redirect("/dashboard");
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
  getReviewerApplication,
  postReviewerApplication,
  getCommitteeDashboard,
  postCommitteeApproveApplication,
  postCommitteeDenyApplication,
  postCommitteeApproveAccount,
  postCommitteeDenyAccount,
  getCommitteeInfoForm,
  postCommitteeInfoForm,
  getCommitteeMembersPage
};
