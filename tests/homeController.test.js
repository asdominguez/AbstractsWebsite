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
  ensureAdminExists: jest.fn().mockResolvedValue({ created: false })
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

  it("GET /register/student serves the student registration page", async () => {
    const res = await request(app).get("/register/student");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Create Student Account");
    expect(res.text).toContain('name="email"');
    expect(res.text).toContain('name="password"');
  });

  it("GET /register/reviewer serves the reviewer registration page", async () => {
    const res = await request(app).get("/register/reviewer");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Create Reviewer Account");
    expect(res.text).toContain('name="subjectArea"');
  });

  it("GET /register/committee serves the committee registration page", async () => {
    const res = await request(app).get("/register/committee");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain("Create Committee Account");
    expect(res.text).toContain('name="subjectArea"');
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

  it("POST /register/reviewer creates account via DAO then redirects to /login", async () => {
    dao.createAccount.mockResolvedValueOnce({ _id: "2" });

    const res = await request(app)
      .post("/register/reviewer")
      .send({ email: "r@b.com", password: "pw", subjectArea: "Bio" });

    expect(dao.createAccount).toHaveBeenCalledWith({
      accountType: "Reviewer",
      email: "r@b.com",
      password: "pw",
      subjectArea: "Bio"
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("POST /register/committee creates account via DAO then redirects to /login", async () => {
    dao.createAccount.mockResolvedValueOnce({ _id: "3" });

    const res = await request(app)
      .post("/register/committee")
      .send({ email: "c@b.com", password: "pw", subjectArea: "Chem" });

    expect(dao.createAccount).toHaveBeenCalledWith({
      accountType: "Committee",
      email: "c@b.com",
      password: "pw",
      subjectArea: "Chem"
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
