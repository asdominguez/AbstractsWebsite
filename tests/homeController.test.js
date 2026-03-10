const request = require("supertest");

// Prevent real DB connections during tests (server calls connectDB.connect())
jest.mock("../config/db", () => ({
  connect: jest.fn().mockResolvedValue(null),
  disconnect: jest.fn().mockResolvedValue(null)
}));

// Mock DAO so server bootstrap and controllers don't require a real DB
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
  upsertStudentAbstract: jest.fn(),
  getAbstractByStudentId: jest.fn()
}));

jest.mock("../model/applicationDao", () => ({
  createReviewerApplicationOnce: jest.fn(),
  getApplicationByReviewerId: jest.fn(),
  getApplicationsByStatus: jest.fn(),
  setApplicationStatus: jest.fn()
}));


const dao = require("../model/accountDao");
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
    expect(res.text).toContain('href="/register"');
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

    const res = await request(app).post("/login").send({ identifier: "a@b.com", password: "pw" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
  });

  it("GET /register shows account type choices", async () => {
    const res = await request(app).get("/register");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Student");
    expect(res.text).toContain("Reviewer");
    expect(res.text).toContain("Committee");
    expect(res.text).toContain('href="/register/student"');
    expect(res.text).toContain('href="/register/reviewer"');
    expect(res.text).toContain('href="/register/committee"');
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

  it("POST /register/student returns 400 if DAO throws", async () => {
    dao.createAccount.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app).post("/register/student").send({ email: "a@b.com", password: "pw" });

    expect(res.statusCode).toBe(400);
    expect(res.text).toContain("Could not create student account");
  });
});

describe("Admin manage accounts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET /admin/accounts redirects to /login when not authenticated", async () => {
    const res = await request(app).get("/admin/accounts");
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("Admin can view manage accounts page", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "admin1",
      accountType: "Admin",
      username: "Admin",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);

    dao.getAllNonAdminAccounts.mockResolvedValueOnce([
      { _id: "1", accountType: "Student", email: "s@b.com" }
    ]);

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "Admin", password: "admin123" });

    const res = await agent.get("/admin/accounts");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Manage Accounts");
    expect(res.text).toContain("Student Accounts");
    expect(res.text).toContain("s@b.com");
    // should not show passwords
    expect(res.text).not.toContain("admin123");
  });

  it("Admin can delete an account", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "admin1",
      accountType: "Admin",
      username: "Admin",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);

    dao.deleteAccountByIdNonAdmin.mockResolvedValueOnce({ _id: "1" });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "Admin", password: "admin123" });

    const res = await agent.post("/admin/accounts/1/delete").send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/admin/accounts");
    expect(dao.deleteAccountByIdNonAdmin).toHaveBeenCalledWith("1");
  });
});


describe("Reviewer application + committee review", () => {
  const appDao = require("../model/applicationDao");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Reviewer can open application form", async () => {
    // login as reviewer
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "r1",
      accountType: "Reviewer",
      email: "r@b.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);

    appDao.getApplicationByReviewerId.mockResolvedValueOnce(null);

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "r@b.com", password: "pw" });

    const res = await agent.get("/reviewer/application");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Volunteer Application");
  });

  it("Reviewer can submit application (once)", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "r1",
      accountType: "Reviewer",
      email: "r@b.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);

    appDao.createReviewerApplicationOnce.mockResolvedValueOnce({ _id: "a1" });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "r@b.com", password: "pw" });

    const res = await agent.post("/reviewer/application").send({
      name: "Jane",
      roles: ["Reviewer of Abstracts"],
      department: "Bio",
      email: "j@b.com"
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
    expect(appDao.createReviewerApplicationOnce).toHaveBeenCalledWith("r1", expect.any(Object));
  });

  it("Committee dashboard shows pending applications and can approve", async () => {
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
    expect(dash.text).toContain("Review Applications");
    expect(dash.text).toContain("Jane");

    appDao.setApplicationStatus.mockResolvedValueOnce({ _id: "a1", status: "Approved" });
    const res = await agent.post("/committee/applications/a1/approve").send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
    expect(appDao.setApplicationStatus).toHaveBeenCalledWith("a1", "Approved");
  });

  it("Committee can deny", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "c1",
      accountType: "Committee",
      email: "c@b.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);

    appDao.setApplicationStatus.mockResolvedValueOnce({ _id: "a1", status: "Denied" });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "c@b.com", password: "pw" });

    const res = await agent.post("/committee/applications/a1/deny").send({});
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
    expect(appDao.setApplicationStatus).toHaveBeenCalledWith("a1", "Denied");
  });
});


