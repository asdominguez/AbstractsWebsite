jest.mock('../model/Abstract', () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
  findById: jest.fn(),
  find: jest.fn(),
  findByIdAndUpdate: jest.fn(),
  findByIdAndDelete: jest.fn()
}));

jest.mock('../model/Account', () => ({
  findById: jest.fn()
}));

const Abstract = require('../model/Abstract');
const Account = require('../model/Account');
const dao = require('../model/abstractDao');

function chain(result) {
  return {
    sort: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(result)
  };
}

function makeDoc(overrides = {}) {
  return {
    _id: 'abs1',
    studentId: 's1',
    submissionState: 'Submitted',
    finalStatus: 'Pending',
    isComplete: false,
    pendingFeedback: [],
    feedbackHistory: [],
    assignedReviewerId: 'r1',
    assignedReviewerName: 'Rev One',
    save: jest.fn().mockResolvedValue(),
    toObject: jest.fn().mockImplementation(function () {
      return {
        _id: this._id,
        studentId: this.studentId,
        submissionState: this.submissionState,
        finalStatus: this.finalStatus,
        isComplete: this.isComplete,
        pendingFeedback: this.pendingFeedback,
        feedbackHistory: this.feedbackHistory,
        feedbackDraft: this.feedbackDraft,
        assignedReviewerId: this.assignedReviewerId,
        assignedReviewerName: this.assignedReviewerName,
        completedAt: this.completedAt
      };
    }),
    ...overrides
  };
}

