const express = require("express");
const router = express.Router();

const {
  getIndex,
  getLogin,
  getDashboard,
  postLogin,
  postLogout,
  getRegister,
  getRegisterStudent,
  getRegisterReviewer,
  getRegisterCommittee,
  postRegisterStudent,
  postRegisterReviewer,
  postRegisterCommittee,
  requireAdmin,
  getAdminManageAccounts,
  postAdminDeleteAccount
} = require("../controller/homeController");

router.get("/", getIndex);

router.get("/login", getLogin);
router.post("/login", postLogin);

router.get("/dashboard", getDashboard);
router.post("/logout", postLogout);

router.get("/register", getRegister);

router.get("/register/student", getRegisterStudent);
router.post("/register/student", postRegisterStudent);

router.get("/register/reviewer", getRegisterReviewer);
router.post("/register/reviewer", postRegisterReviewer);

router.get("/register/committee", getRegisterCommittee);
router.post("/register/committee", postRegisterCommittee);


router.get("/admin/accounts", requireAdmin, getAdminManageAccounts);
router.post("/admin/accounts/:id/delete", requireAdmin, postAdminDeleteAccount);

module.exports = router;
