const mongoose = require("mongoose");

const ApplicationSchema = new mongoose.Schema(
  {
    reviewerId: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true, unique: true },
    name: { type: String, required: true },
    roles: {
      type: [String],
      enum: ["Reviewer of Abstracts", "Judge for Oral Presentations", "Judge for Poster Presentations"],
      required: true
    },
    department: { type: String, required: true },
    email: { type: String, required: true },
    status: { type: String, enum: ["Pending", "Approved", "Denied"], default: "Pending" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Application", ApplicationSchema);
