export type PaddleEnvironment = "sandbox" | "production";

export type PaddleEnvironmentValidationResult =
  | {
      ok: true;
      environment: PaddleEnvironment;
      apiKey: string;
      apiBaseUrl: string;
    }
  | {
      ok: false;
      error: string;
    };

export type PaddleClientTokenValidationResult =
  | {
      ok: true;
      environment: PaddleEnvironment;
      clientToken: string;
    }
  | {
      ok: false;
      error: string;
      environment?: PaddleEnvironment;
    };

// Paddle's documented modern API key format:
//
// Sandbox:
// pdl_sdbx_apikey_[26 lowercase alphanumeric characters]
// _[22 alphanumeric characters]_[3 alphanumeric characters]
//
// Production:
// pdl_live_apikey_[26 lowercase alphanumeric characters]
// _[22 alphanumeric characters]_[3 alphanumeric characters]
//
// Source:
// https://developer.paddle.com/api-reference/about/authentication/
//
// Legacy 50-character lowercase-alphanumeric API keys do not
// identify their environment. They are deliberately rejected
// in both environments.
const PADDLE_API_KEY_PATTERN =
  /^pdl_(live|sdbx)_apikey_[a-z\d]{26}_[a-zA-Z\d]{22}_[a-zA-Z\d]{3}$/;

// Paddle's documented client-side token format:
//
// Production: live_ followed by exactly 27 alphanumeric characters.
//
// Sandbox compatibility: test_ followed by at least 20
// alphanumeric characters.
//
// Source:
// https://developer.paddle.com/paddle-js/about/client-side-tokens/
const PADDLE_LIVE_CLIENT_TOKEN_PATTERN =
  /^live_[a-zA-Z0-9]{27}$/;

const PADDLE_SANDBOX_CLIENT_TOKEN_PATTERN =
  /^test_[a-zA-Z0-9]{20,}$/;

// Paddle price IDs use the pri_ prefix followed by
// a non-empty alphanumeric identifier.
const PADDLE_PRICE_ID_PATTERN =
  /^pri_[a-zA-Z0-9]+$/;

function normalizeValue(
  value: string | null | undefined,
): string {
  return value?.trim() ?? "";
}

function isPaddleEnvironment(
  value: string,
): value is PaddleEnvironment {
  return value === "sandbox" || value === "production";
}

/**
 * Checks whether a key contains an explicit live marker.
 *
 * This recognizes "_live_" and equivalent environment-marker
 * positions, including a live_ prefix.
 */
function hasLiveMarker(value: string): boolean {
  return /(?:^|_)live(?:_|$)/i.test(value);
}

/**
 * Checks sandbox API key compatibility.
 *
 * Accept either:
 * 1. A valid modern Paddle sandbox API key.
 * 2. A key containing "_sdbx", provided it contains no live marker.
 *
 * The second rule preserves compatibility with the previous
 * implementation, which accepted any non-empty key containing
 * "_sdbx".
 *
 * A key containing "_live_" is never accepted for sandbox.
 */
function isSandboxApiKey(value: string): boolean {
  const normalized = value.toLowerCase();

  const modernMatch =
    PADDLE_API_KEY_PATTERN.exec(value);

  const isModernSandbox =
    modernMatch?.[1] === "sdbx";

  const hasSandboxMarker =
    normalized.includes("_sdbx");

  const containsLiveMarker =
    hasLiveMarker(normalized);

  const isBackwardCompatibleSandbox =
    hasSandboxMarker && !containsLiveMarker;

  return (
    isModernSandbox === true ||
    isBackwardCompatibleSandbox
  );
}

/**
 * Production accepts only a valid modern Paddle live API key.
 *
 * Legacy keys and sandbox keys are never accepted.
 */
function isProductionApiKey(value: string): boolean {
  const match =
    PADDLE_API_KEY_PATTERN.exec(value);

  return match?.[1] === "live";
}

