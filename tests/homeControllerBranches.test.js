const controller = require("../controller/homeController");
const abstractDao = require("../model/abstractDao");
const applicationDao = require("../model/applicationDao");

jest.mock("../model/abstractDao");
jest.mock("../model/applicationDao");

describe("homeController branch coverage", () => {

  test("postAbstractSubmit rejects empty abstract", async () => {
    const req = {
      session: { user: { id: "s1" } },
      body: { title: "", description: "" }
    };

    const res = {
      redirect: jest.fn(),
      render: jest.fn()
    };

    await controller.postAbstractSubmit(req, res);

    expect(res.render).toHaveBeenCalled();
  });

  test("postAbstractSubmit saves final submission", async () => {
    abstractDao.saveStudentAbstract.mockResolvedValueOnce();

    const req = {
      session: { user: { id: "s1" } },
      body: {
        title: "Test Title",
        description: "Test description",
        intent: "submit"
      }
    };

    const res = {
      redirect: jest.fn(),
      render: jest.fn()
    };

    await controller.postAbstractSubmit(req, res);

    expect(abstractDao.saveStudentAbstract).toHaveBeenCalled();
    expect(res.redirect).toHaveBeenCalled();
  });

  test("reviewer dashboard with no application", async () => {
    applicationDao.getApplicationByReviewerId.mockResolvedValue(null);

    const req = {
      session: { user: { id: "r1", role: "reviewer" } }
    };

    const res = {
      render: jest.fn()
    };

    await controller.getReviewerDashboard(req, res);

    expect(res.render).toHaveBeenCalled();
  });

});