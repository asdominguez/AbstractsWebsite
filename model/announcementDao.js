const Announcement = require("./Announcement");

async function createAnnouncement(data) {
  const title = String(data?.title || "").trim();
  const description = String(data?.description || "").trim();
  const createdById = String(data?.createdById || "").trim();
  const createdByName = String(data?.createdByName || "").trim();
  const createdByRole = String(data?.createdByRole || "").trim();
  const expiresAt = data?.expiresAt ? new Date(data.expiresAt) : null;

  if (!title) throw new Error("title is required");
  if (!description) throw new Error("description is required");
  if (!createdById) throw new Error("createdById is required");
  if (!createdByName) throw new Error("createdByName is required");
  if (!["Committee", "Admin"].includes(createdByRole)) throw new Error("createdByRole must be Committee or Admin");
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) throw new Error("A valid expiry date and time is required");
  if (expiresAt <= new Date()) throw new Error("Expiry date and time must be in the future");

  return Announcement.create({
    title,
    description,
    createdById,
    createdByName,
    createdByRole,
    expiresAt
  });
}

async function getActiveAnnouncements(now = new Date()) {
  return Announcement.find({
    expiresAt: { $gt: now },
    isDismissed: false
  })
    .sort({ createdAt: -1 })
    .lean();
}

async function getAnnouncementsByCreator(createdById, now = new Date()) {
  const creatorId = String(createdById || '').trim();
  if (!creatorId) return [];

  return Announcement.find({ createdById: creatorId, expiresAt: { $gt: now } })
    .sort({ createdAt: -1 })
    .lean();
}

async function getAnnouncementByIdForCreator(id, createdById) {
  const creatorId = String(createdById || '').trim();
  if (!id || !creatorId) return null;
  return Announcement.findOne({ _id: id, createdById: creatorId }).lean();
}

async function updateAnnouncementByIdForCreator(id, createdById, data) {
  const creatorId = String(createdById || '').trim();
  if (!id) throw new Error('announcement id is required');
  if (!creatorId) throw new Error('createdById is required');

  const title = String(data?.title || '').trim();
  const description = String(data?.description || '').trim();
  const expiresAt = data?.expiresAt ? new Date(data.expiresAt) : null;

  if (!title) throw new Error('title is required');
  if (!description) throw new Error('description is required');
  if (!expiresAt || Number.isNaN(expiresAt.getTime())) throw new Error('A valid expiry date and time is required');
  if (expiresAt <= new Date()) throw new Error('Expiry date and time must be in the future');

  const updated = await Announcement.findOneAndUpdate(
    { _id: id, createdById: creatorId },
    { $set: { title, description, expiresAt } },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) throw new Error('Announcement not found');
  return updated;
}

async function deleteAnnouncementByIdForCreator(id, createdById) {
  const creatorId = String(createdById || '').trim();
  if (!id) throw new Error('announcement id is required');
  if (!creatorId) throw new Error('createdById is required');

  const deleted = await Announcement.findOneAndDelete({ _id: id, createdById: creatorId }).lean();
  if (!deleted) throw new Error('Announcement not found');
  return deleted;
}

module.exports = {
  createAnnouncement,
  getActiveAnnouncements,
  getAnnouncementsByCreator,
  getAnnouncementByIdForCreator,
  updateAnnouncementByIdForCreator,
  deleteAnnouncementByIdForCreator
};
