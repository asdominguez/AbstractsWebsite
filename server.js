const express = require("express");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo");
require("dotenv").config();

const db = require("./config/db");
const htmlRoutes = require("./routes/htmlRoutes");
const { ensureAdminExists } = require("./model/accountDao");

const app = express();

// Basic middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static assets
app.use("/css", express.static(path.join(__dirname, "view", "css")));
app.use("/js", express.static(path.join(__dirname, "view", "js")));

// Sessions MUST be registered BEFORE routes so req.session exists.

let sessionOptions = {
  secret: process.env.SESSION_SECRET || "dev_session_secret_change_me",
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax" }
};

try {
  if (process.env.DB_URI) {
    sessionOptions.store = MongoStore.create({
      mongoUrl: process.env.DB_URI,
      collectionName: "sessions",
      ttl: 60 * 60 * 24 * 7 // 7 days
    });
  }
} catch (err) {
  // If store creation fails for any reason, fall back to MemoryStore.
  console.warn("[startup] Session store init failed (falling back to memory):", err.message);
}

app.use(session(sessionOptions));

// Connect DB + seed Admin (separate from sessions)
(async () => {
  try {
    await db.connect();
    await ensureAdminExists();
    console.log("[startup] DB connected and default admin ensured.");
  } catch (err) {
    console.warn("[startup] DB/admin init failed:", err.message);
  }
})();

// Routes
app.use("/", htmlRoutes);

// 404
app.use((req, res) => res.status(404).send("Not Found"));

// Basic error handler
app.use((err, req, res, next) => {
  console.error("[error]", err);
  res.status(500).send("Server error");
});

if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}

module.exports = app;
