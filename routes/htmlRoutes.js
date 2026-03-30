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
  requireCommitteeOrAdmin,
  getReviewerApplication,
  postReviewerApplication,
  getReviewerAssignedAbstractView,
  getAbstractManagementPage,
  getAbstractEditForm,
  postAbstractEdit,
  postAbstractDelete,
  postCommitteeAssignAbstract,
  postCommitteeUnassignAbstract,
  postCommitteeApproveAbstract,
  postCommitteeApproveApplication,
  postCommitteeDenyApplication,
  postCommitteeApproveAccount,
  postCommitteeDenyAccount,
  getCommitteeInfoForm,
  postCommitteeInfoForm,
  getCommitteeMembersPage,
  getAbstractSubmitForm,
  postAbstractSubmit,
  getStudentAbstractView,
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
router.get("/reviewer/abstract", requireReviewer, getReviewerAssignedAbstractView);

router.get("/committee/info", requireCommittee, getCommitteeInfoForm);
router.post("/committee/info", requireCommittee, postCommitteeInfoForm);

router.post("/committee/applications/:id/approve", requireCommittee, postCommitteeApproveApplication);
router.post("/committee/applications/:id/deny", requireCommittee, postCommitteeDenyApplication);
router.post("/committee/accounts/:id/approve", requireCommittee, postCommitteeApproveAccount);
router.post("/committee/accounts/:id/deny", requireCommittee, postCommitteeDenyAccount);
router.post("/committee/abstracts/:id/assign", requireCommittee, postCommitteeAssignAbstract);
router.post("/committee/abstracts/:id/unassign", requireCommittee, postCommitteeUnassignAbstract);
router.post("/committee/abstracts/:id/approvefinal", requireCommittee, postCommitteeApproveAbstract);

router.post("/admin/accounts/:id/approve", requireAdmin, postCommitteeApproveAccount);
router.post("/admin/accounts/:id/deny", requireAdmin, postCommitteeDenyAccount);

router.get("/committee/abstracts", requireCommitteeOrAdmin, getAbstractManagementPage);
router.get("/committee/abstracts/:id/edit", requireCommitteeOrAdmin, getAbstractEditForm);
router.post("/committee/abstracts/:id/edit", requireCommitteeOrAdmin, postAbstractEdit);
router.post("/committee/abstracts/:id/delete", requireCommitteeOrAdmin, postAbstractDelete);

router.get("/admin/abstracts", requireCommitteeOrAdmin, getAbstractManagementPage);
router.get("/admin/abstracts/:id/edit", requireCommitteeOrAdmin, getAbstractEditForm);
router.post("/admin/abstracts/:id/edit", requireCommitteeOrAdmin, postAbstractEdit);
router.post("/admin/abstracts/:id/delete", requireCommitteeOrAdmin, postAbstractDelete);

// Student abstract routes
router.get("/student/abstract/submit", requireStudent, getAbstractSubmitForm);
router.post("/student/abstract/submit", requireStudent, postAbstractSubmit);
router.get("/student/abstract", requireStudent, getStudentAbstractView);

module.exports = router;
