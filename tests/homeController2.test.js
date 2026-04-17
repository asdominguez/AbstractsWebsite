jest.mock("../model/accountDao", () => ({
  createAccount: jest.fn(),
  findByIdentifier: jest.fn(),
  verifyPassword: jest.fn(),
  getAllNonAdminAccounts: jest.fn(),
  deleteAccountByIdNonAdmin: jest.fn(),
  getAllStatus: jest.fn(),
  setAccountStatus: jest.fn(),
  updateCommitteeInfo: jest.fn(),
  getCommitteeMemberInfoList: jest.fn()
}));

jest.mock("../model/applicationDao", () => ({
  createReviewerApplicationOnce: jest.fn(),
  getApplicationByReviewerId: jest.fn(),
  getApplicationsByStatus: jest.fn(),
  setApplicationStatus: jest.fn()
}));

jest.mock("../model/abstractDao", () => ({
  saveStudentAbstractDraft: jest.fn(),
  submitStudentAbstract: jest.fn(),
  getAbstractByStudentId: jest.fn()
}));

const dao = require("../model/accountDao");
const appDao = require("../model/applicationDao");
const abstractDao = require("../model/abstractDao");
const controller = require("../controller/homeController");

function makeRes() {
  return {
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    sendFile: jest.fn(),
    redirect: jest.fn()
  };
}

describe("homeController unit branches", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("requireStudent forbids non-student", () => {
    const req = { session: { user: { accountType: "Reviewer" } } };
    const res = makeRes();
    const next = jest.fn();
    controller.requireStudent(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith("Forbidden");
  });

  test("requireReviewer redirects to /login when not authenticated", () => {
    const req = {};
    const res = makeRes();
    const next = jest.fn();
    controller.requireReviewer(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith("/login");
    expect(next).not.toHaveBeenCalled();
  });

  test("requireAdmin forbids non-admin", () => {
    const req = { session: { user: { accountType: "Reviewer" } } };
    const res = makeRes();
    const next = jest.fn();
    controller.requireAdmin(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith("Forbidden");
  });

  test("getDashboard sends generic dashboard when denied", () => {
    const req = { session: { user: { accountType: "Reviewer", status: "Denied" } } };
    const res = makeRes();
    controller.getDashboard(req, res);
    expect(res.sendFile).toHaveBeenCalled();
  });

  test("postLogin redirects when account not found", async () => {
    dao.findByIdentifier.mockResolvedValueOnce(null);
    const req = { body: { identifier: "x", password: "y" }, session: {} };
    const res = makeRes();
    await controller.postLogin(req, res);
    expect(res.redirect).toHaveBeenCalledWith("/login?error=invalid");
  });

  test("postLogin redirects when password invalid", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({ _id: "1", accountType: "Student", password: "HASH" });
    dao.verifyPassword.mockResolvedValueOnce(false);
    const req = { body: { identifier: "x", password: "bad" }, session: {} };
    const res = makeRes();
    await controller.postLogin(req, res);
    expect(res.redirect).toHaveBeenCalledWith("/login?error=invalid");
  });

  test("postAbstractSubmit saves draft when intent=draft", async () => {
    const req = {
      session: { user: { id: "s1" } },
      body: { title: "Draft", description: "", presentationType: "Poster", intent: "draft" }
    };
    const res = makeRes();
    abstractDao.saveStudentAbstractDraft.mockResolvedValueOnce({ studentId: "s1" });

    await controller.postAbstractSubmit(req, res);
    expect(abstractDao.saveStudentAbstractDraft).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalledWith("/dashboard");
  });

  test("postAbstractSubmit returns 400 on abstract submission errors", async () => {
    const req = {
      session: { user: { id: "s1" } },
      body: { title: "", description: "", presentationType: "Poster", intent: "submit" }
    };
    const res = makeRes();
    abstractDao.submitStudentAbstract.mockRejectedValueOnce(new Error("title is required"));

    await controller.postAbstractSubmit(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test("committee approve/deny handlers return 400 on DAO errors", async () => {
    appDao.setApplicationStatus.mockRejectedValueOnce(new Error("boom"));
    const req1 = { params: { id: "a1" } };
    const res1 = makeRes();
    await controller.postCommitteeApproveApplication(req1, res1);
    expect(res1.status).toHaveBeenCalledWith(400);

    appDao.setApplicationStatus.mockRejectedValueOnce(new Error("boom2"));
    const req2 = { params: { id: "a2" } };
    const res2 = makeRes();
    await controller.postCommitteeDenyApplication(req2, res2);
    expect(res2.status).toHaveBeenCalledWith(400);
  });
});
