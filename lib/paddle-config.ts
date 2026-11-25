import { Environment, Paddle } from "@paddle/paddle-node-sdk";

export const PADDLE_MONTHLY_PRICE_ID =
  "pri_01m8a8bs00jpx3744wt0t43165";
export const PADDLE_YEARLY_PRICE_ID =
  "pri_01m8a8cb47d6zqb5q5svbdzb5n";

export const PADDLE_ALLOWED_PRICE_IDS = new Set([
  PADDLE_MONTHLY_PRICE_ID,
  PADDLE_YEARLY_PRICE_ID
]);

export function getPaddleApiKey(): string {
  const environment = process.env.PADDLE_ENVIRONMENT;
  const apiKey = process.env.PADDLE_API_KEY || "";
  if (environment !== "sandbox") {
    throw new Error("PADDLE_ENVIRONMENT must be explicitly set to sandbox.");
  }
  if (!apiKey || !apiKey.includes("_sdbx")) {
    throw new Error("A Paddle sandbox API key is required.");
  }
  return apiKey;
}

export function getPaddleWebhookSecret(): string {
  const secret = process.env.PADDLE_WEBHOOK_SECRET || "";
  if (!secret) throw new Error("PADDLE_WEBHOOK_SECRET is not configured.");
  return secret;
}

export function createPaddleServerClient() {
  return new Paddle(getPaddleApiKey(), { environment: Environment.sandbox });
}

export const PADDLE_SANDBOX_API = "https://sandbox-api.paddle.com";

export async function paddleApiRequest<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: Record<string, unknown> }
): Promise<T> {
  const response = await fetch(PADDLE_SANDBOX_API + path, {
    method: init.method,
    headers: {
      Authorization: "Bearer " + getPaddleApiKey(),
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    cache: "no-store"
  });
  if (!response.ok) {
    // Provider response bodies may contain personal or account data; never log them.
    throw new Error("Paddle sandbox API request failed (" + response.status + ").");
  }
  return await response.json() as T;
}
