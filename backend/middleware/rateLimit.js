const rateLimit = require("express-rate-limit");

// ── Auth routes: 10 attempts per 15 minutes ───────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Too many login attempts. Try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── AI generation: 20 requests per hour per IP ────────────────────────────────
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { message: "AI rate limit reached. Try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
});

// ── Image API: 200 per hour ───────────────────────────────────────────────────
const imageLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  message: { message: "Image API limit reached." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Asset upload: 50 per hour ─────────────────────────────────────────────────
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { message: "Upload limit reached. Try again in an hour." },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { authLimiter, aiLimiter, imageLimiter, uploadLimiter };
