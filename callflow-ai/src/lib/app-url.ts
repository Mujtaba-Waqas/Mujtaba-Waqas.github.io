/**
 * Public base URL of the app. Prefers APP_URL; on Vercel falls back to the
 * production domain Vercel provides, so a first deploy works without extra config.
 */
export function appUrl() {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return "http://localhost:3000";
}
