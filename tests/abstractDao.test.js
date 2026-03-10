jest.mock("../model/Abstract", () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn()
}));

jest.mock("../model/Account", () => ({
  findById: jest.fn()
}));

const Abstract = require("../model/Abstract");
const Account = require("../model/Account");
const { upsertStudentAbstract, getAbstractByStudentId } = require("../model/abstractDao");

describe("abstractDao", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("throws if studentId missing", async () => {
    await expect(upsertStudentAbstract("", { title: "t", description: "d", presentationType: "Poster" })).rejects.toThrow("studentId is required");
  });

  it("throws if title missing", async () => {
    await expect(upsertStudentAbstract("s1", { description: "d", presentationType: "Poster" })).rejects.toThrow("title is required");
  });

  it("creates or updates abstract", async () => {
    Account.findById.mockReturnValueOnce({
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue({ username: "Alice", subjectArea: "Biology", email: "a@x.com" })
    });
    Abstract.findOneAndUpdate.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({ studentId: "s1", title: "My Title" })
    });

    const res = await upsertStudentAbstract("s1", { title: "My Title", description: "Desc", presentationType: "Poster" });

    expect(Abstract.findOneAndUpdate).toHaveBeenCalledWith(
      { studentId: "s1" },
      { $set: expect.objectContaining({ studentName: "Alice", studentField: "Biology", title: "My Title", presentationType: "Poster" }) },
      { new: true, upsert: true }
    );
    expect(res.title).toBe("My Title");
  });

  it("getAbstractByStudentId throws if missing id", async () => {
    await expect(getAbstractByStudentId("")).rejects.toThrow("studentId is required");
  });

  it("getAbstractByStudentId returns abstract", async () => {
    Abstract.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ studentId: "s1" }) });
    const res = await getAbstractByStudentId("s1");
    expect(res.studentId).toBe("s1");
  });
});
