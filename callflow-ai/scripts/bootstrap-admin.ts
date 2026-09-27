/**
 * Creates the first admin (owner) account and company for a real deployment,
 * from environment variables — no terminal needed on Vercel:
 *   BOOTSTRAP_ADMIN_EMAIL, BOOTSTRAP_ADMIN_PASSWORD, BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_COMPANY_NAME
 * Idempotent: if the email already exists, nothing changes (the password is never reset).
 * Also usable locally:  npx tsx scripts/bootstrap-admin.ts
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createOrganization } from "../src/lib/services/organizations";

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? "";
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Admin";
const company = process.env.BOOTSTRAP_COMPANY_NAME?.trim() || "My HVAC Company";

async function main() {
  if (!email) {
    console.log("• No BOOTSTRAP_ADMIN_EMAIL set — skipping admin bootstrap.");
    return;
  }
  if (password.length < 12) {
    console.error("✖ BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters. Skipping.");
    return;
  }
  const db = new PrismaClient();
  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      console.log(`• Admin ${email} already exists — leaving it unchanged.`);
      return;
    }
    const user = await db.user.create({ data: { email, name, passwordHash: await bcrypt.hash(password, 12) } });
    const org = await createOrganization(user.id, company, { owner: { name, email } });
    console.log(`✔ Created admin ${email} (owner of "${org.name}"). Sign in at /login, then finish setup at /onboarding.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
