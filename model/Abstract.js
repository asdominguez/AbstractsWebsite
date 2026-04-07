const mongoose = require("mongoose");

const FeedbackSchema = new mongoose.Schema(
  {
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
    reviewerName: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    comment: { type: String, trim: true },
    decision: { type: String, enum: ["Approved", "Work In Progress", "Denied", "Comment"], default: "Comment" }
  },
  { _id: false }
);


const PendingFeedbackSchema = new mongoose.Schema(
  {
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
    reviewerName: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    comment: { type: String, trim: true },
    decision: { type: String, enum: ["Approved", "Work In Progress", "Denied"], required: true }
  },
  { _id: false }
);

const FeedbackDraftSchema = new mongoose.Schema(
  {
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
    reviewerName: { type: String, trim: true },
    lastUpdated: { type: Date, default: Date.now },
    comment: { type: String, trim: true, default: "" },
    decision: { type: String, enum: ["Approved", "Work In Progress", "Denied", ""], default: "" }
  },
  { _id: false }
);

const CommentSchema = new mongoose.Schema(
  {
    commentId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
    commenter: { type: String, trim: true, default: ""},
    postedDate: { type: Date, default: Date.now },
    comment: { type: String, trim: true, default: "" }
  },
  { _id: false }
);

const AbstractSchema = new mongoose.Schema(
  {
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, unique: true, index: true },
    studentName: { type: String, trim: true, required: true },
    studentField: { type: String, trim: true },

    title: { type: String, trim: true, default: "" },
    description: { type: String, trim: true, default: "" },
    presentationType: { type: String, enum: ["Poster", "Oral"], default: "Poster" },

    submissionState: { type: String, required: true, enum: ["Draft", "Submitted"], default: "Draft" },
    lastUpdated: { type: Date, default: Date.now },

    feedbackHistory: { type: [FeedbackSchema], default: [] },
    pendingFeedback: { type: [PendingFeedbackSchema], default: [] },
    feedbackDraft: { type: FeedbackDraftSchema, default: null },

    assignmentStatus: { type: String, enum: ["Unassigned", "Assigned"], default: "Unassigned" },
    assignedReviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", default: null, index: true },
    assignedReviewerName: { type: String, trim: true, default: "" },
    assignedAt: { type: Date, default: null },

    finalStatus: { type: String, required: true, enum: ["Pending", "Approved", "Denied"], default: "Pending" },
    isComplete: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },

    commentHistory: { type: [CommentSchema], default: []},

    isPreviousWinner: { type: Boolean, default: false}
  },
  { timestamps: true }
);

module.exports = mongoose.model("Abstract", AbstractSchema);
