import { afterEach, describe, expect, it } from "vitest";
import { appUrl } from "@/lib/app-url";
import { runtimeDatabaseUrl } from "@/lib/db";

describe("deployment helpers", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("adds pgbouncer=true only for pooled Neon hosts", () => {
    expect(runtimeDatabaseUrl("postgresql://u:p@ep-cool-123-pooler.us-east-2.aws.neon.tech/db?sslmode=require")).toContain("pgbouncer=true");
    expect(runtimeDatabaseUrl("postgresql://u:p@ep-cool-123.us-east-2.aws.neon.tech/db?sslmode=require")).not.toContain("pgbouncer");
    expect(runtimeDatabaseUrl("postgresql://u:p@localhost:5432/db")).toBe("postgresql://u:p@localhost:5432/db");
    expect(runtimeDatabaseUrl("postgresql://u:p@x-pooler.neon.tech/db?pgbouncer=false")).toContain("pgbouncer=false");
  });

  it("derives the public URL from APP_URL, then Vercel, then localhost", () => {
    delete process.env.APP_URL;
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    delete process.env.VERCEL_URL;
    expect(appUrl()).toBe("http://localhost:3000");
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "callflow-ai.vercel.app";
    expect(appUrl()).toBe("https://callflow-ai.vercel.app");
    process.env.APP_URL = "https://demo.callflow.example/";
    expect(appUrl()).toBe("https://demo.callflow.example");
  });
});
