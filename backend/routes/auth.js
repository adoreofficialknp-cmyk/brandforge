const express    = require("express");
const bcrypt     = require("bcryptjs");
const crypto     = require("crypto");
const nodemailer = require("nodemailer");
const { pool }   = require("../db");
const { authMiddleware, signToken } = require("../middleware/auth");
const { authLimiter } = require("../middleware/rateLimit");

const router = express.Router();

function formatUser(u) {
  return { id: u.id, name: u.name, email: u.email, plan: u.plan || "starter", is_admin: u.is_admin || false };
}

function adminOnly(req, res, next) {
  if (!req.user?.is_admin) return res.status(403).json({ message: "Admin access required" });
  next();
}

function getMailer() {
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

// ── POST /auth/signup ─────────────────────────────────────────────────────────
router.post("/signup", authLimiter, async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ message: "Name, email and password are required" });
  if (password.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters" });
  try {
    const existing = await pool.query("SELECT id FROM users WHERE email=$1", [email.toLowerCase()]);
    if (existing.rows.length)
      return res.status(409).json({ message: "Email already registered" });
    const hashed = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, email_verified)
       VALUES ($1,$2,$3,TRUE) RETURNING id,name,email,plan,is_admin`,
      [name.trim(), email.toLowerCase(), hashed]
    );
    const token = signToken(rows[0].id);
    res.status(201).json({ token, user: formatUser(rows[0]) });
  } catch (err) {
    console.error("Signup error:", err);
    res.status(500).json({ message: "Server error during signup" });
  }
});

// ── POST /auth/login ──────────────────────────────────────────────────────────
router.post("/login", authLimiter, async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ message: "Email and password are required" });
  try {
    const { rows } = await pool.query("SELECT * FROM users WHERE email=$1", [email.toLowerCase()]);
    if (!rows.length) return res.status(401).json({ message: "Invalid email or password" });
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) return res.status(401).json({ message: "Invalid email or password" });
    const token = signToken(rows[0].id);
    res.json({ token, user: formatUser(rows[0]) });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
});

// ── GET /auth/me ──────────────────────────────────────────────────────────────
router.get("/me", authMiddleware, (req, res) => res.json({ user: formatUser(req.user) }));

// ── POST /auth/forgot-password ────────────────────────────────────────────────
router.post("/forgot-password", authLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Email is required" });

  try {
    const { rows } = await pool.query("SELECT id FROM users WHERE email=$1", [email.toLowerCase()]);
    // Always return 200 to prevent email enumeration
    if (!rows.length) return res.json({ message: "If that email exists, a reset link has been sent." });

    const token   = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Invalidate old tokens
    await pool.query("UPDATE password_reset_tokens SET used=TRUE WHERE user_id=$1", [rows[0].id]);
    await pool.query(
      "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1,$2,$3)",
      [rows[0].id, token, expires]
    );

    const mailer = getMailer();
    if (mailer) {
      const resetUrl = `${process.env.APP_URL || "http://localhost:5173"}/reset-password?token=${token}`;
      await mailer.sendMail({
        from:    process.env.EMAIL_FROM || "BrandForge <noreply@brandforge.com>",
        to:      email,
        subject: "Reset your BrandForge password",
        html: `
          <h2>Reset Your Password</h2>
          <p>Click the link below to reset your password. It expires in 1 hour.</p>
          <a href="${resetUrl}" style="
            display:inline-block;padding:12px 24px;background:#6366F1;
            color:#fff;text-decoration:none;border-radius:8px;font-weight:600
          ">Reset Password</a>
          <p style="color:#888;margin-top:16px">If you didn't request this, ignore this email.</p>
        `,
      });
    } else {
      console.log(`[DEV] Password reset token for ${email}: ${token}`);
    }

    res.json({ message: "If that email exists, a reset link has been sent." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Could not process request" });
  }
});

// ── POST /auth/reset-password ─────────────────────────────────────────────────
router.post("/reset-password", authLimiter, async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password)
    return res.status(400).json({ message: "Token and password are required" });
  if (password.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters" });

  try {
    const { rows } = await pool.query(
      `SELECT * FROM password_reset_tokens
       WHERE token=$1 AND used=FALSE AND expires_at > NOW()`,
      [token]
    );
    if (!rows.length)
      return res.status(400).json({ message: "Invalid or expired reset link" });

    const hashed = await bcrypt.hash(password, 12);
    await pool.query("UPDATE users SET password=$1, updated_at=NOW() WHERE id=$2", [hashed, rows[0].user_id]);
    await pool.query("UPDATE password_reset_tokens SET used=TRUE WHERE id=$1", [rows[0].id]);

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    console.error("Reset password error:", err);
    res.status(500).json({ message: "Could not reset password" });
  }
});

// ── Admin routes ──────────────────────────────────────────────────────────────
router.get("/admin/users", authMiddleware, adminOnly, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT id,name,email,plan,is_admin,created_at FROM users ORDER BY created_at DESC"
  );
  res.json({ users: rows });
});

router.get("/admin/stats", authMiddleware, adminOnly, async (req, res) => {
  const [users, projects, payments, aiUsage] = await Promise.all([
    pool.query("SELECT COUNT(*) total, COUNT(*) FILTER (WHERE plan='pro') pro, COUNT(*) FILTER (WHERE plan='enterprise') enterprise FROM users"),
    pool.query("SELECT COUNT(*) total FROM projects"),
    pool.query("SELECT COUNT(*) total, COALESCE(SUM(amount_inr),0) revenue FROM payments WHERE status='completed'"),
    pool.query("SELECT COUNT(*) total, COALESCE(SUM(tokens_used),0) tokens FROM ai_usage"),
  ]);
  res.json({
    users:   { total: +users.rows[0].total, pro: +users.rows[0].pro, enterprise: +users.rows[0].enterprise },
    projects:{ total: +projects.rows[0].total },
    payments:{ total: +payments.rows[0].total, revenue: +payments.rows[0].revenue },
    ai:      { total: +aiUsage.rows[0].total, tokens: +aiUsage.rows[0].tokens },
  });
});

router.patch("/admin/users/:id/plan", authMiddleware, adminOnly, async (req, res) => {
  const { plan } = req.body;
  if (!["starter","pro","enterprise"].includes(plan))
    return res.status(400).json({ message: "Invalid plan" });
  const { rows } = await pool.query(
    "UPDATE users SET plan=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name,email,plan,is_admin",
    [plan, req.params.id]
  );
  if (!rows.length) return res.status(404).json({ message: "User not found" });
  res.json({ user: formatUser(rows[0]) });
});

router.delete("/admin/users/:id", authMiddleware, adminOnly, async (req, res) => {
  if (String(req.params.id) === String(req.user.id))
    return res.status(400).json({ message: "Cannot delete your own account" });
  const { rowCount } = await pool.query("DELETE FROM users WHERE id=$1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ message: "User not found" });
  res.json({ message: "User deleted" });
});

module.exports = router;
