const bcrypt = require("bcrypt");
const Account = require("../model/Account");

const SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

async function findByUsername(username) {
  const u = String(username || "").trim();
  if (!u) return null;
  return Account.findOne({ username: u }).lean();
}

async function findByEmail(email) {
  const e = normalizeEmail(email);
  if (!e) return null;
  return Account.findOne({ email: e }).lean();
}

async function getUserByEmail(email) {
  return findByEmail(email);
}

async function findByIdentifier(identifier) {
  const id = String(identifier || "").trim();
  if (!id) return null;
  if (id.includes("@")) return findByEmail(id);
  return findByUsername(id);
}

async function getAccountById(accountId) {
  const id = String(accountId || "").trim();
  if (!id) return null;
  return Account.findById(id).lean();
}

async function getAllStatus(status) {
  const s = String(status || "").trim() || "Pending";
  return Account.find({ status: s }).lean();
}

async function createAccount(data) {
  if (!data || !data.accountType || !data.password) {
    throw new Error("accountType and password are required");
  }
  if (data.accountType === "Admin") {
    throw new Error("Admin accounts cannot be created via website");
  }

  const email = normalizeEmail(data.email);
  if (!email) throw new Error("email is required");

  const existing = await Account.findOne({ email }).select({ _id: 1 }).lean();
  if (existing) throw new Error("An account with that email already exists");

  const passwordHash = await bcrypt.hash(String(data.password), SALT_ROUNDS);

  const doc = await Account.create({
    accountType: data.accountType,
    email,
    password: passwordHash,
    subjectArea: data.subjectArea
  });

  return doc.toObject();
}

async function verifyPassword(account, plainPassword) {
  if (!account) return false;
  return bcrypt.compare(String(plainPassword || ""), String(account.password || ""));
}

async function ensureAdminExists() {
  const ADMIN_USERNAME = "Admin";
  const ADMIN_PASSWORD = "admin123";

  const existing = await Account.findOne({
    accountType: "Admin",
    username: ADMIN_USERNAME
  }).select({ _id: 1 });

  if (existing) return { created: false };

  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, SALT_ROUNDS);

  await Account.create({
    accountType: "Admin",
    username: ADMIN_USERNAME,
    password: passwordHash
  });

  return { created: true };
}

async function setAccountStatus(accountID, status) {
  const id = String(accountID || "").trim();
  if (!id) throw new Error("applicationId is required");
  const s = String(status || "").trim();
  if (!["Approved", "Denied", "Pending"].includes(s)) throw new Error("Invalid status");

  return Account.findByIdAndUpdate(id, { status: s }, { new: true }).lean();
}

async function getAllNonAdminAccounts() {
  // Return all accounts except Admin, excluding password.
  return Account.find({ accountType: { $ne: "Admin" } })
    .select("-password")
    .lean();
}

async function deleteAccountByIdNonAdmin(accountId) {
  const id = String(accountId || "").trim();
  if (!id) throw new Error("accountId is required");

  // Do not allow deleting Admin accounts via this method.
  // Returns the deleted account (without password) or null if not found / not deleted.
  return Account.findOneAndDelete({ _id: id, accountType: { $ne: "Admin" } })
    .select("-password")
    .lean();
}


async function updateCommitteeInfo(accountId, info) {
  const id = String(accountId || "").trim();
  if (!id) throw new Error("accountId is required");

  const payload = {
    "committeeInfo.name": String(info?.name || "").trim(),
    "committeeInfo.loyolaEmail": String(info?.loyolaEmail || "").trim().toLowerCase(),
    "committeeInfo.departmentArea": String(info?.departmentArea || "").trim(),
    "committeeInfo.description": String(info?.description || "").trim()
  };

  // Only committee accounts can be updated by this method
  return Account.findOneAndUpdate(
    { _id: id, accountType: "Committee" },
    { $set: payload },
    { new: true }
  )
    .select("-password")
    .lean();
}

async function getCommitteeMemberInfoList() {
  // Approved committee accounts with public info. Exclude password.
  return Account.find({ accountType: "Committee", status: "Approved" })
    .select("-password")
    .lean();
}



async function createAccountByAdmin(data) {
  if (!data || !data.accountType || !data.password) {
    throw new Error("accountType and password are required");
  }
  const allowed = ["Student", "Reviewer", "Committee", "Admin"];
  if (!allowed.includes(data.accountType)) {
    throw new Error("Invalid account type");
  }

  const email = normalizeEmail(data.email);
  if (!email && data.accountType !== "Admin") throw new Error("email is required");

  if (email) {
    const existing = await Account.findOne({ email }).select({ _id: 1 }).lean();
    if (existing) throw new Error("An account with that email already exists");
  }

  const passwordHash = await bcrypt.hash(String(data.password), SALT_ROUNDS);

  const payload = {
    accountType: data.accountType,
    password: passwordHash,
    status: data.status || "Pending",
    subjectArea: data.subjectArea
  };

  if (email) payload.email = email;
  if (data.username) payload.username = String(data.username).trim();

  const doc = await Account.create(payload);
  return doc.toObject();
}

async function updateAccountByAdmin(accountId, data) {
  const id = String(accountId || "").trim();
  if (!id) throw new Error("accountId is required");

  const existing = await Account.findById(id).lean();
  if (!existing) throw new Error("Account not found");

  const update = {};
  if (data.accountType) {
    const allowed = ["Student", "Reviewer", "Committee", "Admin"];
    if (!allowed.includes(data.accountType)) throw new Error("Invalid account type");
    update.accountType = data.accountType;
  }
  if (data.email !== undefined) {
    const email = normalizeEmail(data.email);
    if (email) {
      const dupe = await Account.findOne({ email, _id: { $ne: id } }).select({ _id: 1 }).lean();
      if (dupe) throw new Error("An account with that email already exists");
      update.email = email;
    } else {
      update.email = undefined;
    }
  }
  if (data.username !== undefined) update.username = String(data.username || "").trim() || undefined;
  if (data.subjectArea !== undefined) update.subjectArea = String(data.subjectArea || "").trim() || undefined;
  if (data.status !== undefined) {
    const s = String(data.status || "").trim();
    if (!["Approved", "Denied", "Pending"].includes(s)) throw new Error("Invalid status");
    update.status = s;
  }
  if (data.password) {
    update.password = await bcrypt.hash(String(data.password), SALT_ROUNDS);
  }

  return Account.findByIdAndUpdate(id, { $set: update }, { new: true }).select("-password").lean();
}


module.exports = {
  getUserByEmail,
  getAccountById,
  findByUsername,
  findByEmail,
  findByIdentifier,
  getAllStatus,
  setAccountStatus,
  createAccount,
  createAccountByAdmin,
  updateAccountByAdmin,
  verifyPassword,
  ensureAdminExists,
  getAllNonAdminAccounts,
  deleteAccountByIdNonAdmin,
  updateCommitteeInfo,
  getCommitteeMemberInfoList
};
