const Abstract = require("./Abstract");
const Account = require("./Account");

function normalizeType(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return undefined;
  if (v === "poster") return "Poster";
  if (v === "oral" || v === "oral presentation") return "Oral";
  throw new Error("presentationType must be Poster or Oral");
}

async function getStudentAccountSnapshot(studentId) {
  return Account.findById(studentId).select({ email: 1, username: 1, subjectArea: 1 }).lean();
}

function studentDisplayName(account) {
  return String(account?.username || account?.email || "Student").trim();
}

function reviewerDisplayName(account) {
  return String(account?.username || account?.email || "Reviewer").trim();
}

async function saveStudentAbstractDraft(studentId, data) {
  const id = String(studentId || "").trim();
  if (!id) throw new Error("studentId is required");

  const account = await getStudentAccountSnapshot(id);
  const payload = {
    studentId: id,
    studentName: studentDisplayName(account),
    studentField: String(account?.subjectArea || "").trim(),
    lastUpdated: new Date(),
    submissionState: "Draft"
  };

  if (data?.title != null) payload.title = String(data.title).trim();
  if (data?.description != null) payload.description = String(data.description).trim();

  const normalizedType = normalizeType(data?.presentationType);
  if (normalizedType) payload.presentationType = normalizedType;

  return Abstract.findOneAndUpdate(
    { studentId: id },
    { $set: payload },
    { new: true, upsert: true }
  ).lean();
}

async function submitStudentAbstract(studentId, data) {
  const id = String(studentId || "").trim();
  if (!id) throw new Error("studentId is required");

  const title = String(data?.title || "").trim();
  const description = String(data?.description || "").trim();
  if (!title) throw new Error("title is required");
  if (!description) throw new Error("description is required");

  const presentationType = normalizeType(data?.presentationType);
  if (!presentationType) throw new Error("presentationType must be Poster or Oral");

  const account = await getStudentAccountSnapshot(id);

  return Abstract.findOneAndUpdate(
    { studentId: id },
    {
      $set: {
        studentId: id,
        studentName: studentDisplayName(account),
        studentField: String(account?.subjectArea || "").trim(),
        title,
        description,
        presentationType,
        submissionState: "Submitted",
        finalStatus: "Pending",
        lastUpdated: new Date()
      }
    },
    { new: true, upsert: true }
  ).lean();
}

async function saveStudentAbstract(studentId, data) {
  return submitStudentAbstract(studentId, data);
}

async function getStudentAbstracts(studentId) {
  const one = await getAbstractByStudentId(studentId);
  return one ? [one] : [];
}

async function getAbstractByStudentId(studentId) {
  const id = String(studentId || "").trim();
  if (!id) throw new Error("studentId is required");
  return Abstract.findOne({ studentId: id }).lean();
}

async function getAbstractById(abstractId) {
  const id = String(abstractId || "").trim();
  if (!id) throw new Error("abstractId is required");
  return Abstract.findById(id).lean();
}

async function getSubmittedAbstracts() {
  return Abstract.find({ submissionState: "Submitted" }).sort({ updatedAt: -1, createdAt: -1 }).lean();
}

async function getAllAbstracts() {
  return Abstract.find({}).sort({ updatedAt: -1, createdAt: -1 }).lean();
}

async function getAssignedAbstractByReviewerId(reviewerId) {
  const id = String(reviewerId || "").trim();
  if (!id) throw new Error("reviewerId is required");
  return Abstract.findOne({ assignedReviewerId: id }).lean();
}

