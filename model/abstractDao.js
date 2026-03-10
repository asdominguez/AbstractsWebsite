const Abstract = require("./Abstract");
const Account = require("./Account");

function normalizeType(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "poster") return "Poster";
  if (v === "oral" || v === "oral presentation") return "Oral";
  throw new Error("presentationType must be Poster or Oral");
}

async function upsertStudentAbstract(studentId, data) {
  const id = String(studentId || "").trim();
  if (!id) throw new Error("studentId is required");

  const title = String(data?.title || "").trim();
  const description = String(data?.description || "").trim();

  if (!title) throw new Error("title is required");
  if (!description) throw new Error("description is required");

  const presentationType = normalizeType(data?.presentationType);

  const account = await Account.findById(id).select({ email: 1, username: 1, subjectArea: 1 }).lean();
  const studentName = String(account?.username || account?.email || "Student").trim();
  const studentField = String(account?.subjectArea || "").trim();

  return Abstract.findOneAndUpdate(
    { studentId: id },
    {
      $set: {
        studentId: id,
        studentName,
        studentField,
        title,
        description,
        presentationType,
        lastUpdated: new Date()
      }
    },
    { new: true, upsert: true }
  ).lean();
}

async function getAbstractByStudentId(studentId) {
  const id = String(studentId || "").trim();
  if (!id) throw new Error("studentId is required");
  return Abstract.findOne({ studentId: id }).lean();
}

module.exports = {
  upsertStudentAbstract,
  getAbstractByStudentId
};