describe('abstractDao additional coverage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('getStudentAbstracts wraps result in array', async () => {
    Abstract.findOne.mockReturnValueOnce(chain({ studentId: 's1' }));
    const res = await dao.getStudentAbstracts('s1');
    expect(res).toEqual([{ studentId: 's1' }]);
  });

  test('getAbstractById validates id', async () => {
    await expect(dao.getAbstractById('')).rejects.toThrow('abstractId is required');
  });

  test('getSubmittedAbstracts, getAllAbstracts, and gallery query correctly', async () => {
    Abstract.find
      .mockReturnValueOnce(chain([{ _id: '1' }]))
      .mockReturnValueOnce(chain([{ _id: '2' }]))
      .mockReturnValueOnce(chain([{ _id: '3', title: 'Approved' }]));

    await expect(dao.getSubmittedAbstracts()).resolves.toEqual([{ _id: '1' }]);
    await expect(dao.getAllAbstracts()).resolves.toEqual([{ _id: '2' }]);
    await expect(dao.getApprovedGalleryAbstracts()).resolves.toEqual([{ _id: '3', title: 'Approved' }]);
  });

  test('getAssignedAbstractByReviewerId validates reviewerId', async () => {
    await expect(dao.getAssignedAbstractByReviewerId('')).rejects.toThrow('reviewerId is required');
  });

  test('assignAbstractToReviewer rejects invalid states', async () => {
    await expect(dao.assignAbstractToReviewer('', 'r1')).rejects.toThrow('abstractId is required');
    await expect(dao.assignAbstractToReviewer('a1', '')).rejects.toThrow('reviewerId is required');

    Abstract.findById.mockReturnValueOnce(chain(null));
    Account.findById.mockReturnValueOnce(chain({ accountType: 'Reviewer', status: 'Approved' }));
    Abstract.findOne.mockReturnValueOnce(chain(null));
    await expect(dao.assignAbstractToReviewer('a1', 'r1')).rejects.toThrow('Abstract not found');

    Abstract.findById.mockReturnValueOnce(chain({ _id: 'a1', submissionState: 'Draft' }));
    Account.findById.mockReturnValueOnce(chain({ accountType: 'Reviewer', status: 'Approved' }));
    Abstract.findOne.mockReturnValueOnce(chain(null));
    await expect(dao.assignAbstractToReviewer('a1', 'r1')).rejects.toThrow('Only submitted abstracts can be assigned');

    Abstract.findById.mockReturnValueOnce(chain({ _id: 'a1', submissionState: 'Submitted' }));
    Account.findById.mockReturnValueOnce(chain({ accountType: 'Reviewer', status: 'Pending' }));
    Abstract.findOne.mockReturnValueOnce(chain(null));
    await expect(dao.assignAbstractToReviewer('a1', 'r1')).rejects.toThrow('Reviewer must be an approved reviewer account');
  });

  test('assignAbstractToReviewer succeeds and enforces uniqueness', async () => {
    Abstract.findById.mockReturnValueOnce(chain({ _id: 'a1', submissionState: 'Submitted' }));
    Account.findById.mockReturnValueOnce(chain({ _id: 'r1', accountType: 'Reviewer', status: 'Approved', username: 'R Name' }));
    Abstract.findOne.mockReturnValueOnce(chain({ _id: 'other' }));
    await expect(dao.assignAbstractToReviewer('a1', 'r1')).rejects.toThrow('Reviewer already has an assigned abstract');

    Abstract.findById.mockReturnValueOnce(chain({ _id: 'a1', submissionState: 'Submitted', assignedReviewerId: 'r2' }));
    Account.findById.mockReturnValueOnce(chain({ _id: 'r1', accountType: 'Reviewer', status: 'Approved', username: 'R Name' }));
    Abstract.findOne.mockReturnValueOnce(chain(null));
    await expect(dao.assignAbstractToReviewer('a1', 'r1')).rejects.toThrow('Abstract is already assigned. Unassign it before reassigning.');

    Abstract.findById.mockReturnValueOnce(chain({ _id: 'a1', submissionState: 'Submitted' }));
    Account.findById.mockReturnValueOnce(chain({ _id: 'r1', accountType: 'Reviewer', status: 'Approved', username: 'R Name' }));
    Abstract.findOne.mockReturnValueOnce(chain(null));
    Abstract.findByIdAndUpdate.mockReturnValueOnce(chain({ _id: 'a1', assignedReviewerName: 'R Name' }));
    const res = await dao.assignAbstractToReviewer('a1', 'r1');
    expect(res.assignedReviewerName).toBe('R Name');
  });

  test('saveReviewerFeedbackDraft validates workflow and saves draft', async () => {
    await expect(dao.saveReviewerFeedbackDraft('', 'r1', {})).rejects.toThrow('abstractId is required');
    await expect(dao.saveReviewerFeedbackDraft('a1', '', {})).rejects.toThrow('reviewerId is required');

    Abstract.findById.mockResolvedValueOnce(null);
    Account.findById.mockReturnValueOnce(chain({ accountType: 'Reviewer', status: 'Approved' }));
    await expect(dao.saveReviewerFeedbackDraft('a1', 'r1', {})).rejects.toThrow('Abstract not found');

    Abstract.findById.mockResolvedValueOnce(makeDoc({ assignedReviewerId: 'r1' }));
    Account.findById.mockReturnValueOnce(chain({ accountType: 'Student', status: 'Approved' }));
    await expect(dao.saveReviewerFeedbackDraft('a1', 'r1', {})).rejects.toThrow('Reviewer must be an approved reviewer account');

    const saved = makeDoc({ assignedReviewerId: 'r1' });
    Abstract.findById.mockResolvedValueOnce(saved);
    Account.findById.mockReturnValueOnce(chain({ accountType: 'Reviewer', status: 'Approved', username: 'R1' }));
    const res = await dao.saveReviewerFeedbackDraft('a1', 'r1', { comment: 'Looks good', decision: 'wip' });
    expect(saved.save).toHaveBeenCalled();
    expect(res.feedbackDraft.comment).toBe('Looks good');
    expect(res.feedbackDraft.decision).toBe('Work In Progress');
  });

  test('submitReviewerFeedback validates and uses feedback draft fallback', async () => {
    const docNoComment = makeDoc({ assignedReviewerId: 'r1', feedbackDraft: {} });
    Abstract.findById.mockResolvedValueOnce(docNoComment);
    Account.findById.mockReturnValueOnce(chain({ accountType: 'Reviewer', status: 'Approved', username: 'R1' }));
    await expect(dao.submitReviewerFeedback('a1', 'r1', {})).rejects.toThrow('comment is required');

    const docNoDecision = makeDoc({ assignedReviewerId: 'r1', feedbackDraft: { comment: 'draft comment' } });
    Abstract.findById.mockResolvedValueOnce(docNoDecision);
    Account.findById.mockReturnValueOnce(chain({ accountType: 'Reviewer', status: 'Approved', username: 'R1' }));
    await expect(dao.submitReviewerFeedback('a1', 'r1', {})).rejects.toThrow('decision is required');

    const doc = makeDoc({ assignedReviewerId: 'r1', feedbackDraft: { comment: 'draft comment', decision: 'Approved' } });
    Abstract.findById.mockResolvedValueOnce(doc);
    Account.findById.mockReturnValueOnce(chain({ accountType: 'Reviewer', status: 'Approved', username: 'R1' }));
    const res = await dao.submitReviewerFeedback('a1', 'r1', {});
    expect(doc.pendingFeedback).toHaveLength(1);
    expect(doc.feedbackDraft).toBeNull();
    expect(res.pendingFeedback[0].decision).toBe('Approved');
  });

  test('approveReviewerFeedback handles all decision outcomes', async () => {
    const approvedDoc = makeDoc({ pendingFeedback: [{ reviewerId: 'r1', reviewerName: 'R1', date: new Date(), comment: 'ok', decision: 'Approved' }] });
    Abstract.findById.mockResolvedValueOnce(approvedDoc);
    const approved = await dao.approveReviewerFeedback('a1', 0);
    expect(approved.finalStatus).toBe('Approved');
    expect(approved.isComplete).toBe(true);

    const deniedDoc = makeDoc({ pendingFeedback: [{ reviewerId: 'r1', reviewerName: 'R1', date: new Date(), comment: 'no', decision: 'Denied' }] });
    Abstract.findById.mockResolvedValueOnce(deniedDoc);
    const denied = await dao.approveReviewerFeedback('a1', 0);
    expect(denied.finalStatus).toBe('Denied');

    const wipDoc = makeDoc({ pendingFeedback: [{ reviewerId: 'r1', reviewerName: 'R1', date: new Date(), comment: 'keep going', decision: 'Work In Progress' }] });
    Abstract.findById.mockResolvedValueOnce(wipDoc);
    const wip = await dao.approveReviewerFeedback('a1', 0);
    expect(wip.finalStatus).toBe('Pending');
    expect(wip.isComplete).toBe(false);
  });

  test('approveReviewerFeedback and denyReviewerFeedback validate missing pending feedback', async () => {
    await expect(dao.approveReviewerFeedback('', 0)).rejects.toThrow('abstractId is required');
    await expect(dao.approveReviewerFeedback('a1', -1)).rejects.toThrow('feedbackIndex is required');
    Abstract.findById.mockResolvedValueOnce(null);
    await expect(dao.approveReviewerFeedback('a1', 0)).rejects.toThrow('Abstract not found');
    Abstract.findById.mockResolvedValueOnce(makeDoc({ pendingFeedback: [] }));
    await expect(dao.approveReviewerFeedback('a1', 0)).rejects.toThrow('Pending feedback not found');

    await expect(dao.denyReviewerFeedback('', 0)).rejects.toThrow('abstractId is required');
    await expect(dao.denyReviewerFeedback('a1', -1)).rejects.toThrow('feedbackIndex is required');
    Abstract.findById.mockResolvedValueOnce(null);
    await expect(dao.denyReviewerFeedback('a1', 0)).rejects.toThrow('Abstract not found');
    Abstract.findById.mockResolvedValueOnce(makeDoc({ pendingFeedback: [] }));
    await expect(dao.denyReviewerFeedback('a1', 0)).rejects.toThrow('Pending feedback not found');

    const doc = makeDoc({ pendingFeedback: [{ comment: 'x' }] });
    Abstract.findById.mockResolvedValueOnce(doc);
    const res = await dao.denyReviewerFeedback('a1', 0);
    expect(res.pendingFeedback).toHaveLength(0);
  });

  test('updateAbstractById validates and clears assignment for drafts', async () => {
    await expect(dao.updateAbstractById('', {})).rejects.toThrow('abstractId is required');
    Abstract.findById.mockReturnValueOnce(chain(null));
    await expect(dao.updateAbstractById('a1', {})).rejects.toThrow('Abstract not found');

    Abstract.findById.mockReturnValueOnce(chain({ _id: 'a1', title: '', description: '', presentationType: 'Poster', submissionState: 'X', finalStatus: 'Pending' }));
    await expect(dao.updateAbstractById('a1', {})).rejects.toThrow('submissionState must be Draft or Submitted');

    Abstract.findById.mockReturnValueOnce(chain({ _id: 'a1', title: 't', description: 'd', presentationType: 'Poster', submissionState: 'Draft', finalStatus: 'Other' }));
    await expect(dao.updateAbstractById('a1', {})).rejects.toThrow('finalStatus must be Pending, Approved, or Denied');

    Abstract.findById.mockReturnValueOnce(chain({ _id: 'a1', title: '', description: '', presentationType: 'Poster', submissionState: 'Submitted', finalStatus: 'Pending' }));
    await expect(dao.updateAbstractById('a1', {})).rejects.toThrow('title is required when submissionState is Submitted');

    Abstract.findById.mockReturnValueOnce(chain({ _id: 'a1', title: 't', description: '', presentationType: 'Poster', submissionState: 'Submitted', finalStatus: 'Pending' }));
    await expect(dao.updateAbstractById('a1', {})).rejects.toThrow('description is required when submissionState is Submitted');

    Abstract.findById.mockReturnValueOnce(chain({ _id: 'a1', title: 't', description: 'd', presentationType: 'Poster', submissionState: 'Submitted', finalStatus: 'Pending' }));
    Abstract.findByIdAndUpdate.mockReturnValueOnce(chain({ _id: 'a1', submissionState: 'Draft', assignmentStatus: 'Unassigned' }));
    const res = await dao.updateAbstractById('a1', { submissionState: 'Draft', finalStatus: 'Pending', title: 'new', description: 'desc', presentationType: 'Oral' });
    expect(res.assignmentStatus).toBe('Unassigned');
  });

  test('deleteAbstractById, unassignAbstract, and setFinalApproval work', async () => {
    await expect(dao.deleteAbstractById('')).rejects.toThrow('abstractId is required');
    Abstract.findByIdAndDelete.mockReturnValueOnce(chain(null));
    await expect(dao.deleteAbstractById('a1')).rejects.toThrow('Abstract not found');
    Abstract.findByIdAndDelete.mockReturnValueOnce(chain({ _id: 'a1' }));
    await expect(dao.deleteAbstractById('a1')).resolves.toEqual({ _id: 'a1' });

    await expect(dao.unassignAbstract('')).rejects.toThrow('abstractId is required');
    Abstract.findByIdAndUpdate.mockReturnValueOnce(chain({ _id: 'a1', assignmentStatus: 'Unassigned' }));
    await expect(dao.unassignAbstract('a1')).resolves.toEqual({ _id: 'a1', assignmentStatus: 'Unassigned' });

    await expect(dao.setFinalApproval('', 'Approved')).rejects.toThrow('abstractId is required');
    await expect(dao.setFinalApproval('a1', 'Other')).rejects.toThrow('Invalid status');
    Abstract.findByIdAndUpdate.mockReturnValueOnce(chain({ _id: 'a1', finalStatus: 'Pending', isComplete: false }));
    await expect(dao.setFinalApproval('a1', 'Pending')).resolves.toEqual({ _id: 'a1', finalStatus: 'Pending', isComplete: false });
  });

  test("draft and submit validation rejects completed or invalid student input", async () => {
      Abstract.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ isComplete: true }) });
      await expect(dao.saveStudentAbstractDraft("s1", { title: "x" })).rejects.toThrow("This abstract is complete and can no longer be changed by the student");
  
      Abstract.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
      Account.findById.mockReturnValueOnce(chain(null));
      await expect(dao.saveStudentAbstractDraft("s1", { presentationType: "Demo" })).rejects.toThrow("presentationType must be Poster or Oral");
  
      Abstract.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
      await expect(dao.submitStudentAbstract("s1", { title: "T", description: "", presentationType: "Poster" })).rejects.toThrow("description is required");
  
      Abstract.findOne.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
      await expect(dao.submitStudentAbstract("s1", { title: "T", description: "D", presentationType: "Demo" })).rejects.toThrow("presentationType must be Poster or Oral");
    });
  
    test("gallery and winner search build escaped regex filters", async () => {
      const galleryChain = chain([{ _id: "a1" }]);
      const winnerChain = chain([{ _id: "w1" }]);
      Abstract.find.mockReturnValueOnce(galleryChain).mockReturnValueOnce(winnerChain);
  
      const gallery = await dao.getApprovedGalleryAbstracts("AI (2026)");
      const winners = await dao.getPreviousWinners("AI (2026)");
  
      expect(Abstract.find).toHaveBeenNthCalledWith(1, expect.objectContaining({
        title: expect.objectContaining({ $regex: "AI \\(2026\\)", $options: "i" })
      }));
      expect(Abstract.find).toHaveBeenNthCalledWith(2, expect.objectContaining({
        isPreviousWinner: true,
        title: expect.objectContaining({ $regex: "AI \\(2026\\)", $options: "i" })
      }));
      expect(gallery).toEqual([{ _id: "a1" }]);
      expect(winners).toEqual([{ _id: "w1" }]);
    });
  
    test("saveReviewerFeedbackDraft rejects wrong reviewer state and saves a valid draft", async () => {
      Abstract.findById.mockResolvedValueOnce(makeDoc({ assignedReviewerId: "other" }));
      Account.findById.mockReturnValueOnce(chain({ accountType: "Reviewer", status: "Approved", username: "Rev" }));
      await expect(dao.saveReviewerFeedbackDraft("abs1", "r1", { comment: "x", decision: "Approved" })).rejects.toThrow("You may only review your assigned abstract");
  
      Abstract.findById.mockResolvedValueOnce(makeDoc({ assignedReviewerId: "r1", submissionState: "Draft" }));
      Account.findById.mockReturnValueOnce(chain({ accountType: "Reviewer", status: "Approved", username: "Rev" }));
      await expect(dao.saveReviewerFeedbackDraft("abs1", "r1", { comment: "x", decision: "Approved" })).rejects.toThrow("Only submitted abstracts can receive reviewer feedback");
  
      Abstract.findById.mockResolvedValueOnce(makeDoc({ assignedReviewerId: "r1", finalStatus: "Approved", isComplete: true }));
      Account.findById.mockReturnValueOnce(chain({ accountType: "Reviewer", status: "Approved", username: "Rev" }));
      await expect(dao.saveReviewerFeedbackDraft("abs1", "r1", { comment: "x", decision: "Approved" })).rejects.toThrow("This abstract review is complete and can no longer be changed");
  
      Abstract.findById.mockResolvedValueOnce(makeDoc({ assignedReviewerId: "r1", pendingFeedback: [{ comment: "queued" }] }));
      Account.findById.mockReturnValueOnce(chain({ accountType: "Reviewer", status: "Approved", username: "Rev" }));
      await expect(dao.saveReviewerFeedbackDraft("abs1", "r1", { comment: "x", decision: "Approved" })).rejects.toThrow("There is already pending reviewer feedback awaiting committee review");
  
      const doc = makeDoc({ assignedReviewerId: "r1" });
      Abstract.findById.mockResolvedValueOnce(doc);
      Account.findById.mockReturnValueOnce(chain({ accountType: "Reviewer", status: "Approved", username: "Rev" }));
      const saved = await dao.saveReviewerFeedbackDraft("abs1", "r1", { comment: " Looks good ", decision: "wip" });
      expect(doc.feedbackDraft.comment).toBe("Looks good");
      expect(doc.feedbackDraft.decision).toBe("Work In Progress");
      expect(saved.assignedReviewerId).toBe("r1");
    });
  
    test("submitReviewerFeedback can use draft values and validates missing draft content", async () => {
      const missingDraft = makeDoc({ assignedReviewerId: "r1", feedbackDraft: { comment: "", decision: "" } });
      Abstract.findById.mockResolvedValueOnce(missingDraft);
      Account.findById.mockReturnValueOnce(chain({ accountType: "Reviewer", status: "Approved", username: "Rev" }));
      await expect(dao.submitReviewerFeedback("abs1", "r1", {})).rejects.toThrow("comment is required");
  
      const doc = makeDoc({ assignedReviewerId: "r1", feedbackDraft: { comment: " Draft comment ", decision: "denied" } });
      Abstract.findById.mockResolvedValueOnce(doc);
      Account.findById.mockReturnValueOnce(chain({ accountType: "Reviewer", status: "Approved", username: "Rev" }));
      const result = await dao.submitReviewerFeedback("abs1", "r1", {});
      expect(doc.pendingFeedback).toHaveLength(1);
      expect(doc.pendingFeedback[0].decision).toBe("Denied");
      expect(doc.feedbackDraft).toBeNull();
      expect(result.pendingFeedback).toHaveLength(1);
    });
  
    test("approve and deny reviewer feedback handle validation and work in progress outcome", async () => {
      await expect(dao.approveReviewerFeedback("", 0)).rejects.toThrow("abstractId is required");
      await expect(dao.approveReviewerFeedback("abs1", -1)).rejects.toThrow("feedbackIndex is required");
  
      Abstract.findById.mockResolvedValueOnce(null);
      await expect(dao.approveReviewerFeedback("abs1", 0)).rejects.toThrow("Abstract not found");
  
      Abstract.findById.mockResolvedValueOnce(makeDoc({ pendingFeedback: [] }));
      await expect(dao.approveReviewerFeedback("abs1", 0)).rejects.toThrow("Pending feedback not found");
  
      const wipDoc = makeDoc({ pendingFeedback: [{ reviewerId: "r1", reviewerName: "Rev", date: new Date(), comment: "revise", decision: "Work In Progress" }] });
      Abstract.findById.mockResolvedValueOnce(wipDoc);
      const approved = await dao.approveReviewerFeedback("abs1", 0);
      expect(approved.finalStatus).toBe("Pending");
      expect(approved.isComplete).toBe(false);
      expect(approved.feedbackHistory).toHaveLength(1);
  
      await expect(dao.denyReviewerFeedback("", 0)).rejects.toThrow("abstractId is required");
      await expect(dao.denyReviewerFeedback("abs1", -1)).rejects.toThrow("feedbackIndex is required");
  
      Abstract.findById.mockResolvedValueOnce(null);
      await expect(dao.denyReviewerFeedback("abs1", 0)).rejects.toThrow("Abstract not found");
  
      Abstract.findById.mockResolvedValueOnce(makeDoc({ pendingFeedback: [] }));
      await expect(dao.denyReviewerFeedback("abs1", 0)).rejects.toThrow("Pending feedback not found");
    });
  
    test("comment, update, delete, unassign, and final approval flows cover edge cases", async () => {
      await expect(dao.addComment("", "s1", { comment: "x" })).rejects.toThrow("abstractId is required");
      await expect(dao.addComment("abs1", "", { comment: "x" })).rejects.toThrow("studentId is required");
  
      Abstract.findById.mockResolvedValueOnce(makeDoc({ submissionState: "Submitted" }));
      Account.findById.mockReturnValueOnce(chain({ accountType: "Student", status: "Approved", email: "student@example.com" }));
      const commented = await dao.addComment("abs1", "s1", { comment: " Nice work " });
      expect(commented.commentHistory[0].comment).toBe("Nice work");
      expect(commented.commentHistory[0].commenter).toBe("student@example.com");
  
      Abstract.findById.mockResolvedValueOnce(makeDoc({ submissionState: "Submitted" }));
      Account.findById.mockReturnValueOnce(chain({ accountType: "Reviewer", status: "Approved", email: "r@example.com" }));
      await expect(dao.addComment("abs1", "s1", { comment: "x" })).rejects.toThrow("Commenter must be an approved student account");
  
      Abstract.findById.mockResolvedValueOnce(makeDoc({ submissionState: "Draft" }));
      Account.findById.mockReturnValueOnce(chain({ accountType: "Student", status: "Approved", email: "student@example.com" }));
      await expect(dao.addComment("abs1", "s1", { comment: "x" })).rejects.toThrow("Only submitted abstracts can receive comments");
  
      Abstract.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: "abs1", title: "Old", description: "Desc", presentationType: "Poster", submissionState: "Draft", finalStatus: "Pending", completedAt: null }) });
      await expect(dao.updateAbstractById("abs1", { submissionState: "Oops" })).rejects.toThrow("submissionState must be Draft or Submitted");
  
      Abstract.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: "abs1", title: "Old", description: "Desc", presentationType: "Poster", submissionState: "Draft", finalStatus: "Pending", completedAt: null }) });
      await expect(dao.updateAbstractById("abs1", { finalStatus: "Nope" })).rejects.toThrow("finalStatus must be Pending, Approved, or Denied");
  
      Abstract.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: "abs1", title: " ", description: "Desc", presentationType: "Poster", submissionState: "Draft", finalStatus: "Pending", completedAt: null }) });
      await expect(dao.updateAbstractById("abs1", { submissionState: "Submitted" })).rejects.toThrow("title is required when submissionState is Submitted");
  
      Abstract.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: "abs1", title: "Old", description: " ", presentationType: "Poster", submissionState: "Draft", finalStatus: "Pending", completedAt: null }) });
      await expect(dao.updateAbstractById("abs1", { submissionState: "Submitted" })).rejects.toThrow("description is required when submissionState is Submitted");
  
      Abstract.findById.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: "abs1", title: "Old", description: "Desc", presentationType: "Poster", submissionState: "Submitted", finalStatus: "Approved", completedAt: new Date("2024-01-01") }) });
      Abstract.findByIdAndUpdate.mockReturnValueOnce(chain({ _id: "abs1", finalStatus: "Approved", isComplete: true }));
      const updated = await dao.updateAbstractById("abs1", { finalStatus: "Approved" });
      expect(updated.isComplete).toBe(true);
  
      await expect(dao.deleteAbstractById("")).rejects.toThrow("abstractId is required");
      Abstract.findByIdAndDelete.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue(null) });
      await expect(dao.deleteAbstractById("abs1")).rejects.toThrow("Abstract not found");
  
      Abstract.findByIdAndDelete.mockReturnValueOnce({ lean: jest.fn().mockResolvedValue({ _id: "abs1" }) });
      await expect(dao.deleteAbstractById("abs1")).resolves.toEqual({ _id: "abs1" });
  
      await expect(dao.unassignAbstract("")).rejects.toThrow("abstractId is required");
      Abstract.findByIdAndUpdate.mockReturnValueOnce(chain({ _id: "abs1", assignmentStatus: "Unassigned" }));
      await expect(dao.unassignAbstract("abs1")).resolves.toEqual({ _id: "abs1", assignmentStatus: "Unassigned" });
  
      await expect(dao.setFinalApproval("", "Approved")).rejects.toThrow("abstractId is required");
      await expect(dao.setFinalApproval("abs1", "Bad")).rejects.toThrow("Invalid status");
      Abstract.findByIdAndUpdate.mockReturnValueOnce(chain({ _id: "abs1", finalStatus: "Pending", isComplete: false }));
      await expect(dao.setFinalApproval("abs1", "Pending")).resolves.toEqual({ _id: "abs1", finalStatus: "Pending", isComplete: false });
    });
});
