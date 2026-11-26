import { Environment, Paddle } from "@paddle/paddle-node-sdk";
import {
  isPaddlePriceId,
  validatePaddleEnvironment,
} from "@/lib/paddle-environment";

export const PADDLE_MONTHLY_PRICE_ID =
  "pri_01m8a8bs00jpx3744wt0t43165";

export const PADDLE_YEARLY_PRICE_ID =
  "pri_01m8a8cb47d6zqb5q5svbdzb5n";

// Retained for compatibility with any existing sandbox-only imports.
// paddleApiRequest uses the environment-selected URL instead.
export const PADDLE_SANDBOX_API =
  "https://sandbox-api.paddle.com";

export class PaddleConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaddleConfigurationError";
  }
}

export type PaddlePriceIds = {
  monthlyPriceId: string;
  yearlyPriceId: string;
};

function getValidatedEnvironment() {
  const result = validatePaddleEnvironment(
    process.env.PADDLE_ENVIRONMENT,
    process.env.PADDLE_API_KEY,
    process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT,
  );

  if (!result.ok) {
    throw new PaddleConfigurationError(result.error);
  }

  return result;
}

/**
 * Resolves price IDs for the selected Paddle environment.
 *
 * Sandbox:
 * - Existing sandbox IDs are defaults.
 * - Environment variables may override those defaults.
 *
 * Production:
 * - Both production price IDs must be explicitly supplied.
 * - Sandbox defaults are never used.
 */
export function getPaddlePriceIds(): PaddlePriceIds {
  const { environment } = getValidatedEnvironment();

  const configuredMonthly =
    process.env.PADDLE_MONTHLY_PRICE_ID?.trim() || "";

  const configuredYearly =
    process.env.PADDLE_YEARLY_PRICE_ID?.trim() || "";

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

  if (!monthlyPriceId || !isPaddlePriceId(monthlyPriceId)) {
    throw new PaddleConfigurationError(
      environment === "sandbox"
        ? "The sandbox monthly Paddle price ID is invalid."
        : "PADDLE_MONTHLY_PRICE_ID must contain a valid production price ID.",
    );
  }

  if (!yearlyPriceId || !isPaddlePriceId(yearlyPriceId)) {
    throw new PaddleConfigurationError(
      environment === "sandbox"
        ? "The sandbox yearly Paddle price ID is invalid."
        : "PADDLE_YEARLY_PRICE_ID must contain a valid production price ID.",
    );
  }

  if (monthlyPriceId === yearlyPriceId) {
    throw new PaddleConfigurationError(
      "Monthly and yearly Paddle price IDs must be different.",
    );
  }

  return {
    monthlyPriceId,
    yearlyPriceId,
  };
}

/**
 * Returns a fresh allowed-price set for the currently selected
 * environment. Billing queries should use this function.
 */
export function getPaddleAllowedPriceIds(): Set<string> {
  const prices = getPaddlePriceIds();

  return new Set([
    prices.monthlyPriceId,
    prices.yearlyPriceId,
  ]);
}

/**
 * Webhook compatibility export.
 *
 * This is a real Set, not a Proxy. The deployment environment is
 * immutable during a server process, so it is resolved at module
 * initialization.
 *
 * Invalid configuration produces an empty Set, ensuring that
 * webhook events cannot authorize an unrecognized price.
 *
 * New billing queries should use getPaddleAllowedPriceIds().
 */
function createInitialAllowedPriceIds(): Set<string> {
  try {
    return getPaddleAllowedPriceIds();
  } catch {
    return new Set<string>();
  }
}

export const PADDLE_ALLOWED_PRICE_IDS =
  createInitialAllowedPriceIds();

export function getPaddleApiKey(): string {
  return getValidatedEnvironment().apiKey;
}

export function getPaddleWebhookSecret(): string {
  const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim() || "";

  if (!secret) {
    throw new PaddleConfigurationError(
      "PADDLE_WEBHOOK_SECRET is not configured.",
    );
  }

  return secret;
}

export function createPaddleServerClient(): Paddle {
  const config = getValidatedEnvironment();

  return new Paddle(config.apiKey, {
    environment:
      config.environment === "sandbox"
        ? Environment.sandbox
        : Environment.production,
  });
}

export async function paddleApiRequest<T>(
  path: string,
  init: {
    method: "GET" | "POST";
    body?: Record<string, unknown>;
  },
): Promise<T> {
  const config = getValidatedEnvironment();

  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Invalid Paddle API path.");
  }

  const response = await fetch(
    config.apiBaseUrl + path,
    {
      method: init.method,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      ...(init.body
        ? { body: JSON.stringify(init.body) }
        : {}),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    // Never log or return the provider response body.
    throw new Error(
      `Paddle API request failed (${response.status}).`,
    );
  }

  return (await response.json()) as T;
}
