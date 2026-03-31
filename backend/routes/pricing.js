// routes/pricing.js
const express = require("express");
const router  = express.Router();

router.get("/", (req, res) => {
  res.json({
    plans: [
      { id: "starter",    name: "Starter",    price_inr: 0,    projects: 3,        ai: 3,         features: ["3 projects","3 AI generations/month","HTML export"] },
      { id: "pro",        name: "Pro",        price_inr: 499,  projects: 50,       ai: "Unlimited",features: ["50 projects","Unlimited AI","All exports","Deploy","10 asset uploads"] },
      { id: "enterprise", name: "Enterprise", price_inr: 1999, projects: "∞",      ai: "Unlimited",features: ["Unlimited projects","Unlimited AI","White-label","Priority support","200 asset uploads"] },
    ]
  });
});

module.exports = router;


// ── routes/deploy.js ───────────────────────────────────────────────────────────
// (in a separate require in server.js)
