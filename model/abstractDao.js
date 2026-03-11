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

module.exports = {
  saveStudentAbstractDraft,
  saveStudentAbstract,
  getStudentAbstracts,
  submitStudentAbstract,
  getAbstractByStudentId
};
