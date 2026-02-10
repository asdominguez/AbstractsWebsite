const path = require("path");
const { createAccount, findByIdentifier, verifyPassword } = require("../model/accountDao");

function sendView(res, filename) {
  return res.sendFile(path.join(__dirname, "..", "view", filename));
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
  if (type === "Student") return sendView(res, "dashboard-student.html");
  if (type === "Reviewer") return sendView(res, "dashboard-reviewer.html");
  if (type === "Committee") return sendView(res, "dashboard-committee.html");
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
      username: account.username || null
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
  postRegisterCommittee
};
