const path = require("path");
const { createAccount, findByIdentifier, verifyPassword, getAllNonAdminAccounts, deleteAccountByIdNonAdmin, getAllStatus, setAccountStatus, updateCommitteeInfo, getCommitteeMemberInfoList } = require("../model/accountDao");
const { createReviewerApplicationOnce, getApplicationsByStatus, setApplicationStatus } = require("../model/applicationDao");
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
  const status = req.session.user.status;

  // If an account is denied, keep them out of role dashboards.
  if (status === "Denied") return sendView(res, "dashboard.html");

  // Route by role (status gating handled elsewhere if needed).
  if (type === "Student") return getStudentDashboard(req, res);
  if (type === "Reviewer") return sendView(res, "dashboard-reviewer.html");
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

    req.session.user = {
      id: String(account._id),
      accountType: account.accountType,
      email: account.email || null,
      username: account.username || null,

      status: account.status || null
    };

    return res.redirect("/dashboard");
  } catch (err) {
    return res.status(500).send(`Login error: ${err.message}`);
  }
}

function postLogout(req, res) {
  if (!req.session) return res.redirect("/");
  req.session.destroy(() => res.redirect("/"));
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
          return `
            <tr>
              <td>${email || username}</td>
              <td>${email}</td>
              <td>${username}</td>
              <td>${subjectArea}</td>
              <td>
                <form method="post" action="/admin/accounts/${id}/delete" style="margin:0;">
                  <button class="btn btn-danger" type="submit">Delete</button>
                </form>
              </td>
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
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="5" class="muted">No accounts.</td></tr>`}
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




