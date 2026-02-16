const mongoose = require("mongoose");

/**
 * Account schema
 * Fields that are not consistent across all account types are not required.
 * NOTE: Passwords are plaintext for now (upgrade to hashing later).
 */
const AccountSchema = new mongoose.Schema(
  {
    accountType: {
      type: String,
      required: true,
      enum: ["Student", "Reviewer", "Committee", "Admin"]
    },
    username: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    password: { type: String, required: true },
    subjectArea: { type: String, trim: true },
    status: { type: String, required: true, enum: ["Pending", "Approved", "Denied"], default: "Pending" },
  },
  { timestamps: true }
);

// Uniqueness where present (sparse allows null/undefined for types that don't use the field)
AccountSchema.index({ username: 1 }, { unique: true, sparse: true });
AccountSchema.index({ email: 1 }, { unique: true, sparse: true });
AccountSchema.index({ accountType: 1 });

module.exports = mongoose.model("Account", AccountSchema);
