require("dotenv").config();
const express  = require("express");
const cors     = require("cors");
const helmet   = require("helmet");
const path     = require("path");

const authRoutes    = require("./routes/auth");
const projectRoutes = require("./routes/projects");
const pricingRoutes = require("./routes/pricing");
const paymentRoutes = require("./routes/payment");
const deployRoutes  = require("./routes/deploy");
const aiRoutes      = require("./routes/ai");
const imageRoutes   = require("./routes/images");
const assetRoutes   = require("./routes/assets");
const { initDB }    = require("./db");

const app = express();

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false, // disabled so React app works with CDN scripts
  crossOriginEmbedderPolicy: false,
}));

// ── CORS ─────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  app.use(cors({ origin: true, credentials: true }));
} else {
  const allowedOrigins = [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "http://localhost:3000",
  ];
  app.use(cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.some(o => origin.startsWith(o))) cb(null, true);
      else cb(new Error("Not allowed by CORS: " + origin));
    },
    credentials: true,
  }));
}

// ── Body parsing ──────────────────────────────────────────────────────────────
// Note: /payment/webhook needs raw body for signature verification — mount before json()
app.use("/payment/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// ── API Routes ────────────────────────────────────────────────────────────────
app.use("/auth",     authRoutes);
app.use("/projects", projectRoutes);
app.use("/pricing",  pricingRoutes);
app.use("/payment",  paymentRoutes);
app.use("/deploy",   deployRoutes);
app.use("/api/ai",   aiRoutes);
app.use("/api/images", imageRoutes);
app.use("/api/assets", assetRoutes);

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/health", (req, res) =>
  res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2.0.0" })
);

// ── Serve React frontend in production ────────────────────────────────────────
if (process.env.NODE_ENV === "production") {
  const frontendDist = path.join(__dirname, "../frontend/dist");
  app.use(express.static(frontendDist));
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/auth") ||
        req.path.startsWith("/projects") || req.path.startsWith("/payment") ||
        req.path.startsWith("/deploy") || req.path.startsWith("/pricing")) {
      return res.status(404).json({ message: "API route not found" });
    }
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(err.status || 500).json({ message: err.message || "Internal server error" });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
initDB()
  .then(() => app.listen(PORT, () => console.log(`✅ BrandForge v2 running on port ${PORT}`)))
  .catch(err => { console.error("❌ DB init failed:", err.message); process.exit(1); });
