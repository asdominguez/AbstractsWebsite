const mongoose = require("mongoose");

const FeedbackSchema = new mongoose.Schema(
  {
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "Account" },
    reviewerName: { type: String, trim: true },
    date: { type: Date, default: Date.now },
    comment: { type: String, trim: true },
    decision: { type: String, enum: ["Approved", "Denied", "Comment"], default: "Comment" }
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

    finalStatus: { type: String, required: true, enum: ["Pending", "Approved", "Denied"], default: "Pending" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Abstract", AbstractSchema);