async function getStudentDashboard(req, res) {
  try {
    const userId = req.session?.user?.id;
    if (!userId) return res.redirect("/login");

    const existing = await abstractDao.getAbstractByStudentId(userId);
    const draftBadge = existing
      ? `<span class="badge ${existing.submissionState === "Draft" ? "badge-draft" : "badge-submitted"}">${escapeHtml(existing.submissionState || "Submitted")}</span>`
      : "";

    const secondaryCard = existing
      ? existing.submissionState === "Draft"
        ? `<div class="tile tile-accent-student">
            <h2>Continue Draft</h2>
            <p>Pick up where you left off and finish preparing your abstract before submitting it.</p>
            <div style="margin-top:10px;">
              <a class="btn btn-secondary" href="/student/abstract/submit">Continue Draft</a>
            </div>
          </div>`
        : `<div class="tile tile-accent-student">
            <h2>View My Abstract</h2>
            <p>Open your submitted abstract to see its current status and any reviewer feedback.</p>
            <div style="margin-top:10px;">
              <a class="btn btn-secondary" href="/student/abstract">View My Abstract</a>
            </div>
          </div>`
      : `<div class="tile tile-accent-student">
          <h2>Draft Saving</h2>
          <p>You can save a draft at any time and return later to finish and submit it.</p>
          <div style="margin-top:10px;">
            <span class="badge badge-draft">Draft Enabled</span>
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
            <p>Prepare your abstract, save your progress, and keep track of whether your work has been officially submitted.</p>
            <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
              ${draftBadge}
              ${existing?.finalStatus ? `<span class="badge badge-${String(existing.finalStatus).toLowerCase()}">${escapeHtml(existing.finalStatus)}</span>` : ""}
            </div>
          </section>

          <section class="dashboard-grid">
            <div class="tile tile-accent-student">
              <h2>${existing ? "Edit Submission" : "Start Submission"}</h2>
              <p>Create a new abstract, revise a saved draft, or update an existing submission.</p>
              <div style="margin-top:10px;">
                <a class="btn" href="/student/abstract/submit">${existing ? "Open Submission" : "Start Now"}</a>
              </div>
            </div>

            ${secondaryCard}
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

    const existing = await abstractDao.getAbstractByStudentId(userId);
    const title = escapeHtml(existing?.title || "");
    const description = escapeHtml(existing?.description || "");
    const presentationType = String(existing?.presentationType || "Poster");
    const submissionState = escapeHtml(existing?.submissionState || "Draft");

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
            <h1>${existing ? "Continue Your Abstract" : "Start Your Abstract"}</h1>
            <p>Use Save Draft to keep your work in progress, then come back later and submit when you are ready.</p>
            <div style="margin-top:14px;">
              <span class="badge ${submissionState === "Draft" ? "badge-draft" : "badge-submitted"}">${submissionState}</span>
            </div>
          </section>

          <form class="form" method="post" action="/student/abstract/submit" aria-label="submit-abstract-form">
            <label class="label">
              <span>Title</span>
              <input class="input" type="text" name="title" value="${title}" required />
            </label>

            <label class="label">
              <span>Description</span>
              <textarea class="input" name="description" rows="8" required>${description}</textarea>
            </label>

            <label class="label">
              <span>Type of Abstract</span>
              <select class="input" name="presentationType" required>
                <option value="Poster" ${presentationType === "Poster" ? "selected" : ""}>Poster</option>
                <option value="Oral" ${presentationType === "Oral" ? "selected" : ""}>Oral Presentation</option>
              </select>
            </label>

            <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px;">
              <button class="btn btn-secondary" type="submit" name="intent" value="draft" formnovalidate>Save Draft</button>
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

    const intent = String(req.body?.intent || "submit").trim().toLowerCase();

    if (intent === "draft") {
      await abstractDao.saveStudentAbstractDraft(userId, {
        title: req.body?.title,
        description: req.body?.description,
        presentationType: req.body?.presentationType
      });
    } else {
      await abstractDao.submitStudentAbstract(userId, {
        title: req.body?.title,
        description: req.body?.description,
        presentationType: req.body?.presentationType
      });
    }

    return res.redirect("/dashboard");
  } catch (err) {
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
    const submissionState = escapeHtml(abs.submissionState || "Submitted");
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
        <div class="dashboard-shell">
          <section class="dashboard-hero hero-student">
            <span class="dashboard-kicker">My Submission</span>
            <h1>${title || "My Abstract"}</h1>
            <p>Track the latest version of your abstract and monitor any reviewer feedback.</p>
            <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap;">
              <span class="badge ${submissionState === "Draft" ? "badge-draft" : "badge-submitted"}">${submissionState}</span>
              <span class="badge badge-${String(finalStatus).toLowerCase()}">${finalStatus}</span>
            </div>
          </section>

          <div class="kv">
            <div><span class="muted">Type:</span> ${presentationType}</div>
            <div><span class="muted">Last Updated:</span> ${lastUpdated}</div>
          </div>

          <hr class="divider" />

          <h2 style="margin: 0 0 8px 0;">Description</h2>
          <p style="white-space: pre-wrap;">${description}</p>

          <div style="margin-top:14px;">
            <a class="btn" href="/student/abstract/submit">${submissionState === "Draft" ? "Continue Draft" : "Edit / Resubmit"}</a>
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

function getReviewerApplication(req, res) {
  return sendView(res, "reviewer-application.html");
}

async function postReviewerApplication(req, res) {
  try {
    const reviewerId = req.session.user.id;

    // Express urlencoded gives either string or array for checkbox group.
    const roles = req.body?.roles;

    await createReviewerApplicationOnce(reviewerId, {
      name: req.body?.name,
      roles,
      department: req.body?.department,
      email: req.body?.email
    });

    return res.redirect("/dashboard");
  } catch (err) {
    // simple error response for now
    return res.status(400).send(`Could not submit application: ${err.message}`);
  }
}

async function getCommitteeDashboard(req, res) {
  try {
    const pending = await getApplicationsByStatus("Pending");
    const rows = pending
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
    const accs = await getAllStatus("Pending");
    const accountList = accs.map((a) => {
      const id = escapeHtml(a._id);
      const type = escapeHtml(a.accountType);
      const email = escapeHtml(a.email);
      const subject = escapeHtml(a.subjectArea);
      return `<tr>
            <td>${email}</td>
            <td>${type}</td>
            <td>
              <form method="post" action="/committee/accounts/${id}/approve" style="display:inline;">
                <button class="btn" type="submit">Approve</button>
              </form>
              <form method="post" action="/committee/accounts/${id}/deny" style="display:inline; margin-left:8px;">
                <button class="btn btn-danger" type="submit">Deny</button>
              </form>
            </td>
          </tr>`
    }).join("");
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
            <p>Oversee volunteer applications, pending accounts, and final review actions for the colloquium.</p>
            <div style="margin-top:14px;"><a class="btn" href="/committee/info">My Info</a></div>
          </section>
          <p class="muted" style="margin-top:0;">Committee actions and pending review queues appear below.</p>

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
              ${rows || `<tr><td colspan="5" class="muted">No pending applications.</td></tr>`}
            </tbody>
          </table>
        </div>
        <h2 class="section-title">Pending Accounts</h2>
        <div class="table-wrap">
          <table class="table" aria-label="pending applications">
            <thead>
              <tr>
                <th>User</th>
                <th>Type</th>
                <th>Decision</th>
              </tr>
            </thead>
            <tbody>
              ${accountList || `<tr><td colspan="5" class="muted">No pending accounts.</td></tr>`}
            </tbody>
          </table>
        </div>
        
        <form method="post" action="/logout" style="margin-top: 14px;">
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
    await setAccountStatus(req.params.id, "Approved");
    return res.redirect("/dashboard");
  } catch (err) {
    return res.status(400).send(`Could not approve account: ${err.message}`);
  }
}

async function postCommitteeDenyAccount(req, res) {
  try {
    await setAccountStatus(req.params.id, "Denied");
    return res.redirect("/dashboard");
  } catch (err) {
    return res.status(400).send(`Could not deny application: ${err.message}`);
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


module.exports = {
  getIndex,
  getLogin,
  getDashboard,
  getStudentDashboard,
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
