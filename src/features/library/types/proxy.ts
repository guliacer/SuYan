export type ProxyMode = "system" | "direct" | "custom";

export type ProxySettings = {
  mode: ProxyMode;
  server: string;
  bypassRules: string;
};

export type ProxyTestData = {
  connected: true;
  status: number;
  url: string;
};

export type DetectedSystemProxySettings = {
  enabled: boolean;
  server: string;
  bypassRules: string;
  autoConfigUrl: string;
  autoDetect: boolean;
};

export type DetectedProxyProcess = {
  name: string;
  processName: string;
  pid: number;
  ports: number[];
  suggestedServer: string;
};

export type ProxyDetectionSource = "windows-system" | "running-process" | "not-found";

export type ProxyDetectionData = {
  detected: boolean;
  settings: ProxySettings;
  source: ProxyDetectionSource;
  summary: string;
  systemProxy: DetectedSystemProxySettings;
  processes: DetectedProxyProcess[];
};

export const defaultProxyBypassRules = "localhost,127.0.0.1,<local>";

export const defaultDetectedSystemProxySettings: DetectedSystemProxySettings = {
  enabled: false,
  server: "",
  bypassRules: defaultProxyBypassRules,
  autoConfigUrl: "",
  autoDetect: false,
};

export const defaultProxySettings: ProxySettings = {
  mode: "system",
  server: "",
  bypassRules: defaultProxyBypassRules,
};

const proxyModes: ProxyMode[] = ["system", "direct", "custom"];
const proxyServerProtocols = new Set(["http:", "https:", "socks4:", "socks5:"]);

export function normalizeProxySettings(input: unknown): ProxySettings {
  if (!isRecord(input)) {
    return defaultProxySettings;
  }

  return {
    mode: isProxyMode(input.mode) ? input.mode : defaultProxySettings.mode,
    server: normalizeProxyServer(typeof input.server === "string" ? input.server : ""),
    bypassRules: normalizeProxyBypassRules(input.bypassRules),
  };
}

export function getProxySettingsValidationError(input: unknown): string | null {
  const settings = normalizeProxySettings(input);

  if (settings.mode !== "custom") {
    return null;
  }

  if (!settings.server) {
    return "请填写代理地址。";
  }

  if (!isValidProxyServer(settings.server)) {
    return "代理地址格式不正确，请使用 http://127.0.0.1:7890 或 socks5://127.0.0.1:7890。";
  }

  return null;
}

export function isValidProxySettings(input: unknown): input is ProxySettings {
  return getProxySettingsValidationError(input) === null;
}

export function normalizeProxyServer(input: string): string {
  const value = input.trim();

  if (!value) {
    return "";
  }

  const withProtocol = hasProxyProtocol(value) ? value : `http://${value}`;

  try {
    const url = new URL(withProtocol);

    if (!proxyServerProtocols.has(url.protocol) || !url.hostname || !url.port) {
      return value;
    }

    const password = url.password ? `:${url.password}` : "";
    const auth = url.username ? `${url.username}${password}@` : "";

    return `${url.protocol}//${auth}${url.host}`;
  } catch {
    return value;
  }
}

export function normalizeDetectedProxyServer(input: string): string {
  const value = input.trim();

  if (!value) {
    return "";
  }

  if (!value.includes("=")) {
    return normalizeProxyServer(value);
  }

  const entries = value
    .split(";")
    .map((segment) => segment.trim())
    .map((segment) => {
      const separatorIndex = segment.indexOf("=");

      if (separatorIndex < 0) {
        return null;
      }

      const key = segment.slice(0, separatorIndex).trim().toLowerCase();
      const server = segment.slice(separatorIndex + 1).trim();

      return key && server ? { key, server } : null;
    })
    .filter((entry): entry is { key: string; server: string } => entry !== null);
  const preferredEntry =
    entries.find((entry) => entry.key === "http") ??
    entries.find((entry) => entry.key === "https") ??
    entries.find((entry) => entry.key === "socks") ??
    entries[0];

  if (!preferredEntry) {
    return "";
  }

  return normalizeProxyServer(
    preferredEntry.key === "socks" && !hasProxyProtocol(preferredEntry.server)
      ? `socks5://${preferredEntry.server}`
      : preferredEntry.server,
  );
}

