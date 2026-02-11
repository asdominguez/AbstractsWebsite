jest.mock("../model/Application", () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  create: jest.fn(),
  findByIdAndUpdate: jest.fn()
}));

const Application = require("../model/Application");

const {
  createReviewerApplicationOnce,
  getApplicationsByStatus,
  setApplicationStatus
} = require("../model/applicationDao");

describe("applicationDao", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("createReviewerApplicationOnce", () => {
    it("throws if reviewerId missing", async () => {
      await expect(createReviewerApplicationOnce("", {})).rejects.toThrow("reviewerId is required");
    });

    it("throws if application already exists", async () => {
      const q = { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue({ _id: "x" }) };
      Application.findOne.mockReturnValueOnce(q);

      await expect(createReviewerApplicationOnce("r1", { name: "N", roles: ["Reviewer of Abstracts"], department: "D", email: "e" }))
        .rejects.toThrow("Application already submitted");
    });

    it("creates when no existing application", async () => {
      const q = { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) };
      Application.findOne.mockReturnValueOnce(q);

      Application.create.mockResolvedValueOnce({ toObject: () => ({ _id: "a1" }) });

      const res = await createReviewerApplicationOnce("r1", {
        name: "Jane",
        roles: "Reviewer of Abstracts",
        department: "Biology",
        email: "j@b.com"
      });

      expect(Application.create).toHaveBeenCalled();
      expect(res).toEqual({ _id: "a1" });
    });
  });

  describe("getApplicationsByStatus", () => {
    it("defaults to Pending", async () => {
      Application.find.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue([]) });
      await getApplicationsByStatus();
      expect(Application.find).toHaveBeenCalledWith({ status: "Pending" });
    });
  });

  describe("setApplicationStatus", () => {
    it("throws if invalid id", async () => {
      await expect(setApplicationStatus("", "Approved")).rejects.toThrow("applicationId is required");
    });

    it("throws if invalid status", async () => {
      await expect(setApplicationStatus("1", "Nope")).rejects.toThrow("Invalid status");
    });

    it("updates status", async () => {
      Application.findByIdAndUpdate.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: "1", status: "Approved" }) });
      const res = await setApplicationStatus("1", "Approved");
      expect(res.status).toBe("Approved");
    });
  });
});
