const Application = require("./Application");

async function createReviewerApplicationOnce(reviewerId, data) {
  const rid = String(reviewerId || "").trim();
  if (!rid) throw new Error("reviewerId is required");

  const existing = await Application.findOne({ reviewerId: rid }).select({ _id: 1 }).lean();
  if (existing) throw new Error("Application already submitted");

  if (!data?.name || !data?.department || !data?.email) throw new Error("Missing required fields");
  const roles = Array.isArray(data.roles) ? data.roles : (data.roles ? [data.roles] : []);
  if (!roles.length) throw new Error("At least one role is required");

  const doc = await Application.create({
    reviewerId: rid,
    name: String(data.name).trim(),
    roles,
    department: String(data.department).trim(),
    email: String(data.email).trim(),
    status: "Pending"
  });

  return doc.toObject();
}

async function getApplicationsByStatus(status) {
  const s = String(status || "").trim() || "Pending";
  return Application.find({ status: s }).lean();
}

async function setApplicationStatus(appId, status) {
  const id = String(appId || "").trim();
  if (!id) throw new Error("applicationId is required");
  const s = String(status || "").trim();
  if (!["Approved", "Denied", "Pending"].includes(s)) throw new Error("Invalid status");

  return Application.findByIdAndUpdate(id, { status: s }, { new: true }).lean();
}

module.exports = {
  createReviewerApplicationOnce,
  getApplicationsByStatus,
  setApplicationStatus
};
