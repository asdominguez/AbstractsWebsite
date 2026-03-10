jest.mock("../model/Abstract", () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn()
}));

jest.mock("../model/Account", () => ({
  findById: jest.fn()
}));

const Abstract = require("../model/Abstract");
const Account = require("../model/Account");
const {
  saveStudentAbstractDraft,
  submitStudentAbstract,
  getAbstractByStudentId
} = require("../model/abstractDao");

describe("abstractDao", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("saveStudentAbstractDraft", () => {
    it("throws if studentId missing", async () => {
      await expect(saveStudentAbstractDraft("", { title: "t" })).rejects.toThrow("studentId is required");
    });

    it("saves a draft with partial data", async () => {
      Account.findById.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ username: "Alice", subjectArea: "Biology", email: "a@x.com" })
      });
      Abstract.findOneAndUpdate.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({ studentId: "s1", submissionState: "Draft" })
      });

      const res = await saveStudentAbstractDraft("s1", {
        title: "Draft Title",
        description: "",
        presentationType: "Poster"
      });

      expect(Abstract.findOneAndUpdate).toHaveBeenCalledWith(
        { studentId: "s1" },
        { $set: expect.objectContaining({ studentName: "Alice", studentField: "Biology", title: "Draft Title", submissionState: "Draft" }) },
        { new: true, upsert: true }
      );
      expect(res.submissionState).toBe("Draft");
    });
  });

  describe("submitStudentAbstract", () => {
    it("throws if studentId missing", async () => {
      await expect(submitStudentAbstract("", { title: "t", description: "d", presentationType: "Poster" })).rejects.toThrow("studentId is required");
    });

    it("throws if title missing", async () => {
      await expect(submitStudentAbstract("s1", { description: "d", presentationType: "Poster" })).rejects.toThrow("title is required");
    });

    it("creates or updates a submitted abstract", async () => {
      Account.findById.mockReturnValueOnce({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ username: "Alice", subjectArea: "Biology", email: "a@x.com" })
      });
      Abstract.findOneAndUpdate.mockReturnValueOnce({
        lean: jest.fn().mockResolvedValue({ studentId: "s1", title: "My Title", submissionState: "Submitted" })
      });

      const res = await submitStudentAbstract("s1", {
        title: "My Title",
        description: "Desc",
        presentationType: "Poster"
      });

      expect(Abstract.findOneAndUpdate).toHaveBeenCalledWith(
        { studentId: "s1" },
        { $set: expect.objectContaining({ studentName: "Alice", studentField: "Biology", title: "My Title", submissionState: "Submitted", finalStatus: "Pending" }) },
        { new: true, upsert: true }
      );
      expect(res.submissionState).toBe("Submitted");
    });
  });

  describe("getAbstractByStudentId", () => {
    it("throws if missing id", async () => {
      await expect(getAbstractByStudentId("")).rejects.toThrow("studentId is required");
    });

    it("returns abstract", async () => {
      Abstract.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ studentId: "s1" }) });
      const res = await getAbstractByStudentId("s1");
      expect(res.studentId).toBe("s1");
    });
  });
});
