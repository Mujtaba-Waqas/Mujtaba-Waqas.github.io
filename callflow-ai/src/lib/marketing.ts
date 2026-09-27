/**
 * Sales/contact details shown on the public marketing pages. Set these as
 * environment variables (Vercel → Settings → Environment Variables) so no
 * code change is needed to personalise the site.
 */
export function marketingConfig() {
  const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  return {
    founderName: clean(process.env.FOUNDER_NAME),
    contactEmail: clean(process.env.CONTACT_EMAIL),
    contactPhone: clean(process.env.CONTACT_PHONE),
    /** e.g. a free Calendly link: https://calendly.com/you/20min */
    bookingUrl: clean(process.env.BOOKING_URL),
    pilotOffer: clean(process.env.PILOT_OFFER) ?? "Free 30-day pilot for Utah HVAC companies — we set everything up for you.",
    region: clean(process.env.SERVICE_REGION) ?? "Utah",
  };
}

export function bookingHref(cfg: ReturnType<typeof marketingConfig>) {
  if (cfg.bookingUrl) return cfg.bookingUrl;
  if (cfg.contactEmail) return `mailto:${cfg.contactEmail}?subject=${encodeURIComponent("CallFlow AI demo")}`;
  return "/login";
}
