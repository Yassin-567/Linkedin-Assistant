export type PayPalEnvironment = "sandbox" | "live";

export type PayPalPublicConfig = {
  clientId: string;
  monthlyPlanId: string;
  yearlyPlanId: string;
};

export class PayPalConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PayPalConfigurationError";
  }
}

function requiredEnvironmentValue(name: string): string {
  const value = process.env[name]?.trim() || "";
  if (!value) {
    throw new PayPalConfigurationError(`${name} is not configured.`);
  }
  return value;
}

export function getPayPalEnvironment(): PayPalEnvironment {
  const value = requiredEnvironmentValue("PAYPAL_ENV").toLowerCase();
  if (value !== "sandbox" && value !== "live") {
    throw new PayPalConfigurationError(
      "PAYPAL_ENV must be either sandbox or live.",
    );
  }
  if (process.env.VERCEL_ENV === "preview" && value !== "sandbox") {
    throw new PayPalConfigurationError(
      "Vercel Preview deployments must use PayPal sandbox.",
    );
  }
  if (process.env.VERCEL_ENV === "production" && value !== "live") {
    throw new PayPalConfigurationError(
      "Vercel Production deployments must use PayPal live.",
    );
  }
  return value;
}

export function getPayPalApiBaseUrl(): string {
  return getPayPalEnvironment() === "sandbox"
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

export function getPayPalPublicConfig(): PayPalPublicConfig {
  const clientId = requiredEnvironmentValue("PAYPAL_CLIENT_ID");
  // Do not render the SDK until the environment and server-side
  // verification credentials are configured.
  getPayPalEnvironment();
  requiredEnvironmentValue("PAYPAL_CLIENT_SECRET");
  const monthlyPlanId = requiredEnvironmentValue("PAYPAL_MONTHLY_PLAN_ID");
  const yearlyPlanId = requiredEnvironmentValue("PAYPAL_YEARLY_PLAN_ID");
  // Do not expose the SDK until signed webhook delivery can also be verified.
  getPayPalWebhookId();

  if (
    !/^P-[A-Z0-9]+$/.test(monthlyPlanId) ||
    !/^P-[A-Z0-9]+$/.test(yearlyPlanId) ||
    monthlyPlanId === yearlyPlanId
  ) {
    throw new PayPalConfigurationError(
      "The configured PayPal plan IDs are invalid.",
    );
  }

  return { clientId, monthlyPlanId, yearlyPlanId };
}

export function getPayPalWebhookId(): string {
  return requiredEnvironmentValue("PAYPAL_WEBHOOK_ID");
}

async function getPayPalAccessToken(): Promise<string> {
  const baseUrl = getPayPalApiBaseUrl();
  const clientId = requiredEnvironmentValue("PAYPAL_CLIENT_ID");
  const clientSecret = requiredEnvironmentValue("PAYPAL_CLIENT_SECRET");
  const credentials = Buffer.from(
    `${clientId}:${clientSecret}`,
    "utf8",
  ).toString("base64");

  const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`PayPal OAuth request failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    access_token?: unknown;
  };
  if (
    typeof payload.access_token !== "string" ||
    !payload.access_token
  ) {
    throw new Error("PayPal OAuth did not return an access token.");
  }

  return payload.access_token;
}

export async function paypalApiRequest<T>(
  path: string,
  init: {
    method: "GET" | "POST";
    body?: Record<string, unknown>;
    rawBody?: string;
    prefer?: "return=representation";
  },
): Promise<T> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Invalid PayPal API path.");
  }

  const baseUrl = getPayPalApiBaseUrl();
  const accessToken = await getPayPalAccessToken();
  if (init.body && init.rawBody !== undefined) {
    throw new Error("Choose either a PayPal JSON body or a raw request body.");
  }

  const requestBody =
    init.rawBody !== undefined
      ? init.rawBody
      : init.body
        ? JSON.stringify(init.body)
        : undefined;

  const response = await fetch(`${baseUrl}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init.prefer ? { Prefer: init.prefer } : {}),
      ...(requestBody !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(requestBody !== undefined ? { body: requestBody } : {}),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`PayPal API request failed (${response.status}).`);
  }

  return (await response.json()) as T;
}
