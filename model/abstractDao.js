const Abstract = require("./Abstract");
const Account = require("./Account");

function normalizeType(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return undefined;
  if (v === "poster") return "Poster";
  if (v === "oral" || v === "oral presentation") return "Oral";
  throw new Error("presentationType must be Poster or Oral");
}

function normalizeReviewerDecision(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (v === "approved") return "Approved";
  if (v === "work in progress" || v === "wip") return "Work In Progress";
  if (v === "denied") return "Denied";
  throw new Error("decision must be Approved, Work In Progress, or Denied");
}

function isTerminalDecision(value) {
  return ["Approved", "Denied"].includes(String(value || "").trim());
}

function isAbstractCompleteRecord(abs) {
  return Boolean(abs?.isComplete) || isTerminalDecision(abs?.finalStatus);
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

async function assertStudentAbstractEditable(studentId) {
  const query = Abstract.findOne({ studentId: String(studentId || "").trim() });
  const existing = typeof query?.lean === "function" ? await query.lean() : await query;
  if (existing && isAbstractCompleteRecord(existing)) {
    throw new Error("This abstract is complete and can no longer be changed by the student");
  }
  return existing;
}

async function saveStudentAbstractDraft(studentId, data) {
  const id = String(studentId || "").trim();
  if (!id) throw new Error("studentId is required");

  await assertStudentAbstractEditable(id);
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

  await assertStudentAbstractEditable(id);

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
        isComplete: false,
        completedAt: null,
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


async function getApprovedGalleryAbstracts() {
  return Abstract.find({ submissionState: "Submitted", finalStatus: "Approved", isComplete: true })
    .sort({ completedAt: -1, updatedAt: -1, createdAt: -1 })
    .select({ title: 1, description: 1, studentName: 1, studentField: 1, presentationType: 1, completedAt: 1, finalStatus: 1, isComplete: 1 })
    .lean();
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

async function saveReviewerFeedbackDraft(abstractId, reviewerId, data) {
  const absId = String(abstractId || "").trim();
  const revId = String(reviewerId || "").trim();
  if (!absId) throw new Error("abstractId is required");
  if (!revId) throw new Error("reviewerId is required");

  const [abs, reviewer] = await Promise.all([
    Abstract.findById(absId),
    Account.findById(revId).select({ accountType: 1, status: 1, email: 1, username: 1 }).lean()
  ]);

  if (!abs) throw new Error("Abstract not found");
  if (!reviewer || reviewer.accountType !== "Reviewer" || reviewer.status !== "Approved") {
    throw new Error("Reviewer must be an approved reviewer account");
  }
  if (String(abs.assignedReviewerId || "") !== revId) {
    throw new Error("You may only review your assigned abstract");
  }
  if (String(abs.submissionState || "") !== "Submitted") {
    throw new Error("Only submitted abstracts can receive reviewer feedback");
  }
  if (isAbstractCompleteRecord(abs)) {
    throw new Error("This abstract review is complete and can no longer be changed");
  }
  if (Array.isArray(abs.pendingFeedback) && abs.pendingFeedback.length > 0) {
    throw new Error("There is already pending reviewer feedback awaiting committee review");
  }

  const comment = String(data?.comment || "").trim();
  const decision = normalizeReviewerDecision(data?.decision);

  abs.feedbackDraft = {
    reviewerId: revId,
    reviewerName: reviewerDisplayName(reviewer),
    lastUpdated: new Date(),
    comment,
    decision
  };
  abs.lastUpdated = new Date();
  await abs.save();
  return abs.toObject();
}

async function submitReviewerFeedback(abstractId, reviewerId, data) {
  const absId = String(abstractId || "").trim();
  const revId = String(reviewerId || "").trim();
  if (!absId) throw new Error("abstractId is required");
  if (!revId) throw new Error("reviewerId is required");

  const [abs, reviewer] = await Promise.all([
    Abstract.findById(absId),
    Account.findById(revId).select({ accountType: 1, status: 1, email: 1, username: 1 }).lean()
  ]);

  if (!abs) throw new Error("Abstract not found");
  if (!reviewer || reviewer.accountType !== "Reviewer" || reviewer.status !== "Approved") {
    throw new Error("Reviewer must be an approved reviewer account");
  }
  if (String(abs.assignedReviewerId || "") !== revId) {
    throw new Error("You may only review your assigned abstract");
  }
  if (String(abs.submissionState || "") !== "Submitted") {
    throw new Error("Only submitted abstracts can receive reviewer feedback");
  }
  if (isAbstractCompleteRecord(abs)) {
    throw new Error("This abstract review is complete and can no longer be changed");
  }
  if (Array.isArray(abs.pendingFeedback) && abs.pendingFeedback.length > 0) {
    throw new Error("There is already pending reviewer feedback awaiting committee review");
  }

  const comment = String(data?.comment ?? abs.feedbackDraft?.comment ?? "").trim();
  if (!comment) throw new Error("comment is required");
  const decision = normalizeReviewerDecision(data?.decision ?? abs.feedbackDraft?.decision);
  if (!decision) throw new Error("decision is required");

  const feedback = {
    reviewerId: revId,
    reviewerName: reviewerDisplayName(reviewer),
    date: new Date(),
    comment,
    decision
  };

  abs.pendingFeedback.push(feedback);
  abs.feedbackDraft = null;
  abs.lastUpdated = new Date();
  await abs.save();
  return abs.toObject();
}

async function approveReviewerFeedback(abstractId, feedbackIndex) {
  const absId = String(abstractId || "").trim();
  const idx = Number(feedbackIndex);
  if (!absId) throw new Error("abstractId is required");
  if (!Number.isInteger(idx) || idx < 0) throw new Error("feedbackIndex is required");

  const abs = await Abstract.findById(absId);
  if (!abs) throw new Error("Abstract not found");

  const pending = abs.pendingFeedback?.[idx];
  if (!pending) throw new Error("Pending feedback not found");

  abs.feedbackHistory.push({
    reviewerId: pending.reviewerId,
    reviewerName: pending.reviewerName,
    date: pending.date,
    comment: pending.comment,
    decision: pending.decision
  });
  abs.pendingFeedback.splice(idx, 1);

  if (pending.decision === "Approved") {
    abs.finalStatus = "Approved";
    abs.isComplete = true;
    abs.completedAt = new Date();
  } else if (pending.decision === "Denied") {
    abs.finalStatus = "Denied";
    abs.isComplete = true;
    abs.completedAt = new Date();
  } else {
    abs.finalStatus = "Pending";
    abs.isComplete = false;
    abs.completedAt = null;
  }

  abs.lastUpdated = new Date();
  await abs.save();
  return abs.toObject();
}

async function denyReviewerFeedback(abstractId, feedbackIndex) {
  const absId = String(abstractId || "").trim();
  const idx = Number(feedbackIndex);
  if (!absId) throw new Error("abstractId is required");
  if (!Number.isInteger(idx) || idx < 0) throw new Error("feedbackIndex is required");

  const abs = await Abstract.findById(absId);
  if (!abs) throw new Error("Abstract not found");
  if (!abs.pendingFeedback?.[idx]) throw new Error("Pending feedback not found");

  abs.pendingFeedback.splice(idx, 1);
  abs.lastUpdated = new Date();
  await abs.save();
  return abs.toObject();
}

async function addComment(abstractId, studentId, data) {
  const absId = String(abstractId || "").trim();
  const stuId = String(studentId || "").trim();
  if (!absId) throw new Error("abstractId is required");
  if (!stuId) throw new Error("studentId is required");

  const [abs, student] = await Promise.all([
    Abstract.findById(absId),
    Account.findById(stuId).select({ accountType: 1, status: 1, email: 1}).lean()
  ]);

  if (!abs) throw new Error("Abstract not found");
  if (!student || student.accountType !== "Student" || student.status !== "Approved") {
    throw new Error("Commenter must be an approved student account");
  }
  if (String(abs.submissionState || "") !== "Submitted") {
    throw new Error("Only submitted abstracts can receive comments");
  }

  const commentText = String(data?.comment ?? "").trim();
  if (!commentText) throw new Error("comment is required");
  const commentAccount = (student.email).trim();
  if (!commentText) throw new Error("comment is required");

  const comment = {
    commentId: stuId,
    commenter: commentAccount,
    postedDate: new Date(),
    comment: commentText
  };

  abs.commentHistory.push(comment);
  await abs.save();
  return abs.toObject();
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

  const isComplete = isTerminalDecision(finalStatus);
  const payload = {
    title,
    description,
    presentationType,
    submissionState,
    finalStatus,
    isComplete,
    completedAt: isComplete ? existing.completedAt || new Date() : null,
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

async function setFinalApproval(abstractId, status) {
  const id = String(abstractId || "").trim();
  if (!id) throw new Error("abstractId is required");
  const s = String(status || "").trim();
  if (!["Approved", "Denied", "Pending"].includes(s)) throw new Error("Invalid status");

  const isComplete = isTerminalDecision(s);
  return Abstract.findByIdAndUpdate(
    id,
    {
      $set: {
        finalStatus: s,
        isComplete,
        completedAt: isComplete ? new Date() : null,
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
  getApprovedGalleryAbstracts,
  assignAbstractToReviewer,
  saveReviewerFeedbackDraft,
  submitReviewerFeedback,
  approveReviewerFeedback,
  denyReviewerFeedback,
  addComment,
  updateAbstractById,
  deleteAbstractById,
  unassignAbstract,
  setFinalApproval
};
