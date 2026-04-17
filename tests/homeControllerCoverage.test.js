jest.mock('../model/accountDao', () => ({
  createAccount: jest.fn(),
  findByIdentifier: jest.fn(),
  verifyPassword: jest.fn(),
  getAllNonAdminAccounts: jest.fn(),
  deleteAccountByIdNonAdmin: jest.fn(),
  getAllStatus: jest.fn(),
  setAccountStatus: jest.fn(),
  updateCommitteeInfo: jest.fn(),
  getCommitteeMemberInfoList: jest.fn(),
  getAccountById: jest.fn(),
  createAccountByAdmin: jest.fn(),
  updateAccountByAdmin: jest.fn(),
  getAccountsByTypeAndStatus: jest.fn()
}));

jest.mock('../model/applicationDao', () => ({
  createReviewerApplicationOnce: jest.fn(),
  getApplicationByReviewerId: jest.fn(),
  getApplicationsByStatus: jest.fn(),
  getApprovedReviewerApplications: jest.fn(),
  setApplicationStatus: jest.fn()
}));

jest.mock('../model/abstractDao', () => ({
  saveStudentAbstractDraft: jest.fn(),
  submitStudentAbstract: jest.fn(),
  saveStudentAbstract: jest.fn(),
  upsertStudentAbstract: jest.fn(),
  getAbstractByStudentId: jest.fn(),
  getAssignedAbstractsByReviewerId: jest.fn(),
  getAssignedAbstractByReviewerId: jest.fn(),
  saveReviewerFeedbackDraft: jest.fn(),
  submitReviewerFeedback: jest.fn(),
  getAllAbstracts: jest.fn(),
  getSubmittedAbstracts: jest.fn(),
  getAbstractById: jest.fn(),
  updateAbstractById: jest.fn(),
  deleteAbstractById: jest.fn(),
  assignAbstractToReviewer: jest.fn(),
  unassignAbstract: jest.fn(),
  setFinalApproval: jest.fn(),
  approveReviewerFeedback: jest.fn(),
  denyReviewerFeedback: jest.fn(),
  getApprovedGalleryAbstracts: jest.fn(),
  addComment: jest.fn()
}));


jest.mock('../model/announcementDao', () => ({
  getActiveAnnouncements: jest.fn(),
  createAnnouncement: jest.fn(),
  getAnnouncementsByCreator: jest.fn(),
  getAnnouncementByIdForCreator: jest.fn(),
  updateAnnouncementByIdForCreator: jest.fn(),
  deleteAnnouncementByIdForCreator: jest.fn()
}));
const controller = require('../controller/homeController');
const accountDao = require('../model/accountDao');
const applicationDao = require('../model/applicationDao');
const abstractDao = require('../model/abstractDao');
const announcementDao = require('../model/announcementDao');

function makeRes() {
  return {
    app: {},
    statusCode: 200,
    body: '',
    status: jest.fn(function (code) { this.statusCode = code; return this; }),
    send: jest.fn(function (body) { this.body = body; return this; }),
    sendFile: jest.fn(function (f) { this.file = f; return this; }),
    redirect: jest.fn(function (loc) { this.location = loc; return this; }),
    clearCookie: jest.fn(),
    render: undefined
  };
}

