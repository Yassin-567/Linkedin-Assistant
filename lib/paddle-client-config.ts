import {
  isPaddlePriceId,
  validatePaddleClientToken,
  type PaddleEnvironment,
} from "@/lib/paddle-environment";

// Existing sandbox catalog IDs. Never use these as production defaults.
export const PADDLE_MONTHLY_PRICE_ID =
  "pri_01m8a8bs00jpx3744wt0t43165";

export const PADDLE_YEARLY_PRICE_ID =
  "pri_01m8a8cb47d6zqb5q5svbdzb5n";

export type PaddleClientConfig =
  | {
      ok: true;
      environment: PaddleEnvironment;
      clientToken: string;
      monthlyPriceId: string;
      yearlyPriceId: string;
    }
  | {
      ok: false;
      error: string;
    };

export function getPaddleClientConfig(): PaddleClientConfig {
  const validation = validatePaddleClientToken(
    process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT,
    process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN,
  );

  if (!validation.ok) {
    return {
      ok: false,
      error: validation.error,
    };
  }

  const environment = validation.environment;

  const configuredMonthly =
    process.env.NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID?.trim() || "";

  const configuredYearly =
    process.env.NEXT_PUBLIC_PADDLE_YEARLY_PRICE_ID?.trim() || "";

  // Production requires explicit production catalog IDs.
  if (
    environment === "production" &&
    (!configuredMonthly || !configuredYearly)
  ) {
    return {
      ok: false,
      error:
        "Production Paddle billing requires both NEXT_PUBLIC_PADDLE_MONTHLY_PRICE_ID and NEXT_PUBLIC_PADDLE_YEARLY_PRICE_ID.",
    };
  }

  // Sandbox defaults are only available in the sandbox environment.
  const monthlyPriceId =
    configuredMonthly ||
    (environment === "sandbox"
      ? PADDLE_MONTHLY_PRICE_ID
      : "");

  const yearlyPriceId =
    configuredYearly ||
    (environment === "sandbox"
      ? PADDLE_YEARLY_PRICE_ID
      : "");

  if (!isPaddlePriceId(monthlyPriceId)) {
    return {
      ok: false,
      error: "The monthly Paddle price ID is missing or invalid.",
    };
  }

  if (!isPaddlePriceId(yearlyPriceId)) {
    return {
      ok: false,
      error: "The yearly Paddle price ID is missing or invalid.",
    };
  }

  if (monthlyPriceId === yearlyPriceId) {
    return {
      ok: false,
      error:
        "Monthly and yearly Paddle price IDs must be different.",
    };
  }

  return {
    ok: true,
    environment,
    clientToken: validation.clientToken,
    monthlyPriceId,
    yearlyPriceId,
  };
}