/**
 * Validates the server Paddle environment, API key and public
 * environment setting.
 *
 * This is a pure function:
 * - No environment-variable reads.
 * - No network calls.
 * - No mutation.
 * - No external dependencies.
 *
 * Production is never inferred:
 * - PADDLE_ENVIRONMENT must explicitly be "production".
 * - NEXT_PUBLIC_PADDLE_ENVIRONMENT must explicitly be "production".
 * - The API key must match the strict modern Paddle live-key format.
 *
 * Sandbox compatibility:
 * - Explicit server "sandbox" accepts a missing public environment.
 * - A missing server environment can be treated as sandbox only
 *   when the API key contains "_sdbx" without a live marker and
 *   the public environment is missing or explicitly "sandbox".
 * - Sandbox accepts modern keys or backward-compatible keys
 *   containing "_sdbx" without a live marker.
 *
 * Legacy 50-character unmarked API keys are rejected in both
 * environments because their environment cannot be established.
 *
 * The returned API base URL is selected exclusively from the
 * validated environment.
 */
export function validatePaddleEnvironment(
  serverEnv: string | null | undefined,
  apiKey: string | null | undefined,
  publicEnv: string | null | undefined,
): PaddleEnvironmentValidationResult {
  const normalizedServerEnv =
    normalizeValue(serverEnv);

  const normalizedApiKey =
    normalizeValue(apiKey);

  const normalizedPublicEnv =
    normalizeValue(publicEnv);

  const serverEnvMissing =
    normalizedServerEnv === "";

  const publicEnvMissing =
    normalizedPublicEnv === "";

  // Reject an explicitly supplied unknown server environment.
  if (
    !serverEnvMissing &&
    !isPaddleEnvironment(normalizedServerEnv)
  ) {
    return {
      ok: false,
      error:
        "PADDLE_ENVIRONMENT must be either sandbox or production.",
    };
  }

  // Reject an explicitly supplied unknown public environment.
  if (
    !publicEnvMissing &&
    !isPaddleEnvironment(normalizedPublicEnv)
  ) {
    return {
      ok: false,
      error:
        "NEXT_PUBLIC_PADDLE_ENVIRONMENT must be either sandbox or production.",
    };
  }

  let environment: PaddleEnvironment;

  if (normalizedServerEnv === "production") {
    // Production requires both environment variables explicitly.
    if (normalizedPublicEnv !== "production") {
      return {
        ok: false,
        error:
          "Production requires PADDLE_ENVIRONMENT and NEXT_PUBLIC_PADDLE_ENVIRONMENT to both be explicitly set to production.",
      };
    }

    environment = "production";
  } else if (normalizedServerEnv === "sandbox") {
    // A missing public environment is permitted for an explicitly
    // configured sandbox server to preserve existing deployments.
    if (
      !publicEnvMissing &&
      normalizedPublicEnv !== "sandbox"
    ) {
      return {
        ok: false,
        error:
          "PADDLE_ENVIRONMENT and NEXT_PUBLIC_PADDLE_ENVIRONMENT conflict.",
      };
    }

    environment = "sandbox";
  } else {
    // The server environment is missing or empty.
    //
    // Never infer production from a key or public environment.
    if (normalizedPublicEnv === "production") {
      return {
        ok: false,
        error:
          "Production cannot be inferred. PADDLE_ENVIRONMENT must explicitly be set to production.",
      };
    }

    // Only a sandbox-marked API key can establish backward-
    // compatible sandbox mode when the server environment is absent.
    if (
      (publicEnvMissing ||
        normalizedPublicEnv === "sandbox") &&
      isSandboxApiKey(normalizedApiKey)
    ) {
      environment = "sandbox";
    } else {
      return {
        ok: false,
        error:
          "PADDLE_ENVIRONMENT is missing. Sandbox can only be inferred from an API key containing _sdbx without a live marker.",
      };
    }
  }

  // Validate the API key against the selected environment.
  if (environment === "production") {
    if (!isProductionApiKey(normalizedApiKey)) {
      return {
        ok: false,
        error:
          "Production requires a valid modern Paddle live API key.",
      };
    }
  } else {
    if (!isSandboxApiKey(normalizedApiKey)) {
      return {
        ok: false,
        error:
          "Sandbox requires an API key containing _sdbx and no live marker.",
      };
    }
  }

  const apiBaseUrl =
    environment === "sandbox"
      ? "https://sandbox-api.paddle.com"
      : "https://api.paddle.com";

  return {
    ok: true,
    environment,
    apiKey: normalizedApiKey,
    apiBaseUrl,
  };
}

