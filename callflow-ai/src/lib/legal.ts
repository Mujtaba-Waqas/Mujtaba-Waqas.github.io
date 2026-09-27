import { marketingConfig } from "./marketing";

/**
 * Details shown in the Privacy Policy and Terms. Set these as environment
 * variables once you have a registered business. Until LEGAL_REVIEWED=true,
 * the pages show a visible "draft" notice.
 */
export function legalConfig() {
  const clean = (v: string | undefined) => (v && v.trim() ? v.trim() : null);
  const m = marketingConfig();
  return {
    product: "CallFlow AI",
    /** e.g. "CallFlow AI LLC" — your registered business name */
    legalName: clean(process.env.LEGAL_COMPANY_NAME) ?? "the operator of CallFlow AI",
    contactEmail: clean(process.env.LEGAL_CONTACT_EMAIL) ?? m.contactEmail ?? "[your contact email]",
    mailingAddress: clean(process.env.LEGAL_ADDRESS) ?? "[your mailing address]",
    state: clean(process.env.LEGAL_STATE) ?? "Utah",
    county: clean(process.env.LEGAL_COUNTY) ?? "Salt Lake County",
    effectiveDate: clean(process.env.LEGAL_EFFECTIVE_DATE) ?? "October 1, 2026",
    reviewed: process.env.LEGAL_REVIEWED === "true",
  };
}
