const express = require("express");
const crypto  = require("crypto");
const { pool } = require("../db");
const { authMiddleware } = require("../middleware/auth");

const router = express.Router();

const PLAN_PRICES = { pro: 49900, enterprise: 199900 };

function getRazorpay() {
  const key_id = process.env.RAZORPAY_KEY_ID, key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_id || !key_secret) return null;
  const Razorpay = require("razorpay");
  return new Razorpay({ key_id, key_secret });
}

// ── POST /payment/create-order ────────────────────────────────────────────────
router.post("/create-order", authMiddleware, async (req, res) => {
  const { plan } = req.body;
  if (!PLAN_PRICES[plan]) return res.status(400).json({ message: "Invalid plan" });
  const rzp = getRazorpay();
  if (!rzp) return res.status(503).json({ message: "Payment gateway not configured." });

  try {
    const order = await rzp.orders.create({
      amount: PLAN_PRICES[plan], currency: "INR",
      notes: { userId: req.user.id, plan },
    });
    await pool.query(
      "INSERT INTO payments (user_id, plan, razorpay_order_id, amount_inr, status) VALUES ($1,$2,$3,$4,'pending')",
      [req.user.id, plan, order.id, PLAN_PRICES[plan] / 100]
    );
    res.json({ order, key: process.env.RAZORPAY_KEY_ID });
  } catch (err) {
    console.error("Create order error:", err);
    res.status(500).json({ message: "Could not create payment order" });
  }
});

// ── POST /payment/verify ──────────────────────────────────────────────────────
router.post("/verify", authMiddleware, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_secret) return res.status(503).json({ message: "Payment gateway not configured" });

  const expected = crypto.createHmac("sha256", key_secret)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest("hex");
  if (expected !== razorpay_signature)
    return res.status(400).json({ message: "Payment verification failed — signature mismatch" });

  try {
    const { rows: payRows } = await pool.query(
      "SELECT * FROM payments WHERE razorpay_order_id=$1 AND user_id=$2",
      [razorpay_order_id, req.user.id]
    );
    if (!payRows.length) return res.status(404).json({ message: "Order not found" });

    await pool.query(
      "UPDATE payments SET status='completed', razorpay_payment_id=$1, razorpay_signature=$2 WHERE razorpay_order_id=$3",
      [razorpay_payment_id, razorpay_signature, razorpay_order_id]
    );
    const { rows } = await pool.query(
      "UPDATE users SET plan=$1,updated_at=NOW() WHERE id=$2 RETURNING id,name,email,plan,is_admin",
      [payRows[0].plan, req.user.id]
    );
    res.json({ message: `Upgraded to ${payRows[0].plan}!`, user: rows[0] });
  } catch (err) {
    console.error("Verify error:", err);
    res.status(500).json({ message: "Error processing payment" });
  }
});

// ── POST /payment/webhook ─────────────────────────────────────────────────────
// Razorpay sends this for async payment events (browser-close safety net)
// Must be mounted BEFORE express.json() in server.js — receives raw body
router.post("/webhook", async (req, res) => {
  const key_secret = process.env.RAZORPAY_KEY_SECRET;
  if (!key_secret) return res.status(200).json({ ok: true }); // gracefully ignore

  const signature = req.headers["x-razorpay-signature"];
  const body      = req.body; // raw Buffer (mounted before express.json)

  const expected = crypto.createHmac("sha256", key_secret)
    .update(body).digest("hex");

  if (expected !== signature) {
    console.warn("Webhook signature mismatch — ignoring");
    return res.status(200).json({ ok: true }); // always 200 to Razorpay
  }

  try {
    const event = JSON.parse(body.toString());
    if (event.event === "payment.captured") {
      const payment = event.payload.payment.entity;
      const orderId = payment.order_id;

      const { rows: payRows } = await pool.query(
        "SELECT * FROM payments WHERE razorpay_order_id=$1 AND status='pending'",
        [orderId]
      );
      if (!payRows.length) return res.status(200).json({ ok: true });

      await pool.query(
        "UPDATE payments SET status='completed', razorpay_payment_id=$1 WHERE razorpay_order_id=$2",
        [payment.id, orderId]
      );
      await pool.query(
        "UPDATE users SET plan=$1, updated_at=NOW() WHERE id=$2",
        [payRows[0].plan, payRows[0].user_id]
      );
      console.log(`✅ Webhook: upgraded user ${payRows[0].user_id} to ${payRows[0].plan}`);
    }
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(200).json({ ok: true }); // always 200
  }
});

module.exports = router;