async function assignAbstractToReviewer(abstractId, reviewerId) {
  const absId = String(abstractId || "").trim();
  const revId = String(reviewerId || "").trim();
  if (!absId) throw new Error("abstractId is required");
  if (!revId) throw new Error("reviewerId is required");

  const [abs, reviewer, reviewerAssignment] = await Promise.all([
    Abstract.findById(absId).lean(),
    Account.findById(revId).select({ accountType: 1, status: 1, email: 1, username: 1 }).lean(),
    Abstract.findOne({ assignedReviewerId: revId }).select({ _id: 1, title: 1 }).lean()
  ]);

  if (!abs) throw new Error("Abstract not found");
  if (abs.submissionState !== "Submitted") throw new Error("Only submitted abstracts can be assigned");
  if (!reviewer || reviewer.accountType !== "Reviewer" || reviewer.status !== "Approved") {
    throw new Error("Reviewer must be an approved reviewer account");
  }
  if (reviewerAssignment && String(reviewerAssignment._id) !== absId) {
    throw new Error("Reviewer already has an assigned abstract");
  }
  if (abs.assignedReviewerId && String(abs.assignedReviewerId) !== revId) {
    throw new Error("Abstract is already assigned. Unassign it before reassigning.");
  }

  return Abstract.findByIdAndUpdate(
    absId,
    {
      $set: {
        assignmentStatus: "Assigned",
        assignedReviewerId: revId,
        assignedReviewerName: reviewerDisplayName(reviewer),
        assignedAt: new Date(),
        lastUpdated: new Date()
      }
    },
    { new: true }
  ).lean();
}


async function updateAbstractById(abstractId, data) {
  const id = String(abstractId || "").trim();
  if (!id) throw new Error("abstractId is required");

  const existing = await Abstract.findById(id).lean();
  if (!existing) throw new Error("Abstract not found");

  const title = data?.title != null ? String(data.title).trim() : String(existing.title || "").trim();
  const description = data?.description != null ? String(data.description).trim() : String(existing.description || "").trim();
  const presentationType = data?.presentationType != null
    ? normalizeType(data.presentationType)
    : String(existing.presentationType || "Poster");

  const submissionState = String(data?.submissionState || existing.submissionState || "Draft").trim();
  const finalStatus = String(data?.finalStatus || existing.finalStatus || "Pending").trim();

  if (!["Draft", "Submitted"].includes(submissionState)) {
    throw new Error("submissionState must be Draft or Submitted");
  }
  if (!["Pending", "Approved", "Denied"].includes(finalStatus)) {
    throw new Error("finalStatus must be Pending, Approved, or Denied");
  }
  if (submissionState === "Submitted") {
    if (!title) throw new Error("title is required when submissionState is Submitted");
    if (!description) throw new Error("description is required when submissionState is Submitted");
  }

  const payload = {
    title,
    description,
    presentationType,
    submissionState,
    finalStatus,
    lastUpdated: new Date()
  };

  if (submissionState !== "Submitted") {
    payload.assignmentStatus = "Unassigned";
    payload.assignedReviewerId = null;
    payload.assignedReviewerName = "";
    payload.assignedAt = null;
  }

  return Abstract.findByIdAndUpdate(id, { $set: payload }, { new: true }).lean();
}

async function deleteAbstractById(abstractId) {
  const id = String(abstractId || "").trim();
  if (!id) throw new Error("abstractId is required");

  const deleted = await Abstract.findByIdAndDelete(id).lean();
  if (!deleted) throw new Error("Abstract not found");
  return deleted;
}

async function unassignAbstract(abstractId) {
  const absId = String(abstractId || "").trim();
  if (!absId) throw new Error("abstractId is required");

  return Abstract.findByIdAndUpdate(
    absId,
    {
      $set: {
        assignmentStatus: "Unassigned",
        assignedReviewerId: null,
        assignedReviewerName: "",
        assignedAt: null,
        lastUpdated: new Date()
      }
    },
    { new: true }
  ).lean();
}

module.exports = {
  saveStudentAbstractDraft,
  upsertStudentAbstractDraft: saveStudentAbstractDraft,
  saveStudentAbstract,
  upsertStudentAbstract: saveStudentAbstract,
  getStudentAbstracts,
  submitStudentAbstract,
  getAbstractByStudentId,
  getAbstractById,
  getSubmittedAbstracts,
  getAllAbstracts,
  getAssignedAbstractByReviewerId,
  assignAbstractToReviewer,
  updateAbstractById,
  deleteAbstractById,
  unassignAbstract
};
