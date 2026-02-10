const request = require("supertest");

// Mock DAO
jest.mock("../model/accountDao", () => ({
  createAccount: jest.fn(),
  ensureAdminExists: jest.fn().mockResolvedValue({ created: false })
}));

const { createAccount } = require("../model/accountDao");
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

  it("GET /login shows login inputs and create account button", async () => {
    const res = await request(app).get("/login");
    expect(res.statusCode).toBe(200);
    expect(res.text).toContain('name="username"');
    expect(res.text).toContain('name="password"');
    expect(res.text).toContain("Create New Account");
    expect(res.text).toContain('href="/register"');
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
    createAccount.mockResolvedValueOnce({ _id: "1" });

    const res = await request(app)
      .post("/register/student")
      .send({ email: "a@b.com", password: "pw" });

    expect(createAccount).toHaveBeenCalledWith({
      accountType: "Student",
      email: "a@b.com",
      password: "pw"
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("POST /register/reviewer creates account via DAO then redirects to /login", async () => {
    createAccount.mockResolvedValueOnce({ _id: "2" });

    const res = await request(app)
      .post("/register/reviewer")
      .send({ email: "r@b.com", password: "pw", subjectArea: "Bio" });

    expect(createAccount).toHaveBeenCalledWith({
      accountType: "Reviewer",
      email: "r@b.com",
      password: "pw",
      subjectArea: "Bio"
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("POST /register/committee creates account via DAO then redirects to /login", async () => {
    createAccount.mockResolvedValueOnce({ _id: "3" });

    const res = await request(app)
      .post("/register/committee")
      .send({ email: "c@b.com", password: "pw", subjectArea: "Chem" });

    expect(createAccount).toHaveBeenCalledWith({
      accountType: "Committee",
      email: "c@b.com",
      password: "pw",
      subjectArea: "Chem"
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/login");
  });

  it("POST /register/student returns 400 if DAO throws", async () => {
    createAccount.mockRejectedValueOnce(new Error("boom"));

    const res = await request(app)
      .post("/register/student")
      .send({ email: "a@b.com", password: "pw" });

    expect(res.statusCode).toBe(400);
    expect(res.text).toContain("Could not create student account");
  });
});
