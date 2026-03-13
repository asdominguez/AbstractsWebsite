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
  requireStudent,
  requireAdmin,
  getAdminManageAccounts,
  getAdminCreateAccountForm,
  postAdminCreateAccount,
  getAdminEditAccountForm,
  postAdminEditAccount,
  postAdminDeleteAccount,
  requireReviewer,
  requireCommittee,
  getReviewerApplication,
  postReviewerApplication,
  postCommitteeApproveApplication,
  postCommitteeDenyApplication,
  postCommitteeApproveAccount,
  postCommitteeDenyAccount,
  getCommitteeInfoForm,
  postCommitteeInfoForm,
  getCommitteeMembersPage,
  getAbstractSubmitForm,
  postAbstractSubmit,
  getStudentAbstractView
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

router.get("/committee-members", getCommitteeMembersPage);

router.get("/admin/accounts", requireAdmin, getAdminManageAccounts);
router.get("/admin/accounts/create", requireAdmin, getAdminCreateAccountForm);
router.post("/admin/accounts/create", requireAdmin, postAdminCreateAccount);
router.get("/admin/accounts/:id/edit", requireAdmin, getAdminEditAccountForm);
router.post("/admin/accounts/:id/edit", requireAdmin, postAdminEditAccount);
router.post("/admin/accounts/:id/delete", requireAdmin, postAdminDeleteAccount);

router.get("/reviewer/application", requireReviewer, getReviewerApplication);
router.post("/reviewer/application", requireReviewer, postReviewerApplication);

router.get("/committee/info", requireCommittee, getCommitteeInfoForm);
router.post("/committee/info", requireCommittee, postCommitteeInfoForm);

router.post("/committee/applications/:id/approve", requireCommittee, postCommitteeApproveApplication);
router.post("/committee/applications/:id/deny", requireCommittee, postCommitteeDenyApplication);
router.post("/committee/accounts/:id/approve", requireCommittee, postCommitteeApproveAccount);
router.post("/committee/accounts/:id/deny", requireCommittee, postCommitteeDenyAccount);

router.post("/admin/accounts/:id/approve", requireAdmin, postCommitteeApproveAccount);
router.post("/admin/accounts/:id/deny", requireAdmin, postCommitteeDenyAccount);

// Student abstract routes
router.get("/student/abstract/submit", requireStudent, getAbstractSubmitForm);
router.post("/student/abstract/submit", requireStudent, postAbstractSubmit);
router.get("/student/abstract", requireStudent, getStudentAbstractView);

module.exports = router;