export function resolveProxyDetectionResult(input: {
  processes?: DetectedProxyProcess[];
  systemProxy?: Partial<DetectedSystemProxySettings> | null;
}): ProxyDetectionData {
  const systemProxy = normalizeDetectedSystemProxySettings(input.systemProxy);
  const processes = normalizeDetectedProxyProcesses(input.processes);
  const systemServer = normalizeDetectedProxyServer(systemProxy.server);
  const systemBypassRules = normalizeProxyBypassRules(systemProxy.bypassRules);
  const processWithServer = processes.find((process) => process.suggestedServer);

  if (systemProxy.enabled && systemServer) {
    return {
      detected: true,
      settings: {
        mode: "custom",
        server: systemServer,
        bypassRules: systemBypassRules,
      },
      source: "windows-system",
      summary: `已检测到 Windows 系统代理：${systemServer}`,
      systemProxy: {
        ...systemProxy,
        server: systemServer,
        bypassRules: systemBypassRules,
      },
      processes,
    };
  }

  if (systemProxy.autoConfigUrl || systemProxy.autoDetect) {
    return {
      detected: true,
      settings: {
        ...defaultProxySettings,
        mode: "system",
        bypassRules: systemBypassRules,
      },
      source: "windows-system",
      summary: systemProxy.autoConfigUrl
        ? `已检测到系统自动代理脚本：${systemProxy.autoConfigUrl}`
        : "已检测到系统自动代理配置。",
      systemProxy: {
        ...systemProxy,
        server: systemServer,
        bypassRules: systemBypassRules,
      },
      processes,
    };
  }

  if (processWithServer) {
    return {
      detected: true,
      settings: {
        mode: "custom",
        server: processWithServer.suggestedServer,
        bypassRules: defaultProxyBypassRules,
      },
      source: "running-process",
      summary: `已检测到正在运行的代理软件：${processWithServer.name}（${processWithServer.suggestedServer}）。`,
      systemProxy: {
        ...systemProxy,
        server: systemServer,
        bypassRules: systemBypassRules,
      },
      processes,
    };
  }

  return {
    detected: false,
    settings: defaultProxySettings,
    source: "not-found",
    summary: "未检测到系统代理或常见代理软件，已保留系统代理模式。",
    systemProxy: {
      ...systemProxy,
      server: systemServer,
      bypassRules: systemBypassRules,
    },
    processes,
  };
}

function normalizeProxyBypassRules(input: unknown): string {
  if (typeof input !== "string") {
    return defaultProxyBypassRules;
  }

  return input
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(",");
}

function normalizeDetectedSystemProxySettings(input: unknown): DetectedSystemProxySettings {
  if (!isRecord(input)) {
    return defaultDetectedSystemProxySettings;
  }

  return {
    enabled: input.enabled === true,
    server: typeof input.server === "string" ? input.server.trim() : "",
    bypassRules: normalizeProxyBypassRules(input.bypassRules),
    autoConfigUrl: typeof input.autoConfigUrl === "string" ? input.autoConfigUrl.trim() : "",
    autoDetect: input.autoDetect === true,
  };
}

function normalizeDetectedProxyProcesses(input: unknown): DetectedProxyProcess[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((item) => {
      if (!isRecord(item)) {
        return null;
      }

      const name = typeof item.name === "string" ? item.name.trim() : "";
      const processName = typeof item.processName === "string" ? item.processName.trim() : "";
      const pid = typeof item.pid === "number" && Number.isInteger(item.pid) ? item.pid : 0;
      const ports = Array.isArray(item.ports)
        ? [...new Set(item.ports.filter((port): port is number => Number.isInteger(port) && port > 0 && port <= 65535))]
        : [];
      const suggestedServer = typeof item.suggestedServer === "string" ? normalizeProxyServer(item.suggestedServer) : "";

      if (!name || !processName || pid <= 0) {
        return null;
      }

      return {
        name,
        processName,
        pid,
        ports,
        suggestedServer,
      };
    })
    .filter((item): item is DetectedProxyProcess => item !== null);
}

function isValidProxyServer(input: string): boolean {
  const value = input.trim();
  const withProtocol = hasProxyProtocol(value) ? value : `http://${value}`;

  try {
    const url = new URL(withProtocol);
    const port = Number(url.port);

    return (
      proxyServerProtocols.has(url.protocol) &&
      Boolean(url.hostname) &&
      Number.isInteger(port) &&
      port >= 1 &&
      port <= 65535 &&
      (url.pathname === "" || url.pathname === "/")
    );
  } catch {
    return false;
  }
}

function hasProxyProtocol(input: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(input.trim());
}

function isProxyMode(input: unknown): input is ProxyMode {
  return typeof input === "string" && proxyModes.includes(input as ProxyMode);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