describe('homeController additional coverage', () => {
  beforeEach(() => jest.clearAllMocks());

  test('getDashboard routes pending committee to account status page and admin to dashboard html', async () => {
    let res = makeRes();
    controller.getDashboard({ session: { user: { accountType: 'Committee', status: 'Pending' } } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('Account Status');

    res = makeRes();
    await controller.getDashboard({ session: { user: { accountType: 'Admin', status: 'Approved' } } }, res);
    expect(res.body).toContain('Admin Dashboard');
    expect(res.body).toContain('Create Announcement');
  });

  test('getStudentDashboard renders no submission and completed submission states', async () => {
    abstractDao.getAbstractByStudentId.mockResolvedValueOnce(null);
    let res = makeRes();
    await controller.getStudentDashboard({ session: { user: { id: 's1', status: 'Approved' } } }, res);
    expect(res.body).toContain('Start Submission');

    abstractDao.getAbstractByStudentId.mockResolvedValueOnce({
      _id: 'a1', title: 'My Title', description: 'Desc', submissionState: 'Submitted',
      assignmentStatus: 'Assigned', assignedReviewerName: 'Rev', finalStatus: 'Approved', isComplete: true
    });
    res = makeRes();
    await controller.getStudentDashboard({ session: { user: { id: 's1', status: 'Approved' } } }, res);
    expect(res.body).toContain('Final Decision');
    expect(res.body).toContain('View Final Status');
  });

  test('getAbstractSubmitForm redirects when complete and otherwise renders form', async () => {
    abstractDao.getAbstractByStudentId.mockResolvedValueOnce({ finalStatus: 'Denied', isComplete: true });
    let res = makeRes();
    await controller.getAbstractSubmitForm({ session: { user: { id: 's1', status: 'Approved' } } }, res);
    expect(res.body).toContain('Abstract Locked');
    expect(res.body).toContain('View Final Status');

    abstractDao.getAbstractByStudentId.mockResolvedValueOnce({ title: 'Draft', description: 'Text', submissionState: 'Draft', presentationType: 'Poster', lastUpdated: new Date() });
    res = makeRes();
    await controller.getAbstractSubmitForm({ session: { user: { id: 's1', status: 'Approved' } } }, res);
    expect(res.body).toContain('Edit Your Abstract');
    expect(res.body).toContain('Save Draft');
  });

  test('getStudentAbstractView shows missing and existing abstract details', async () => {
    abstractDao.getAbstractByStudentId.mockResolvedValueOnce(null);
    let res = makeRes();
    await controller.getStudentAbstractView({ session: { user: { id: 's1' } } }, res);
    expect(res.body).toContain('You have not submitted an abstract yet.');

    abstractDao.getAbstractByStudentId.mockResolvedValueOnce({
      title: 'My Title', description: 'Desc', presentationType: 'Poster', finalStatus: 'Pending',
      isComplete: false, feedbackHistory: [{ reviewerName: 'R1', decision: 'WIP', comment: 'Revise', date: new Date() }],
      lastUpdated: new Date()
    });
    res = makeRes();
    await controller.getStudentAbstractView({ session: { user: { id: 's1' } } }, res);
    expect(res.body).toContain('Feedback History');
    expect(res.body).toContain('Edit / Resubmit');
  });

  test('reviewer application flows render and redirect correctly', async () => {
    let res = makeRes();
    await controller.getReviewerApplication({ session: { user: { id: 'r1', status: 'Pending' } } }, res);
    expect(res.location).toBe('/dashboard');

    applicationDao.getApplicationByReviewerId.mockResolvedValueOnce(null);
    res = makeRes();
    await controller.getReviewerApplication({ session: { user: { id: 'r1', status: 'Approved' } } }, res);
    expect(res.sendFile).toHaveBeenCalled();

    applicationDao.getApplicationByReviewerId.mockResolvedValueOnce({ status: 'Approved' });
    res = makeRes();
    await controller.getReviewerApplication({ session: { user: { id: 'r1', status: 'Approved' } } }, res);
    expect(res.location).toBe('/dashboard');

    applicationDao.getApplicationByReviewerId.mockResolvedValueOnce({ status: 'Pending', name: 'Jane', email: 'j@x.com', department: 'Bio', roles: ['Reviewer'] });
    res = makeRes();
    await controller.getReviewerApplication({ session: { user: { id: 'r1', status: 'Approved' } } }, res);
    expect(res.body).toContain('My Reviewer Application');
    expect(res.body).toContain('Pending');
  });

  test('postReviewerApplication handles existing and success', async () => {
    applicationDao.getApplicationByReviewerId.mockResolvedValueOnce({ _id: 'a1' });
    let res = makeRes();
    await controller.postReviewerApplication({ session: { user: { id: 'r1', status: 'Approved' } }, body: {} }, res);
    expect(res.statusCode).toBe(400);

    applicationDao.getApplicationByReviewerId.mockResolvedValueOnce(null);
    applicationDao.createReviewerApplicationOnce.mockResolvedValueOnce({ _id: 'a2' });
    res = makeRes();
    await controller.postReviewerApplication({ session: { user: { id: 'r1', status: 'Approved' } }, body: { name: 'Jane', roles: ['Reviewer'], department: 'Bio', email: 'j@x.com' } }, res);
    expect(res.location).toBe('/dashboard');
  });

  test('reviewer abstract page handles empty, draft, pending and complete states', async () => {
    abstractDao.getAssignedAbstractsByReviewerId.mockResolvedValueOnce([]);
    let res = makeRes();
    await controller.getReviewerAssignedAbstractView({ session: { user: { id: 'r1' } } }, res);
    expect(res.body).toContain('No abstract has been assigned to you.');

    abstractDao.getAssignedAbstractsByReviewerId.mockResolvedValueOnce([{
      _id: 'a1', title: 'T', description: 'D', studentName: 'Stu', studentField: 'Bio', presentationType: 'Poster',
      assignedAt: new Date(), pendingFeedback: [], feedbackHistory: [], feedbackDraft: { comment: 'draft', decision: 'Approved', lastUpdated: new Date() }, finalStatus: 'Pending', isComplete: false
    }]);
    res = makeRes();
    await controller.getReviewerAssignedAbstractView({ session: { user: { id: 'r1' } } }, res);
    expect(res.body).toContain('Draft Saved');
    expect(res.body).toContain('Submit Feedback');

    abstractDao.getAssignedAbstractsByReviewerId.mockResolvedValueOnce([{
      _id: 'a1', title: 'T', description: 'D', studentName: 'Stu', studentField: 'Bio', presentationType: 'Poster',
      assignedAt: new Date(), pendingFeedback: [{ reviewerName: 'R1', decision: 'Approved', comment: 'ok' }], feedbackHistory: [], finalStatus: 'Pending', isComplete: false
    }]);
    res = makeRes();
    await controller.getReviewerAssignedAbstractView({ session: { user: { id: 'r1' } } }, res);
    expect(res.body).toContain('awaiting committee review');

    abstractDao.getAssignedAbstractsByReviewerId.mockResolvedValueOnce([{
      _id: 'a1', title: 'T', description: 'D', studentName: 'Stu', studentField: 'Bio', presentationType: 'Poster',
      assignedAt: new Date(), pendingFeedback: [], feedbackHistory: [{ comment: 'done', decision: 'Approved', date: new Date() }], finalStatus: 'Approved', isComplete: true
    }]);
    res = makeRes();
    await controller.getReviewerAssignedAbstractView({ session: { user: { id: 'r1' } } }, res);
    expect(res.body).toContain('Final Status: Approved');
    expect(res.body).toContain('No additional reviewer edits are allowed');
  });

  test('postReviewerSubmitFeedback saves draft and submits final feedback', async () => {
    let res = makeRes();
    abstractDao.saveReviewerFeedbackDraft.mockResolvedValueOnce({});
    await controller.postReviewerSubmitFeedback({ session: { user: { id: 'r1' } }, params: { id: 'a1' }, body: { intent: 'draft', comment: 'x', decision: 'Approved' } }, res);
    expect(abstractDao.saveReviewerFeedbackDraft).toHaveBeenCalled();
    expect(res.location).toBe('/reviewer/abstract/a1');

    res = makeRes();
    abstractDao.submitReviewerFeedback.mockResolvedValueOnce({});
    await controller.postReviewerSubmitFeedback({ session: { user: { id: 'r1' } }, params: { id: 'a1' }, body: { intent: 'submit', comment: 'x', decision: 'Approved' } }, res);
    expect(abstractDao.submitReviewerFeedback).toHaveBeenCalled();
  });

  test('getLogin renders inline invalid credentials message and postLogin redirects back on bad credentials', async () => {
    let res = makeRes();
    controller.getLogin({ query: { error: 'invalid' } }, res);
    expect(res.body).toContain('Invalid credentials');

    accountDao.findByIdentifier.mockResolvedValueOnce(null);
    res = makeRes();
    await controller.postLogin({ body: { identifier: 'bad', password: 'wrong' } }, res);
    expect(res.location).toBe('/login?error=invalid');
  });

  test('announcement management pages render and mutation handlers redirect', async () => {
    announcementDao.getAnnouncementsByCreator.mockResolvedValueOnce([{ _id: 'n1', title: 'Notice', description: 'Desc', expiresAt: new Date('2030-01-01T12:00:00Z') }]);
    let res = makeRes();
    await controller.getManageAnnouncementsPage({ session: { user: { id: 'u1' } } }, res);
    expect(res.body).toContain('Manage Your Announcements');
    expect(res.body).toContain('/announcements/n1/edit');

    announcementDao.getAnnouncementByIdForCreator.mockResolvedValueOnce({ _id: 'n1', title: 'Notice', description: 'Desc', expiresAt: new Date('2030-01-01T12:00:00Z') });
    res = makeRes();
    await controller.getEditAnnouncementForm({ session: { user: { id: 'u1' } }, params: { id: 'n1' } }, res);
    expect(res.body).toContain('Edit Announcement');
    expect(res.body).toContain('Notice');

    announcementDao.updateAnnouncementByIdForCreator.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postEditAnnouncement({ session: { user: { id: 'u1' } }, params: { id: 'n1' }, body: { title: 'New', description: 'Updated', expiresAt: '2030-01-01T12:00' } }, res);
    expect(res.location).toBe('/announcements/manage');

    announcementDao.deleteAnnouncementByIdForCreator.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postDeleteAnnouncement({ session: { user: { id: 'u1' } }, params: { id: 'n1' } }, res);
    expect(res.location).toBe('/announcements/manage');
  });

  test('abstract management pages render and mutation handlers redirect', async () => {
    abstractDao.getAllAbstracts.mockResolvedValueOnce([{ _id: 'a1', studentName: 'Stu', studentField: 'Bio', title: 'T', presentationType: 'Poster', submissionState: 'Submitted', finalStatus: 'Pending', assignmentStatus: 'Unassigned' }]);
    let res = makeRes();
    await controller.getAbstractManagementPage({ session: { user: { accountType: 'Admin' } }, originalUrl: '/admin/abstracts' }, res);
    expect(res.body).toContain('Manage Abstracts');
    expect(res.body).toContain('/admin/abstracts/a1/edit');

    abstractDao.getAbstractById.mockResolvedValueOnce({ _id: 'a1', studentName: 'Stu', studentField: 'Bio', title: 'T', description: 'D', presentationType: 'Poster', submissionState: 'Submitted', finalStatus: 'Pending', assignmentStatus: 'Assigned', assignedReviewerName: 'Rev' });
    res = makeRes();
    await controller.getAbstractEditForm({ session: { user: { accountType: 'Admin' } }, params: { id: 'a1' }, originalUrl: '/admin/abstracts/a1/edit' }, res);
    expect(res.body).toContain('Edit Abstract');
    expect(res.body).toContain('Assigned to Rev');

    res = makeRes();
    abstractDao.updateAbstractById.mockResolvedValueOnce({});
    await controller.postAbstractEdit({ session: { user: { accountType: 'Admin' } }, params: { id: 'a1' }, body: { title: 'N' }, originalUrl: '/admin/abstracts/a1/edit' }, res);
    expect(res.location).toBe('/admin/abstracts');

    res = makeRes();
    abstractDao.deleteAbstractById.mockResolvedValueOnce({});
    await controller.postAbstractDelete({ session: { user: { accountType: 'Admin' } }, params: { id: 'a1' }, originalUrl: '/admin/abstracts/a1/delete' }, res);
    expect(res.location).toBe('/admin/abstracts');
  });

  test('committee dashboard and post handlers render/redirect', async () => {
    applicationDao.getApplicationsByStatus.mockResolvedValueOnce([{ _id: 'app1', name: 'Jane', department: 'Bio', email: 'j@x.com', roles: ['Reviewer'] }]);
    accountDao.getAllStatus.mockResolvedValueOnce([{ _id: 'u1', email: 's@x.com', accountType: 'Student', subjectArea: 'Bio' }]);
    abstractDao.getSubmittedAbstracts.mockResolvedValueOnce([{ _id: 'a1', studentName: 'Stu', studentField: 'Bio', title: 'T', presentationType: 'Poster', finalStatus: 'Pending', assignmentStatus: 'Unassigned' }]);
    accountDao.getAccountsByTypeAndStatus.mockResolvedValueOnce([{ _id: 'r1', username: 'Rev', subjectArea: 'Bio' }]);
    applicationDao.getApprovedReviewerApplications.mockResolvedValueOnce([{ reviewerId: 'r1' }]);
    abstractDao.getAllAbstracts.mockResolvedValueOnce([{ _id: 'a1', studentName: 'Stu', title: 'T', assignedReviewerName: 'Rev', pendingFeedback: [{ reviewerName: 'Rev', decision: 'Approved', comment: 'ok' }] }]);
    let res = makeRes();
    await controller.getCommitteeDashboard({ session: { user: { id: 'c1' } } }, res);
    expect(res.body).toContain('Committee Dashboard');
    expect(res.body).toContain('Eligible Reviewers');
    expect(res.body).toContain('Open Queue');
    expect(res.body).not.toContain('Release to Student');

    applicationDao.getApplicationsByStatus.mockResolvedValueOnce([{ _id: 'app1', name: 'Jane', department: 'Bio', email: 'j@x.com', roles: ['Reviewer'] }]);
    accountDao.getAllStatus.mockResolvedValueOnce([]);
    abstractDao.getSubmittedAbstracts.mockResolvedValueOnce([]);
    accountDao.getAccountsByTypeAndStatus.mockResolvedValueOnce([]);
    applicationDao.getApprovedReviewerApplications.mockResolvedValueOnce([]);
    abstractDao.getAllAbstracts.mockResolvedValueOnce([]);
    res = makeRes();
    await controller.getCommitteeApplicationsPage({ session: { user: { id: 'c1' } } }, res);
    expect(res.body).toContain('Jane');

    applicationDao.getApplicationsByStatus.mockResolvedValueOnce([]);
    accountDao.getAllStatus.mockResolvedValueOnce([{ _id: 'u1', email: 's@x.com', accountType: 'Student', subjectArea: 'Bio' }]);
    abstractDao.getSubmittedAbstracts.mockResolvedValueOnce([]);
    accountDao.getAccountsByTypeAndStatus.mockResolvedValueOnce([]);
    applicationDao.getApprovedReviewerApplications.mockResolvedValueOnce([]);
    abstractDao.getAllAbstracts.mockResolvedValueOnce([]);
    res = makeRes();
    await controller.getCommitteeAccountsPage({ session: { user: { id: 'c1' } } }, res);
    expect(res.body).toContain('Pending Student & Reviewer Accounts');

    applicationDao.getApplicationsByStatus.mockResolvedValueOnce([]);
    accountDao.getAllStatus.mockResolvedValueOnce([]);
    abstractDao.getSubmittedAbstracts.mockResolvedValueOnce([]);
    accountDao.getAccountsByTypeAndStatus.mockResolvedValueOnce([]);
    applicationDao.getApprovedReviewerApplications.mockResolvedValueOnce([]);
    abstractDao.getAllAbstracts.mockResolvedValueOnce([{ _id: 'a1', studentName: 'Stu', title: 'T', assignedReviewerName: 'Rev', pendingFeedback: [{ reviewerName: 'Rev', decision: 'Approved', comment: 'ok' }] }]);
    res = makeRes();
    await controller.getCommitteeFeedbackPage({ session: { user: { id: 'c1' } } }, res);
    expect(res.body).toContain('Release to Student');

    abstractDao.assignAbstractToReviewer.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postCommitteeAssignAbstract({ params: { id: 'a1' }, body: { reviewerId: 'r1' } }, res);
    expect(res.location).toBe('/committee/abstracts');

    abstractDao.unassignAbstract.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postCommitteeUnassignAbstract({ params: { id: 'a1' } }, res);
    expect(res.location).toBe('/committee/abstracts');

    abstractDao.setFinalApproval.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postCommitteeApproveAbstract({ params: { id: 'a1' } }, res);
    expect(res.location).toBe('/committee/abstracts');

    abstractDao.approveReviewerFeedback.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postCommitteeApproveReviewerFeedback({ params: { id: 'a1', index: '0' } }, res);
    expect(res.location).toBe('/committee/feedback');

    abstractDao.denyReviewerFeedback.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postCommitteeDenyReviewerFeedback({ params: { id: 'a1', index: '0' } }, res);
    expect(res.location).toBe('/committee/feedback');

    applicationDao.setApplicationStatus.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postCommitteeApproveApplication({ params: { id: 'app1' } }, res);
    expect(res.location).toBe('/committee/applications');

    applicationDao.setApplicationStatus.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postCommitteeDenyApplication({ params: { id: 'app1' } }, res);
    expect(res.location).toBe('/committee/applications');

    accountDao.getAccountById.mockResolvedValueOnce({ _id: 'u1', accountType: 'Student' });
    accountDao.setAccountStatus.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postCommitteeApproveAccount({ params: { id: 'u1' }, session: { user: { accountType: 'Committee' } } }, res);
    expect(res.location).toBe('/committee/accounts');

    accountDao.getAccountById.mockResolvedValueOnce({ _id: 'u1', accountType: 'Reviewer' });
    accountDao.setAccountStatus.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postCommitteeDenyAccount({ params: { id: 'u1' }, session: { user: { accountType: 'Committee' } } }, res);
    expect(res.location).toBe('/committee/accounts');
  });

  test('committee info, members, gallery, and admin account pages render', async () => {
    let res = makeRes();
    controller.getCommitteeInfoForm({}, res);
    expect(res.sendFile).toHaveBeenCalled();

    accountDao.updateCommitteeInfo.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postCommitteeInfoForm({ session: { user: { id: 'c1' } }, body: { name: 'Jane' } }, res);
    expect(res.location).toBe('/dashboard');

    accountDao.getCommitteeMemberInfoList.mockResolvedValueOnce([{ accountType: 'Committee', committeeInfo: { name: 'Jane', loyolaEmail: 'j@l.edu', departmentArea: 'Bio', description: 'Desc' } }]);
    res = makeRes();
    await controller.getCommitteeMembersPage({}, res);
    expect(res.body).toContain('Committee Member Info');
    expect(res.body).toContain('Jane');

    abstractDao.getApprovedGalleryAbstracts.mockResolvedValueOnce([{ _id: 'a1', title: 'Approved Title', studentName: 'Stu', presentationType: 'Poster' }]);
    res = makeRes();
    await controller.getAbstractGalleryPage({}, res);
    expect(res.body).toContain('Approved Abstract Gallery');
    expect(res.body).toContain('Approved Title');

    abstractDao.getAbstractById.mockResolvedValueOnce({ _id: 'a1', title: 'Approved Title', submissionState: 'Submitted', finalStatus: 'Approved', isComplete: true, presentationType: 'Poster', studentName: 'Stu', studentField: 'Bio', description: 'Full description', commentHistory: [], subjectArea: 'Biology' });
    res = makeRes();
    await controller.getAbstractGalleryDetailPage({ params: { id: 'a1' }, session: { user: { id: 's1', accountType: 'Student' } } }, res);
    expect(res.body).toContain('Full description');
    expect(res.body).toContain('gallery-comment-form');

    abstractDao.getAbstractById.mockResolvedValueOnce({ _id: 'a1', title: 'Approved Title', submissionState: 'Submitted', finalStatus: 'Approved', isComplete: true, presentationType: 'Poster', studentName: 'Stu', studentField: 'Bio', description: 'Full description', commentHistory: [] });
    res = makeRes();
    await controller.getAbstractGalleryDetailPage({ params: { id: 'a1' }, session: { user: { id: 'c1', accountType: 'Committee' } } }, res);
    expect(res.body).toContain('cannot leave gallery comments');

    res = makeRes();
    controller.getAdminCreateAccountForm({}, res);
    expect(res.body).toContain('Create Account');

    accountDao.createAccountByAdmin.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postAdminCreateAccount({ body: { accountType: 'Student', email: 's@x.com', password: 'pw' } }, res);
    expect(res.location).toBe('/admin/accounts');

    accountDao.getAccountById.mockResolvedValueOnce({ _id: 'u1', accountType: 'Reviewer', email: 'r@x.com', username: 'rev', status: 'Pending', subjectArea: 'Bio' });
    res = makeRes();
    await controller.getAdminEditAccountForm({ params: { id: 'u1' } }, res);
    expect(res.body).toContain('Edit Account');

    accountDao.updateAccountByAdmin.mockResolvedValueOnce({});
    res = makeRes();
    await controller.postAdminEditAccount({ params: { id: 'u1' }, body: { accountType: 'Reviewer', email: 'r@x.com' } }, res);
    expect(res.location).toBe('/admin/accounts');
  });

  test('gallery comments allow reviewers and block committee/admin users', async () => {
    let res = makeRes();
    abstractDao.addComment.mockResolvedValueOnce({});
    await controller.postStudentAddComment({ session: { user: { id: 'r1', accountType: 'Reviewer' } }, params: { id: 'a1' }, body: { comment: 'Nice work' } }, res);
    expect(abstractDao.addComment).toHaveBeenCalledWith('a1', 'r1', { comment: 'Nice work' });
    expect(res.location).toBe('/gallery/a1');

    res = makeRes();
    await controller.postStudentAddComment({ session: { user: { id: 'c1', accountType: 'Committee' } }, params: { id: 'a1' }, body: { comment: 'Nope' } }, res);
    expect(res.statusCode).toBe(403);
    expect(res.body).toContain('cannot leave gallery comments');
  });

});
