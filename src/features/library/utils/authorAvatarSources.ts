export type AuthorAvatarSourceInput = {
  authorAvatarUrl?: string | null;
  authorUrl?: string | null;
  sourceUrl?: string | null;
};

const siteIconPaths = ["/favicon.ico", "/favicon.svg", "/apple-touch-icon.png", "/icons/logo-icon.svg", "/logo.svg"];

export function buildAuthorAvatarSources({
  authorAvatarUrl,
  authorUrl,
  sourceUrl,
}: AuthorAvatarSourceInput): string[] {
  const candidates = [
    normalizeHttpsImageUrl(authorAvatarUrl),
    ...buildSiteIconSources(authorUrl),
    ...buildSiteIconSources(sourceUrl),
  ];

  return Array.from(new Set(candidates.filter(Boolean)));
}

function buildSiteIconSources(input: string | null | undefined): string[] {
  const origin = getHttpsOrigin(input);

  if (!origin) {
    return [];
  }

  return siteIconPaths.map((path) => `${origin}${path}`);
}

function normalizeHttpsImageUrl(input: string | null | undefined): string {
  if (!input?.trim()) {
    return "";
  }

  try {
    const url = new URL(input.trim());

    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function getHttpsOrigin(input: string | null | undefined): string {
  if (!input?.trim()) {
    return "";
  }

  try {
    const url = new URL(input.trim());

    return url.protocol === "https:" ? url.origin : "";
  } catch {
    return "";
  }
}
