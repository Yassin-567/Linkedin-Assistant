// Public configuration for Inlinked's legal pages.
// Only genuine owner decisions and owner-supplied details are configurable.

export const LEGAL = {
  productName: "Inlinked",
  legalName: "Yassin Alaa Aly",
  tradingName: "Inlinked",

  postalAddress: "Yassin Alaa Aly, El Obour City, Egypt (postal address available on request at yassinalaa3310@gmail.com)." as string | null,
  contactEmail: "yassinalaa3310@gmail.com" as string | null,
  effectiveDate: null as string | null,

  // "paddle" = Option A: refer to Paddle's Refund Policy.
  // "own_30_day" = Option B: Inlinked's own 30-day change-of-mind policy.
  refundPolicyMode: "paddle" as "paddle" | "own_30_day",

  // Only relevant if refundPolicyMode is "own_30_day".
  // true = renewal payments are included.
  // false = renewal payments are excluded from the voluntary policy.
  refundRenewals: null as boolean | null,

  // Retention periods requiring confirmation.
  retentionWhileAccountActive: null as string | null,
  retentionAfterAccountClosure: null as string | null,
  backupRetention: null as string | null,
  billingRetention: null as string | null,

  // Additional cookies or storage technologies introduced by
  // external integrations, if any, require confirmation.
  additionalCookieDetails: null as string | null,
};

export function val(
  value: string | number | boolean | null | undefined,
): string {
  return value === null || value === undefined
    ? "[OWNER TO CONFIRM]"
    : String(value);
}
