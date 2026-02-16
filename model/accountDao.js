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

async function findByIdentifier(identifier) {
  const id = String(identifier || "").trim();
  if (!id) return null;
  if (id.includes("@")) return findByEmail(id);
  return findByUsername(id);
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

module.exports = {
  findByUsername,
  findByEmail,
  findByIdentifier,
  getAllStatus,
  setAccountStatus,
  createAccount,
  verifyPassword,
  ensureAdminExists,
  getAllNonAdminAccounts,
  deleteAccountByIdNonAdmin
};
