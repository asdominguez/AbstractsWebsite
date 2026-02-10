// Mock the Account model used by the DAO
jest.mock("../model/Account", () => ({
  findOne: jest.fn(),
  create: jest.fn()
}));

const Account = require("../model/Account");
const {
  findByUsername,
  findByEmail,
  createAccount,
  ensureAdminExists
} = require("../model/accountDao");

describe("accountDao", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("findByUsername", () => {
    it("returns null when username is missing", async () => {
      const res = await findByUsername("");
      expect(res).toBeNull();
      expect(Account.findOne).not.toHaveBeenCalled();
    });

    it("calls Account.findOne and returns lean() result", async () => {
      const leanResult = { _id: "1", username: "Admin" };
      Account.findOne.mockReturnValueOnce({ lean: () => leanResult });

      const res = await findByUsername("Admin");

      expect(Account.findOne).toHaveBeenCalledWith({ username: "Admin" });
      expect(res).toEqual(leanResult);
    });
  });

  describe("findByEmail", () => {
    it("returns null when email is missing", async () => {
      const res = await findByEmail(null);
      expect(res).toBeNull();
      expect(Account.findOne).not.toHaveBeenCalled();
    });

    it("lowercases email before query and returns lean() result", async () => {
      const leanResult = { _id: "2", email: "test@example.com" };
      Account.findOne.mockReturnValueOnce({ lean: () => leanResult });

      const res = await findByEmail("TeSt@Example.com");

      expect(Account.findOne).toHaveBeenCalledWith({ email: "test@example.com" });
      expect(res).toEqual(leanResult);
    });
  });

  describe("createAccount", () => {
    it("throws if accountType is missing", async () => {
      await expect(createAccount({ password: "x" })).rejects.toThrow(
        "accountType and password are required"
      );
      expect(Account.create).not.toHaveBeenCalled();
    });

    it("throws if password is missing", async () => {
      await expect(createAccount({ accountType: "Student" })).rejects.toThrow(
        "accountType and password are required"
      );
      expect(Account.create).not.toHaveBeenCalled();
    });

    it("throws if attempting to create an Admin account", async () => {
      await expect(
        createAccount({ accountType: "Admin", username: "Admin", password: "admin123" })
      ).rejects.toThrow("Admin accounts cannot be created via website");
      expect(Account.create).not.toHaveBeenCalled();
    });

    it("creates non-admin accounts and returns plain object", async () => {
      const createdDoc = {
        toObject: () => ({ _id: "3", accountType: "Student", email: "a@b.com" })
      };
      Account.create.mockResolvedValueOnce(createdDoc);

      const res = await createAccount({
        accountType: "Student",
        email: "a@b.com",
        password: "pw"
      });

      expect(Account.create).toHaveBeenCalledWith({
        accountType: "Student",
        username: undefined,
        email: "a@b.com",
        password: "pw",
        subjectArea: undefined
      });
      expect(res).toEqual({ _id: "3", accountType: "Student", email: "a@b.com" });
    });
  });

  describe("ensureAdminExists", () => {
    it("does not create Admin if it already exists", async () => {
      Account.findOne.mockResolvedValueOnce({ _id: "admin" });

      const res = await ensureAdminExists();

      expect(Account.findOne).toHaveBeenCalledWith({
        accountType: "Admin",
        username: "Admin"
      });
      expect(Account.create).not.toHaveBeenCalled();
      expect(res).toEqual({ created: false });
    });

    it("creates Admin if missing", async () => {
      Account.findOne.mockResolvedValueOnce(null);
      Account.create.mockResolvedValueOnce({ _id: "newAdmin" });

      const res = await ensureAdminExists();

      expect(Account.findOne).toHaveBeenCalledWith({
        accountType: "Admin",
        username: "Admin"
      });
      expect(Account.create).toHaveBeenCalledWith({
        accountType: "Admin",
        username: "Admin",
        password: "admin123"
      });
      expect(res).toEqual({ created: true });
    });
  });
});