describe("Committee member info", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("GET /committee-members renders table rows", async () => {
    const dao = require("../model/accountDao");
    dao.getCommitteeMemberInfoList.mockResolvedValueOnce([
      { _id: "c1", accountType: "Committee", status: "Approved", committeeInfo: { name: "Dr. A", loyolaEmail: "a@loyola.edu", departmentArea: "Philosophy", description: "Chair" } }
    ]);

    const res = await request(app).get("/committee-members");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Committee Member Info");
    expect(res.text).toContain("Dr. A");
    expect(res.text).toContain("a@loyola.edu");
  });

  it("Committee can save their info via POST /committee/info", async () => {
    const dao = require("../model/accountDao");
    dao.findByIdentifier.mockResolvedValueOnce({ _id: "c1", accountType: "Committee", email: "c@b.com", password: "HASH" });
    dao.verifyPassword.mockResolvedValueOnce(true);

    dao.updateCommitteeInfo.mockResolvedValueOnce({ _id: "c1", accountType: "Committee", committeeInfo: { name: "X" } });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "c@b.com", password: "pw" });

    const res = await agent.post("/committee/info").send({ name: "X", loyolaEmail: "x@loyola.edu", departmentArea: "CS", description: "Member" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
  });
});


describe("Student abstract submission", () => {
  const absDao = require("../model/abstractDao");

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("Student dashboard shows View My Abstract button when abstract exists", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "s1",
      accountType: "Student",
      email: "student@x.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    absDao.getAbstractByStudentId.mockResolvedValueOnce({ studentId: "s1", title: "T" });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "student@x.com", password: "pw" });

    const res = await agent.get("/dashboard");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Submit Abstract");
    expect(res.text).toContain("View My Abstract");
    expect(res.text).toContain('href="/student/abstract"');
  });

  it("Student can submit abstract", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "s1",
      accountType: "Student",
      email: "student@x.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    absDao.upsertStudentAbstract.mockResolvedValueOnce({ studentId: "s1", title: "My Title" });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "student@x.com", password: "pw" });

    const res = await agent.post("/student/abstract/submit").send({
      title: "My Title",
      description: "Desc",
      presentationType: "Poster"
    });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
    expect(absDao.upsertStudentAbstract).toHaveBeenCalledWith("s1", expect.objectContaining({
      title: "My Title",
      description: "Desc",
      presentationType: "Poster"
    }));
  });

  it("Student can view submitted abstract", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "s1",
      accountType: "Student",
      email: "student@x.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    absDao.getAbstractByStudentId.mockResolvedValueOnce({
      studentId: "s1",
      title: "My Title",
      description: "Desc",
      presentationType: "Poster",
      finalStatus: "Pending",
      feedbackHistory: []
    });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "student@x.com", password: "pw" });

    const res = await agent.get("/student/abstract");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("My Abstract");
    expect(res.text).toContain("My Title");
    expect(res.text).toContain("Feedback History");
  });
});


describe("Reviewer application locking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reviewer with pending application sees view-only application", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "r1",
      accountType: "Reviewer",
      email: "r@b.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    appDao.getApplicationByReviewerId
      .mockResolvedValueOnce({ reviewerId: "r1", status: "Pending" })
      .mockResolvedValueOnce({
        reviewerId: "r1",
        name: "Jane",
        roles: ["Reviewer of Abstracts"],
        department: "Bio",
        email: "j@b.com",
        status: "Pending"
      });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "r@b.com", password: "pw" });

    const dash = await agent.get("/dashboard");
    expect(dash.statusCode).toBe(200);
    expect(dash.text).toContain("My Application");
    expect(dash.text).toContain("Pending");

    const res = await agent.get("/reviewer/application");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("My Reviewer Application");
    expect(res.text).toContain("Jane");
  });

  it("reviewer cannot resubmit once an application exists", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "r1",
      accountType: "Reviewer",
      email: "r@b.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    appDao.getApplicationByReviewerId.mockResolvedValueOnce({ reviewerId: "r1", status: "Pending" });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "r@b.com", password: "pw" });

    const res = await agent.post("/reviewer/application").send({
      name: "Jane",
      roles: ["Reviewer of Abstracts"],
      department: "Bio",
      email: "j@b.com"
    });

    expect(res.statusCode).toBe(400);
    expect(res.text).toContain("Application already submitted");
  });

  it("approved reviewer can no longer open application or submit a new one", async () => {
    dao.findByIdentifier.mockResolvedValueOnce({
      _id: "r1",
      accountType: "Reviewer",
      email: "r@b.com",
      password: "HASH"
    });
    dao.verifyPassword.mockResolvedValueOnce(true);
    appDao.getApplicationByReviewerId
      .mockResolvedValueOnce({ reviewerId: "r1", status: "Approved" })
      .mockResolvedValueOnce({ reviewerId: "r1", status: "Approved" })
      .mockResolvedValueOnce({ reviewerId: "r1", status: "Approved" });

    const agent = request.agent(app);
    await agent.post("/login").send({ identifier: "r@b.com", password: "pw" });

    const dash = await agent.get("/dashboard");
    expect(dash.statusCode).toBe(200);
    expect(dash.text).toContain("Application Closed");
    expect(dash.text).toContain("Approved");
    expect(dash.text).not.toContain('href="/reviewer/application"');

    const viewRes = await agent.get("/reviewer/application");
    expect(viewRes.statusCode).toBe(302);
    expect(viewRes.headers.location).toBe('/dashboard');

    const postRes = await agent.post("/reviewer/application").send({
      name: "Jane",
      roles: ["Reviewer of Abstracts"],
      department: "Bio",
      email: "j@b.com"
    });
    expect(postRes.statusCode).toBe(400);
  });
});
