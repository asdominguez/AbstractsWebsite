const mongoose = require("mongoose");

const AnnouncementSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true, maxlength: 120 },
    description: { type: String, trim: true, required: true, maxlength: 4000 },
    createdById: { type: mongoose.Schema.Types.ObjectId, ref: "Account", required: true },
    createdByName: { type: String, trim: true, required: true },
    createdByRole: { type: String, trim: true, enum: ["Committee", "Admin"], required: true },
    expiresAt: { type: Date, required: true },
    isDismissed: { type: Boolean, default: false }
  },
  { timestamps: true }
);

AnnouncementSchema.index({ expiresAt: 1 });
AnnouncementSchema.index({ createdAt: -1 });

module.exports = mongoose.model("Announcement", AnnouncementSchema);
