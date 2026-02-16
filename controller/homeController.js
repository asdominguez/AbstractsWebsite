const path = require("path");
const { createAccount, findByIdentifier, verifyPassword, getAllNonAdminAccounts, deleteAccountByIdNonAdmin, getAllStatus, setAccountStatus } = require("../model/accountDao");
const { createReviewerApplicationOnce, getApplicationsByStatus, setApplicationStatus } = require("../model/applicationDao");

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
  if (type === "Student" && status === "Approved") return sendView(res, "dashboard-student.html");
  if (type === "Reviewer" && status === "Approved") return sendView(res, "dashboard-reviewer.html");
  if (type === "Committee" && status === "Approved") return getCommitteeDashboard(req, res);
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
    </header>

    <main class="page">
      <section class="card">
        <h1 class="card-title">Committee Dashboard</h1>
        <p class="muted" style="margin-top:0;">Next: committee review and final approval workflow.</p>

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

module.exports = {
  getIndex,
  getLogin,
  getDashboard,
  postLogin,
  postLogout,
  getRegister,
  getRegisterStudent,
  getRegisterReviewer,
  getRegisterCommittee,
  postRegisterStudent,
  postRegisterReviewer,
  postRegisterCommittee,
  requireAuth,
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
  postCommitteeDenyAccount
};
