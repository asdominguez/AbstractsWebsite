const request = require("supertest");

jest.mock("../config/db", () => ({
  connect: jest.fn().mockResolvedValue(null),
  disconnect: jest.fn().mockResolvedValue(null)
}));

jest.mock("../model/accountDao", () => ({
  createAccount: jest.fn(),
  findByIdentifier: jest.fn(),
  verifyPassword: jest.fn(),
  ensureAdminExists: jest.fn().mockResolvedValue({ created: false }),
  getAllNonAdminAccounts: jest.fn(),
  deleteAccountByIdNonAdmin: jest.fn(),
  getAllStatus: jest.fn(),
  setAccountStatus: jest.fn(),
  updateCommitteeInfo: jest.fn(),
  getCommitteeMemberInfoList: jest.fn()
}));

jest.mock("../model/abstractDao", () => ({
  saveStudentAbstractDraft: jest.fn(),
  submitStudentAbstract: jest.fn(),
  getAbstractByStudentId: jest.fn()
}));

jest.mock("../model/applicationDao", () => ({
  createReviewerApplicationOnce: jest.fn(),
  getApplicationsByStatus: jest.fn(),
  setApplicationStatus: jest.fn()
}));

const dao = require("../model/accountDao");
const abstractDao = require("../model/abstractDao");
const appDao = require("../model/applicationDao");
const app = require("../server");

describe("HTML routes", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET / shows a Login button and brand", async () => {
    const res = await request(app).get("/");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Abstract Portal");
    expect(res.text).toContain('href="/login"');
  });

  it("GET /login shows identifier/password fields and create account button", async () => {
    const res = await request(app).get("/login");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('name="identifier"');
    expect(res.text).toContain('name="password"');
    expect(res.text).toContain("Create New Account");
  });

  it("POST /login returns 400 when missing identifier", async () => {
    const res = await request(app).post("/login").send({ password: "y" });
    expect(res.statusCode).toBe(400);
  });

  it("POST /login redirects to /dashboard when credentials are valid", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "u1",
      accountType: "Student",
      email: "a@b.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    abstractDao.getAbstractByStudentId.mockResolvedValueOnce(null);

    const res = await request(app).post("/login").send({ identifier: "a@b.com", password: "pw" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
  });

  it("POST /register/student creates account via DAO then redirects to /login", async () => {
    dao.createAccount.mockResolvedValueOnce({ _id: "1" });

    const res = await request(app).post("/register/student").send({ email: "a@b.com", password: "pw" });

    expect(dao.createAccount).toHaveBeenCalledWith({
      accountType: "Student",
      email: "a@b.com",
      password: "pw"
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login");
  });
});

describe("Student abstract workflow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("student dashboard shows draft-oriented actions", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "s1",
      accountType: "Student",
      email: "student@x.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    abstractDao.getAbstractByStudentId.mockResolvedValueOnce({
      studentId: "s1",
      submissionState: "Draft",
      finalStatus: "Pending"
    });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "student@x.com", password: "pw" });

    const res = await agent.get("/dashboard");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Student Dashboard");
    expect(res.text).toContain("Continue Draft");
  });

  it("student can save a draft", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "s1",
      accountType: "Student",
      email: "student@x.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    abstractDao.saveStudentAbstractDraft.mockResolvedValueOnce({ studentId: "s1", submissionState: "Draft" });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "student@x.com", password: "pw" });

    const res = await agent.post("/student/abstract/submit").send({
      title: "Draft",
      description: "",
      presentationType: "Poster",
      intent: "draft"
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
    expect(abstractDao.saveStudentAbstractDraft).toHaveBeenCalledWith("s1", expect.objectContaining({ title: "Draft" }));
  });

  it("student can submit final abstract", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "s1",
      accountType: "Student",
      email: "student@x.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    abstractDao.submitStudentAbstract.mockResolvedValueOnce({ studentId: "s1", submissionState: "Submitted" });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "student@x.com", password: "pw" });

    const res = await agent.post("/student/abstract/submit").send({
      title: "My Title",
      description: "Desc",
      presentationType: "Poster",
      intent: "submit"
    });

    expect(res.statusCode).toBe(302);
    expect(abstractDao.submitStudentAbstract).toHaveBeenCalledWith("s1", expect.objectContaining({ title: "My Title" }));
  });

  it("student can view submitted abstract", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "s1",
      accountType: "Student",
      email: "student@x.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    abstractDao.getAbstractByStudentId
      .mockResolvedValueOnce({ studentId: "s1", submissionState: "Submitted", finalStatus: "Pending" }) // dashboard
      .mockResolvedValueOnce({
        studentId: "s1",
        title: "My Title",
        description: "Desc",
        presentationType: "Poster",
        submissionState: "Submitted",
        finalStatus: "Pending",
        feedbackHistory: []
      });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "student@x.com", password: "pw" });
    await agent.get("/dashboard");
    const res = await agent.get("/student/abstract");

    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("My Abstract");
    expect(res.text).toContain("My Title");
    expect(res.text).toContain("Feedback History");
  });
});

describe("Reviewer application + committee review", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reviewer can open application form", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "r1",
      accountType: "Reviewer",
      email: "r@b.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "r@b.com", password: "pw" });

    const res = await agent.get("/reviewer/application");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Volunteer Application");
  });

  it("committee dashboard shows pending applications and can approve", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "c1",
      accountType: "Committee",
      email: "c@b.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    appDao.getApplicationsByStatus.mockResolvedValueOnce([
      { _id: "a1", name: "Jane", roles: ["Reviewer of Abstracts"], department: "Bio", email: "j@b.com" }
    ]);
    dao.getAllStatus.mockResolvedValueOnce([]);

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "c@b.com", password: "pw" });

    const dash = await agent.get("/dashboard");
    expect(dash.statusCode).toBe(200);
    expect(dash.text).toContain("Committee Dashboard");
    expect(dash.text).toContain("Review Applications");

    appDao.setApplicationStatus.mockResolvedValueOnce({ _id: "a1", status: "Approved" });
    const res = await agent.post("/committee/applications/a1/approve").send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
  });
});