/**
 * Validates a Paddle browser client-side token.
 *
 * Production:
 * - Public environment must explicitly be "production".
 * - Token must start with "live_".
 * - Exactly 27 alphanumeric characters must follow the prefix.
 *
 * Sandbox:
 * - Public environment may explicitly be "sandbox".
 * - A missing or empty public environment is backward-compatible
 *   when the token starts with "test_" followed by at least
 *   20 alphanumeric characters.
 *
 * Production is never inferred from a live_ token.
 *
 * This is a pure function and is safe to unit test.
 *
 * Source:
 * https://developer.paddle.com/paddle-js/about/client-side-tokens/
 */
export function validatePaddleClientToken(
  publicEnv: string | null | undefined,
  token: string | null | undefined,
): PaddleClientTokenValidationResult {
  const normalizedPublicEnv =
    normalizeValue(publicEnv);

  const normalizedToken =
    normalizeValue(token);

  const publicEnvMissing =
    normalizedPublicEnv === "";

  // Reject an explicitly supplied unknown environment.
  if (
    !publicEnvMissing &&
    !isPaddleEnvironment(normalizedPublicEnv)
  ) {
    return {
      ok: false,
      error:
        "NEXT_PUBLIC_PADDLE_ENVIRONMENT must be either sandbox or production.",
    };
  }

  if (normalizedPublicEnv === "production") {
    if (
      !PADDLE_LIVE_CLIENT_TOKEN_PATTERN.test(
        normalizedToken,
      )
    ) {
      return {
        ok: false,
        environment: "production",
        error:
          "Production requires a valid live_ Paddle client token containing exactly 27 alphanumeric characters after the prefix.",
      };
    }

    return {
      ok: true,
      environment: "production",
      clientToken: normalizedToken,
    };
  }

  if (normalizedPublicEnv === "sandbox") {
    if (
      !PADDLE_SANDBOX_CLIENT_TOKEN_PATTERN.test(
        normalizedToken,
      )
    ) {
      return {
        ok: false,
        environment: "sandbox",
        error:
          "Sandbox requires a test_ Paddle client token containing at least 20 alphanumeric characters after the prefix.",
      };
    }

    return {
      ok: true,
      environment: "sandbox",
      clientToken: normalizedToken,
    };
  }

  // Public environment is missing or empty.
  //
  // Backward compatibility: infer sandbox only from a valid
  // sandbox test_ token. Never infer production from live_.
  if (
    PADDLE_SANDBOX_CLIENT_TOKEN_PATTERN.test(
      normalizedToken,
    )
  ) {
    return {
      ok: true,
      environment: "sandbox",
      clientToken: normalizedToken,
    };
  }

  if (normalizedToken.startsWith("live_")) {
    return {
      ok: false,
      error:
        "Production cannot be inferred from a live_ token. NEXT_PUBLIC_PADDLE_ENVIRONMENT must explicitly be set to production.",
    };
  }

  return {
    ok: false,
    error:
      "A valid sandbox test_ Paddle client token is required when NEXT_PUBLIC_PADDLE_ENVIRONMENT is missing.",
  };
}

/**
 * Checks whether a string has Paddle's price ID object prefix
 * and a non-empty alphanumeric identifier.
 */
export function isPaddlePriceId(
  value: string,
): boolean {
  return PADDLE_PRICE_ID_PATTERN.test(value);
}
