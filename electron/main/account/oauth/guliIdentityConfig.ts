import fs from "node:fs";
import path from "node:path";

export const GULI_IDENTITY_CONFIG_FILE_ENV = "SUYAN_GULI_IDENTITY_CONFIG" as const;
export const GULI_IDENTITY_CONFIG_FILE_NAME = "guli-identity.env" as const;

export const GULI_IDENTITY_CONFIG_KEYS = [
  "GULI_IDENTITY_ISSUER",
  "GULI_IDENTITY_CLIENT_ID",
  "GULI_IDENTITY_REDIRECT_URI",
  "GULI_IDENTITY_SCOPES",
] as const;

export type GuliIdentityConfigKey = (typeof GULI_IDENTITY_CONFIG_KEYS)[number];
export type GuliIdentityFileConfig = Partial<Record<GuliIdentityConfigKey, string>>;

const configKeySet = new Set<string>(GULI_IDENTITY_CONFIG_KEYS);

/** Parse only the public Guli Identity settings; unrelated .env entries are ignored. */
export function parseGuliIdentityEnv(contents: string): GuliIdentityFileConfig {
  const values: GuliIdentityFileConfig = {};

  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim().replace(/^\uFEFF/u, "");
    if (!line || line.startsWith("#")) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/u.exec(line);
    if (!match || !configKeySet.has(match[1])) {
      continue;
    }

    values[match[1] as GuliIdentityConfigKey] = unquoteEnvValue(match[2].trim());
  }

  return values;
}

/**
 * Resolve the small, explicit set of places where a public client config may live.
 * The packaged app reads beside the executable/resources; source development reads
 * the ignored private file or root .env. It never scans arbitrary directories.
 */
export function resolveGuliIdentityConfigPaths(
  options: {
    explicitPath?: string;
    resourcesPath?: string;
    executablePath?: string;
    projectRoot?: string;
  } = {},
): string[] {
  const projectRoot = options.projectRoot ?? resolveDefaultProjectRoot();
  const executablePath = options.executablePath ?? process.execPath;
  const resourcesPath = options.resourcesPath ?? readResourcesPath();
  const explicitPath = options.explicitPath ?? process.env[GULI_IDENTITY_CONFIG_FILE_ENV];
  const candidates = [
    explicitPath?.trim(),
    resourcesPath ? path.join(resourcesPath, GULI_IDENTITY_CONFIG_FILE_NAME) : undefined,
    executablePath ? path.join(path.dirname(executablePath), GULI_IDENTITY_CONFIG_FILE_NAME) : undefined,
    executablePath
      ? path.join(path.dirname(executablePath), "config", GULI_IDENTITY_CONFIG_FILE_NAME)
      : undefined,
    path.join(projectRoot, "private", GULI_IDENTITY_CONFIG_FILE_NAME),
    path.join(projectRoot, "config", "guli-identity.public.env"),
    path.join(projectRoot, ".env"),
  ];

  return [...new Set(candidates.filter((candidate): candidate is string => Boolean(candidate)))];
}

export function loadGuliIdentityFileConfig(paths = resolveGuliIdentityConfigPaths()): GuliIdentityFileConfig {
  const values: GuliIdentityFileConfig = {};

  // Earlier paths have higher priority, so merge from the end toward the front.
  for (const filePath of [...paths].reverse()) {
    try {
      Object.assign(values, parseGuliIdentityEnv(fs.readFileSync(filePath, "utf8")));
    } catch {
      // Missing or unreadable optional config falls back to the next source.
    }
  }

  return values;
}

export function readGuliIdentityConfigValue(name: GuliIdentityConfigKey): string {
  const environmentValue = process.env[name]?.trim();
  if (environmentValue) {
    return environmentValue;
  }

  return loadGuliIdentityFileConfig()[name]?.trim() ?? "";
}

function readResourcesPath(): string | undefined {
  const value = (process as NodeJS.Process & { resourcesPath?: unknown }).resourcesPath;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function resolveDefaultProjectRoot(): string {
  // Compiled Electron code lives under dist-electron/electron/...; source tests
  // run from the workspace root. Prefer the compiled path when it contains the
  // staged package.json, otherwise use the current workspace directory.
  const compiledRoot = path.resolve(__dirname, "../../../../../");
  if (fs.existsSync(path.join(compiledRoot, "package.json"))) {
    return compiledRoot;
  }

  return process.cwd();
}

function unquoteEnvValue(value: string): string {
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return value.slice(1, -1);
    }
  }

  return value;
}
