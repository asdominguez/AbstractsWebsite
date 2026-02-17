jest.mock("../model/accountDao", () => ({
  createAccount: jest.fn(),
  findByIdentifier: jest.fn(),
  verifyPassword: jest.fn(),
  getAllNonAdminAccounts: jest.fn(),
  deleteAccountByIdNonAdmin: jest.fn(),
  getAllStatus: jest.fn(),
  setAccountStatus: jest.fn()
}));

jest.mock("../model/applicationDao", () => ({
  createReviewerApplicationOnce: jest.fn(),
  getApplicationsByStatus: jest.fn(),
  setApplicationStatus: jest.fn()
}));

const dao = require("../model/accountDao");
const appDao = require("../model/applicationDao");

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

  test("requireReviewer redirects to /login when not authenticated", () => {
    const req = {};
    const res = makeRes();
    const next = jest.fn();
    controller.requireReviewer(req, res, next);
    expect(res.redirect).toHaveBeenCalledWith("/login");
    expect(next).not.toHaveBeenCalled();
  });

  test("requireReviewer forbids non-reviewer", () => {
    const req = { session: { user: { accountType: "Student" } } };
    const res = makeRes();
    const next = jest.fn();
    controller.requireReviewer(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.send).toHaveBeenCalledWith("Forbidden");
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

  test("postLogin returns 401 when account not found", async () => {
    dao.findByIdentifier.mockResolvedValueOnce(null);

    const req = { body: { identifier: "x", password: "y" }, session: {} };
    const res = makeRes();

    await controller.postLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith("Invalid credentials.");
  });

  test("postLogin returns 401 when password invalid", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({ _id: "1", accountType: "Student", password: "HASH" });
    dao.verifyPassword.mockResolvedValueOnce(false);

    const req = { body: { identifier: "x", password: "bad" }, session: {} };
    const res = makeRes();

    await controller.postLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith("Invalid credentials.");
  });

  test("postLogin returns 500 on unexpected error", async () => {
    dao.findByIdentifier.mockRejectedValueOnce(new Error("boom"));

    const req = { body: { identifier: "x", password: "y" }, session: {} };
    const res = makeRes();

    await controller.postLogin(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send.mock.calls[0][0]).toContain("Login error:");
  });

  test("postLogout redirects when req.session missing", () => {
    const req = {};
    const res = makeRes();
    controller.postLogout(req, res);
    expect(res.redirect).toHaveBeenCalledWith("/");
  });

  test("postReviewerApplication returns 400 when DAO rejects", async () => {
    appDao.createReviewerApplicationOnce.mockRejectedValueOnce(new Error("Application already submitted"));
    const req = { session: { user: { id: "r1" } }, body: { name: "N", roles: ["Reviewer of Abstracts"], department: "D", email: "e" } };
    const res = makeRes();

    await controller.postReviewerApplication(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send.mock.calls[0][0]).toContain("Could not submit application");
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

  test("admin manage accounts returns 500 when DAO fails", async () => {
    dao.getAllNonAdminAccounts.mockRejectedValueOnce(new Error("db down"));
    const req = {};
    const res = makeRes();
    await controller.getAdminManageAccounts(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send.mock.calls[0][0]).toContain("Could not load accounts");
  });
});
