/**
 * Jest tests for Account DAO functions.
 * These tests mock bcrypt and the Account mongoose model so they do not require a real database.
 */

jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn()
}));

jest.mock("../model/Account", () => ({
  findOne: jest.fn(),
  find: jest.fn(),
  findOneAndDelete: jest.fn(),
  create: jest.fn()
}));

const bcrypt = require("bcrypt");
const Account = require("../model/Account");

const {
  findByUsername,
  findByEmail,
  findByIdentifier,
  createAccount,
  verifyPassword,
  ensureAdminExists,
  getAllNonAdminAccounts,
  deleteAccountByIdNonAdmin
} = require("../model/accountDao");

describe("accountDao", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.BCRYPT_SALT_ROUNDS = "10";
  });

  describe("findByUsername", () => {
    it("returns null when username is missing", async () => {
      const res = await findByUsername("");
      expect(res).toBeNull();
      expect(Account.findOne).not.toHaveBeenCalled();
    });

    it("queries by username and returns lean() result", async () => {
      const leanResult = { _id: "1", username: "u" };
      Account.findOne.mockReturnValueOnce({ lean: () => leanResult });

      const res = await findByUsername("u");

      expect(Account.findOne).toHaveBeenCalledWith({ username: "u" });
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

  describe("findByIdentifier", () => {
    it("uses findByEmail when identifier includes @", async () => {
      const leanResult = { _id: "3", email: "a@b.com" };
      Account.findOne.mockReturnValueOnce({ lean: () => leanResult });

      const res = await findByIdentifier("A@B.com");
      expect(Account.findOne).toHaveBeenCalledWith({ email: "a@b.com" });
      expect(res).toEqual(leanResult);
    });

    it("uses findByUsername otherwise", async () => {
      const leanResult = { _id: "4", username: "Admin" };
      Account.findOne.mockReturnValueOnce({ lean: () => leanResult });

      const res = await findByIdentifier("Admin");
      expect(Account.findOne).toHaveBeenCalledWith({ username: "Admin" });
      expect(res).toEqual(leanResult);
    });
  });

  describe("createAccount", () => {
    it("throws if accountType is missing", async () => {
      await expect(createAccount({ password: "x" })).rejects.toThrow("accountType and password are required");
    });

    it("throws if password is missing", async () => {
      await expect(createAccount({ accountType: "Student" })).rejects.toThrow("accountType and password are required");
    });

    it("throws if attempting to create an Admin account", async () => {
      await expect(createAccount({ accountType: "Admin", email: "a@b.com", password: "admin123" }))
        .rejects.toThrow("Admin accounts cannot be created via website");
    });

    it("throws if email is missing", async () => {
      await expect(createAccount({ accountType: "Student", password: "pw" })).rejects.toThrow("email is required");
    });

    it("throws if duplicate email exists", async () => {
      const q = { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue({ _id: "dup" }) };
      Account.findOne.mockReturnValueOnce(q);

      await expect(createAccount({ accountType: "Student", email: "a@b.com", password: "pw" }))
        .rejects.toThrow("An account with that email already exists");
    });

    it("creates non-admin accounts and returns plain object", async () => {
      const q = { select: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue(null) };
      Account.findOne.mockReturnValueOnce(q);

      bcrypt.hash.mockResolvedValueOnce("HASHED");
      Account.create.mockResolvedValueOnce({ toObject: () => ({ _id: "3", accountType: "Student", email: "a@b.com" }) });

      const res = await createAccount({ accountType: "Student", email: "A@B.com", password: "pw" });

      expect(Account.create).toHaveBeenCalledWith({
        accountType: "Student",
        email: "a@b.com",
        password: "HASHED",
        subjectArea: undefined
      });
      expect(res).toEqual({ _id: "3", accountType: "Student", email: "a@b.com" });
    });
  });

  describe("verifyPassword", () => {
    it("uses bcrypt.compare", async () => {
      bcrypt.compare.mockResolvedValueOnce(true);
      const ok = await verifyPassword({ password: "HASH" }, "pw");
      expect(ok).toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith("pw", "HASH");
    });
  });

  describe("ensureAdminExists", () => {
    it("does not create Admin if it already exists", async () => {
      Account.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue({ _id: "admin" }) });

      const res = await ensureAdminExists();

      expect(Account.create).not.toHaveBeenCalled();
      expect(res).toEqual({ created: false });
    });

    it("creates Admin if missing", async () => {
      Account.findOne.mockReturnValueOnce({ select: jest.fn().mockResolvedValue(null) });

      bcrypt.hash.mockResolvedValueOnce("ADMIN_HASHED");
      Account.create.mockResolvedValueOnce({ _id: "newAdmin" });

      const res = await ensureAdminExists();

      expect(Account.create).toHaveBeenCalledWith({
        accountType: "Admin",
        username: "Admin",
        password: "ADMIN_HASHED"
      });
      expect(res).toEqual({ created: true });
    });
  

describe("getAllNonAdminAccounts", () => {
  it("returns accounts excluding password (select -password)", async () => {
    const accounts = [{ _id: "1", accountType: "Student", email: "a@b.com" }];
    const q = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(accounts)
    };
    Account.find.mockReturnValueOnce(q);

    const res = await getAllNonAdminAccounts();

    expect(Account.find).toHaveBeenCalledWith({ accountType: { $ne: "Admin" } });
    expect(q.select).toHaveBeenCalledWith("-password");
    expect(res).toEqual(accounts);
  });
});

describe("deleteAccountByIdNonAdmin", () => {
  it("throws when accountId is missing", async () => {
    await expect(deleteAccountByIdNonAdmin("")).rejects.toThrow("accountId is required");
  });

  it("deletes a non-admin account by id", async () => {
    const deleted = { _id: "1", accountType: "Student", email: "a@b.com" };
    const q = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(deleted)
    };
    Account.findOneAndDelete.mockReturnValueOnce(q);

    const res = await deleteAccountByIdNonAdmin("1");

    expect(Account.findOneAndDelete).toHaveBeenCalledWith({ _id: "1", accountType: { $ne: "Admin" } });
    expect(q.select).toHaveBeenCalledWith("-password");
    expect(res).toEqual(deleted);
  });

  it("returns null if account not found / not deleted", async () => {
    const q = {
      select: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(null)
    };
    Account.findOneAndDelete.mockReturnValueOnce(q);

    const res = await deleteAccountByIdNonAdmin("missing");
    expect(res).toBeNull();
  });
});

});
});
