/** `npm run db:seed` / `prisma db seed` entry point. */
import { PrismaClient } from "@prisma/client";
import { DEMO_EMAIL, DEMO_PASSWORD, seedDemo } from "../src/lib/demo/seed-demo";

const db = new PrismaClient();

seedDemo(db)
  .then(({ counts, ms }) => {
    console.log(`Seeded Summit Peak HVAC in ${(ms / 1000).toFixed(1)}s:`, counts);
    console.log(`Demo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
