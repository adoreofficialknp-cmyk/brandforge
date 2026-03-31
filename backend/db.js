const { Pool } = require("pg");
const bcrypt    = require("bcryptjs");

const sslConfig = process.env.NODE_ENV === "production"
  ? { rejectUnauthorized: false }
  : (process.env.DATABASE_URL || "").includes("localhost") ? false : { rejectUnauthorized: false };

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: sslConfig });

async function initDB() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ── Self-heal: if users table missing, drop dependents ────────────────────
    const usersExists = await client.query(`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name='users'
    `);
    if (usersExists.rows.length === 0) {
      console.log("⚠️  users missing — clearing dependent tables...");
      await client.query(`DROP TABLE IF EXISTS
        deployments, payments, projects, assets, ai_usage, password_reset_tokens CASCADE`);
    }

    // ── Users ─────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              SERIAL PRIMARY KEY,
        name            VARCHAR(255) NOT NULL,
        email           VARCHAR(255) UNIQUE NOT NULL,
        password        VARCHAR(255) NOT NULL,
        plan            VARCHAR(50)  DEFAULT 'starter',
        email_verified  BOOLEAN      DEFAULT FALSE,
        is_admin        BOOLEAN      DEFAULT FALSE,
        created_at      TIMESTAMP    DEFAULT NOW(),
        updated_at      TIMESTAMP    DEFAULT NOW()
      )
    `);

    // ── Projects ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS projects (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER,
        type        VARCHAR(50) NOT NULL,
        title       VARCHAR(255),
        data        JSONB NOT NULL DEFAULT '{}',
        thumbnail   TEXT,
        created_at  TIMESTAMP DEFAULT NOW(),
        updated_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Assets (user uploaded images) ─────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        name        VARCHAR(255) NOT NULL,
        mime_type   VARCHAR(100) NOT NULL,
        size_bytes  INTEGER NOT NULL,
        data        TEXT NOT NULL,
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── AI Usage tracking ─────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_usage (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        type        VARCHAR(50) NOT NULL,
        prompt      TEXT,
        tokens_used INTEGER DEFAULT 0,
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Password reset tokens ─────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        token       VARCHAR(255) UNIQUE NOT NULL,
        expires_at  TIMESTAMP NOT NULL,
        used        BOOLEAN DEFAULT FALSE,
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Payments ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id                  SERIAL PRIMARY KEY,
        user_id             INTEGER,
        plan                VARCHAR(50),
        razorpay_order_id   VARCHAR(255),
        razorpay_payment_id VARCHAR(255),
        razorpay_signature  VARCHAR(500),
        status              VARCHAR(50) DEFAULT 'pending',
        amount_inr          INTEGER,
        created_at          TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Deployments ───────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS deployments (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER,
        project_id  INTEGER,
        deploy_url  VARCHAR(500),
        status      VARCHAR(50) DEFAULT 'pending',
        created_at  TIMESTAMP DEFAULT NOW()
      )
    `);

    // ── Foreign keys (idempotent) ─────────────────────────────────────────────
    const fks = [
      ["projects",              "projects_user_id_fkey",    "user_id", "users", "CASCADE"],
      ["payments",              "payments_user_id_fkey",    "user_id", "users", "SET NULL"],
      ["deployments",           "deployments_user_id_fkey", "user_id", "users", "SET NULL"],
      ["deployments",           "deployments_proj_fkey",    "project_id", "projects", "SET NULL"],
      ["assets",                "assets_user_id_fkey",      "user_id", "users", "CASCADE"],
      ["ai_usage",              "ai_usage_user_id_fkey",    "user_id", "users", "CASCADE"],
      ["password_reset_tokens", "prt_user_id_fkey",         "user_id", "users", "CASCADE"],
    ];
    for (const [tbl, name, col, ref, onDel] of fks) {
      await client.query(`
        DO $$ BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='${name}') THEN
            ALTER TABLE ${tbl}
              ADD CONSTRAINT ${name}
              FOREIGN KEY (${col}) REFERENCES ${ref}(id) ON DELETE ${onDel};
          END IF;
        END $$
      `);
    }

    // ── Indexes ───────────────────────────────────────────────────────────────
    const indexes = [
      ["idx_projects_user_id",  "projects",              "user_id"],
      ["idx_payments_user_id",  "payments",              "user_id"],
      ["idx_payments_status",   "payments",              "status"],
      ["idx_assets_user_id",    "assets",                "user_id"],
      ["idx_ai_usage_user_id",  "ai_usage",              "user_id"],
      ["idx_ai_usage_created",  "ai_usage",              "created_at"],
      ["idx_prt_token",         "password_reset_tokens", "token"],
    ];
    for (const [name, tbl, col] of indexes) {
      await client.query(
        `CREATE INDEX IF NOT EXISTS ${name} ON ${tbl}(${col})`
      );
    }

    await client.query("COMMIT");
    console.log("✅ Database tables initialized (v2)");

    // ── Seed admin ────────────────────────────────────────────────────────────
    const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || "admin@brandforge.com";
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@BrandForge2025";
    const ADMIN_NAME     = process.env.ADMIN_NAME     || "BrandForge Admin";

    const { rows } = await client.query("SELECT id FROM users WHERE email=$1", [ADMIN_EMAIL]);
    if (!rows.length) {
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await client.query(
        `INSERT INTO users (name, email, password, plan, is_admin, email_verified)
         VALUES ($1,$2,$3,'enterprise',TRUE,TRUE)`,
        [ADMIN_NAME, ADMIN_EMAIL, hashed]
      );
      console.log(`✅ Admin seeded: ${ADMIN_EMAIL}`);
    }

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
