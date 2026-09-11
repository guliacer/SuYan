export const OAUTH_DEEPLINK_PROTOCOL = "suyan:" as const;
export const OAUTH_DEEPLINK_HOSTNAME = "oauth" as const;
export const OAUTH_DEEPLINK_PATHNAME = "/callback" as const;

export function isOAuthDeeplink(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) {
    return false;
  }

  try {
    const url = new URL(value);
    return (
      url.protocol === OAUTH_DEEPLINK_PROTOCOL &&
      url.hostname === OAUTH_DEEPLINK_HOSTNAME &&
      url.pathname === OAUTH_DEEPLINK_PATHNAME &&
      !url.username &&
      !url.password &&
      !url.port &&
      !url.hash
    );
  } catch {
    return false;
  }
}

export function findOAuthDeeplink(values: readonly unknown[]): string | null {
  return values.find(isOAuthDeeplink) ?? null;
}
