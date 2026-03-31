# BrandForge Studio v2.0

AI-powered design SaaS — portfolios, resumes, presentations, social posts, invoices, and more.

---

## What's new in v2 (all 5 phases)

| Phase | Features |
|-------|----------|
| **Phase 1** | Secure AI backend proxy · Unsplash image API · Rate limiting · Helmet security headers · DB indexes |
| **Phase 2** | Asset library (upload, browse, delete) · Per-user storage limits by plan · Multer file handling |
| **Phase 3** | Undo/Redo (50 steps) · Ctrl+Z/Y/S keyboard shortcuts · Letter spacing · Line height · Text align controls |
| **Phase 4** | Password reset (email + token) · AI usage tracking in DB · Loading skeletons · Upgrade modal |
| **Phase 5** | Social Post template · Invoice template · Stock photo search panel · Mobile responsive sidebar · Razorpay webhook |

---

## Quick start (local development)

### 1. Clone and install

```bash
git clone https://github.com/your-username/brandforge-studio.git
cd brandforge-studio
npm run install:all
```

### 2. Set up backend environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` and fill in:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/brandforge
JWT_SECRET=any-long-random-string
ANTHROPIC_API_KEY=sk-ant-...          # from console.anthropic.com
UNSPLASH_ACCESS_KEY=...               # from unsplash.com/developers (free)
RAZORPAY_KEY_ID=rzp_test_...          # optional — for payments
RAZORPAY_KEY_SECRET=...
```

### 3. Set up frontend environment

```bash
cd frontend
cp .env.example .env
# Leave VITE_API_URL empty — Vite proxy handles it in dev
```

### 4. Create the database

```bash
createdb brandforge
# Or use any PostgreSQL provider (Neon, Supabase, Railway, etc.)
```

### 5. Run both servers

```bash
# From root:
npm run dev

# This starts:
# Backend  → http://localhost:5000
# Frontend → http://localhost:5173
```

Default admin account: `admin@brandforge.com` / `Admin@BrandForge2025`

---

## Getting your API keys

### Unsplash (stock photos) — FREE
1. Go to [unsplash.com/developers](https://unsplash.com/developers)
2. Click "New Application"
3. Copy your **Access Key** → `UNSPLASH_ACCESS_KEY`
4. Free tier: 50 requests/hour (demo) → request production approval for more

### Anthropic (AI generation) — Paid
1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an API key → `ANTHROPIC_API_KEY`
3. AI calls go through your backend — key is never exposed to users

### Razorpay (payments) — Optional for testing
1. Go to [dashboard.razorpay.com](https://dashboard.razorpay.com)
2. Settings → API Keys → Generate Test Keys
3. Add `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`
4. Add webhook in Razorpay dashboard: `https://your-domain.com/payment/webhook`

---

## Deploying to Render.com

### One-click deploy

1. Push code to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Connect your repo — Render reads `render.yaml` automatically
4. Set secret env vars in the Render dashboard:
   - `ANTHROPIC_API_KEY`
   - `UNSPLASH_ACCESS_KEY`
   - `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET`
   - `SMTP_*` (for password reset emails)
   - `FRONTEND_URL` → your static site URL
   - `VITE_API_URL` → your backend URL (on the frontend service)
5. Deploy

### After deploy
- Backend auto-creates all DB tables on first boot
- Admin account is seeded automatically
- Update `ADMIN_EMAIL` / `ADMIN_PASSWORD` env vars before going live

---

## Project structure

```
brandforge-studio/
├── backend/
│   ├── server.js              # Express app, helmet, CORS, routes
│   ├── db.js                  # PostgreSQL pool, table init, indexes
│   ├── middleware/
│   │   ├── auth.js            # JWT verify middleware
│   │   └── rateLimit.js       # express-rate-limit configs
│   └── routes/
│       ├── auth.js            # signup, login, /me, forgot/reset password, admin
│       ├── projects.js        # CRUD with plan limits
│       ├── payment.js         # Razorpay order, verify, webhook
│       ├── ai.js              # Anthropic proxy, usage tracking, plan enforcement
│       ├── images.js          # Unsplash API proxy with server-side cache
│       ├── assets.js          # User image upload (multer → base64 in DB)
│       ├── pricing.js         # Pricing config endpoint
│       └── deploy.js          # Deploy registration
├── frontend/
│   ├── index.html
│   ├── vite.config.js         # Dev proxy + code splitting
│   └── src/
│       ├── main.jsx
│       └── BrandForgeStudio.jsx   # Entire frontend (React)
├── package.json               # Root monorepo scripts
├── render.yaml                # Render.com blueprint
└── README.md
```

---

## Database schema (v2)

| Table | Purpose |
|-------|---------|
| `users` | Auth, plan, is_admin |
| `projects` | Saved designs with JSONB data |
| `payments` | Razorpay order/payment records |
| `deployments` | Deploy registrations |
| `assets` | User-uploaded images (base64 in DB) |
| `ai_usage` | Per-user AI generation tracking |
| `password_reset_tokens` | 1-hour expiring reset tokens |

---

## Security checklist (v2)

- [x] Anthropic API key server-side only (never in frontend bundle)
- [x] JWT with 7-day expiry
- [x] bcrypt cost factor 12
- [x] Rate limiting: login (10/15min), AI (20/hr), uploads (50/hr)
- [x] Helmet.js security headers
- [x] Razorpay HMAC signature verification on both verify + webhook
- [x] Parameterized SQL queries throughout (no injection risk)
- [x] Plan limits enforced server-side (not just frontend)
- [x] Password reset tokens expire in 1 hour, single-use
- [ ] TODO: Add CSRF protection for non-SPA flows
- [ ] TODO: Move assets to S3/Cloudinary for production scale

---

## Phase roadmap

### Phase 6 (next)
- Konva.js canvas (drag, resize, rotate, layer panel)
- Multi-element selection and grouping

### Phase 7
- Netlify/Vercel API deploy (real deploy, not placeholder)
- Custom domain support

### Phase 8
- Real-time collaboration (Socket.io)
- Team workspaces

### Phase 9
- Background removal (Replicate REMBG API)
- Image filters (brightness, contrast, saturation)

### Phase 10
- Stripe integration (international payments)
- Annual plan discounts
- Referral system
