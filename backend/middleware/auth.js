const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "brandforge-dev-secret-change-in-prod";

function signToken(userId) {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });
}

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided" });

  const token = header.slice(7);
  try {
    const { userId } = jwt.verify(token, JWT_SECRET);
    const { rows } = await pool.query(
      "SELECT id,name,email,plan,is_admin FROM users WHERE id=$1",
      [userId]
    );
    if (!rows.length) return res.status(401).json({ message: "User not found" });
    req.user = rows[0];
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = { authMiddleware, signToken };
