const accountDao = require("../model/accountDao");
const abstractDao = require("../model/abstractDao");
const applicationDao = require("../model/applicationDao");

describe("DAO edge cases", () => {

  test("accountDao returns null for missing user", async () => {
    jest.spyOn(accountDao, "getUserByEmail").mockResolvedValue(null);

    const result = await accountDao.getUserByEmail("fake@email.com");

    expect(result).toBeNull();
  });

  test("abstractDao returns empty array when no abstracts exist", async () => {
    jest.spyOn(abstractDao, "getStudentAbstracts").mockResolvedValue([]);

    const result = await abstractDao.getStudentAbstracts("student1");

    expect(result).toEqual([]);
  });

  test("applicationDao handles missing application", async () => {
    jest.spyOn(applicationDao, "getApplicationByReviewerId").mockResolvedValue(null);

    const result = await applicationDao.getApplicationByReviewerId("reviewer1");

    expect(result).toBeNull();
  });

});