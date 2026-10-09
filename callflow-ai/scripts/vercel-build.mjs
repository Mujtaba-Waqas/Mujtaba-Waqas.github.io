#!/usr/bin/env node
/**
 * Build command for Vercel (and any CI deploy):
 *   1. prisma generate
 *   2. prisma migrate deploy        — uses the *direct* (unpooled) connection
 *   3. seed the demo tenant         — unless DEMO_SEED_ON_DEPLOY=false
 *   4. create the first admin       — only if BOOTSTRAP_ADMIN_EMAIL is set
 *   5. next build
 *
 * Works with Vercel's Neon integration (DATABASE_URL + DATABASE_URL_UNPOOLED),
 * with a manually pasted DATABASE_URL, or with DIRECT_URL.
 */
import { execSync } from "node:child_process";

const pooled = process.env.DATABASE_URL ?? process.env.POSTGRES_PRISMA_URL;
const direct = process.env.DIRECT_URL ?? process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? pooled;

if (!pooled || !direct) {
  console.error(
    "\n✖ No database configured.\n" +
      "  Add a Postgres database (e.g. Vercel → Storage → Neon) or set DATABASE_URL in\n" +
      "  Project Settings → Environment Variables, then redeploy. See DEPLOY.md.\n",
  );
  process.exit(1);
}

const run = (cmd, env = {}) => {
  console.log(`\n▶ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...env } });
};

run("npx prisma generate");
run("npx prisma migrate deploy", { DATABASE_URL: direct });
if (process.env.DEMO_SEED_ON_DEPLOY !== "false") {
  run("npx tsx prisma/seed.ts", { DATABASE_URL: direct });
} else {
  console.log("\n• Skipping demo seed (DEMO_SEED_ON_DEPLOY=false)");
}
if (process.env.BOOTSTRAP_ADMIN_EMAIL) run("npx tsx scripts/bootstrap-admin.ts", { DATABASE_URL: direct });
run("npx next build", { DATABASE_URL: pooled });
