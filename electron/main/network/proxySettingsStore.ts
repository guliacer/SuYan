import { net, session, type ProxyConfig } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { promisify } from "node:util";
import type {
  DetectedProxyProcess,
  DetectedSystemProxySettings,
  ProxyDetectionData,
  ProxySettings,
  ProxyTestData,
} from "../../../src/features/library/types/proxy";
import {
  defaultDetectedSystemProxySettings,
  getProxySettingsValidationError,
  normalizeProxySettings,
  resolveProxyDetectionResult,
} from "../../../src/features/library/types/proxy";
import { AppError } from "../ipc/errors";
import { getLibraryDataDir, getProxySettingsPath } from "../library/libraryPaths";

const proxyTestUrl = "https://www.gstatic.com/generate_204";
const execFileAsync = promisify(execFile);
const internetSettingsRegistryPath = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";
const knownHttpProxyPorts = [7890, 7897, 7899, 10809, 20172, 2080, 8118];
const knownSocksProxyPorts = [7891, 1080, 10808, 20170, 20171];

const knownProxySoftware: Array<{
  label: string;
  match: RegExp;
}> = [
  { label: "Clash / Mihomo", match: /clash|mihomo/i },
  { label: "Clash Verge", match: /clash[-\s_]?verge/i },
  { label: "v2rayN", match: /v2rayn|v2ray|xray/i },
  { label: "NekoRay", match: /nekoray|nekobox/i },
  { label: "sing-box", match: /sing[-\s_]?box/i },
  { label: "Shadowsocks", match: /shadowsocks|sslocal|ssr/i },
  { label: "Privoxy", match: /privoxy/i },
  { label: "Hiddify", match: /hiddify/i },
  { label: "Netch", match: /netch/i },
];

export async function readProxySettings(): Promise<ProxySettings> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  let content: string;

  try {
    content = await fs.readFile(getProxySettingsPath(), "utf8");
  } catch {
    return normalizeProxySettings(null);
  }

  try {
    return normalizeProxySettings(JSON.parse(content) as unknown);
  } catch {
    return normalizeProxySettings(null);
  }
}

export async function writeProxySettings(input: ProxySettings): Promise<ProxySettings> {
  await fs.mkdir(getLibraryDataDir(), { recursive: true });

  const settings = normalizeAndValidateProxySettings(input);
  const tempPath = `${getProxySettingsPath()}.tmp`;

  await fs.writeFile(tempPath, JSON.stringify(settings, null, 2), "utf8");
  await fs.rename(tempPath, getProxySettingsPath());
  await applyProxySettings(settings);

  return settings;
}

export async function applyStoredProxySettings(): Promise<ProxySettings> {
  const settings = await readProxySettings();

  await applyProxySettings(settings);

  return settings;
}

export async function testProxySettings(input: ProxySettings): Promise<ProxyTestData> {
  const settings = normalizeAndValidateProxySettings(input);
  const currentSettings = await readProxySettings();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  await applyProxySettings(settings);

  try {
    const response = await net.fetch(proxyTestUrl, {
      cache: "no-store",
      headers: {
        "cache-control": "no-cache",
        pragma: "no-cache",
        "user-agent": "Suyan/0.1.0",
      },
      signal: controller.signal,
    });

    if (response.status < 200 || response.status >= 400) {
      throw new AppError("PROXY_TEST_FAILED", `代理连接测试失败，HTTP 状态码 ${response.status}。`);
    }

    return {
      connected: true,
      status: response.status,
      url: proxyTestUrl,
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError("PROXY_TEST_FAILED", "代理测试失败，请检查地址和网络。");
  } finally {
    clearTimeout(timeout);
    await applyProxySettings(currentSettings).catch(() => undefined);
  }
}

export async function detectProxySettings(): Promise<ProxyDetectionData> {
  if (process.platform !== "win32") {
    return resolveProxyDetectionResult({});
  }

  const [systemProxy, processes] = await Promise.all([
    readWindowsSystemProxySettings(),
    readDetectedProxyProcesses(),
  ]);

  return resolveProxyDetectionResult({
    systemProxy,
    processes,
  });
}

async function applyProxySettings(input: ProxySettings): Promise<void> {
  const settings = normalizeAndValidateProxySettings(input);

  await session.defaultSession.setProxy(toElectronProxyConfig(settings));
}

function toElectronProxyConfig(settings: ProxySettings): ProxyConfig {
  if (settings.mode === "direct") {
    return { mode: "direct" };
  }

  if (settings.mode === "system") {
    return { mode: "system" };
  }

  return {
    mode: "fixed_servers",
    proxyRules: settings.server,
    proxyBypassRules: settings.bypassRules,
  };
}

function normalizeAndValidateProxySettings(input: ProxySettings): ProxySettings {
  const settings = normalizeProxySettings(input);
  const validationError = getProxySettingsValidationError(settings);

  if (validationError) {
    throw new AppError("PROXY_SETTINGS_INVALID", validationError);
  }

  return settings;
}

async function readWindowsSystemProxySettings(): Promise<DetectedSystemProxySettings> {
  try {
    const [proxyEnable, proxyServer, proxyOverride, autoConfigUrl, autoDetect] = await Promise.all([
      queryWindowsInternetSetting("ProxyEnable"),
      queryWindowsInternetSetting("ProxyServer"),
      queryWindowsInternetSetting("ProxyOverride"),
      queryWindowsInternetSetting("AutoConfigURL"),
      queryWindowsInternetSetting("AutoDetect"),
    ]);

    return {
      enabled: parseRegistryBoolean(proxyEnable),
      server: proxyServer,
      bypassRules: proxyOverride || defaultDetectedSystemProxySettings.bypassRules,
      autoConfigUrl,
      autoDetect: parseRegistryBoolean(autoDetect),
    };
  } catch {
    return defaultDetectedSystemProxySettings;
  }
}

async function queryWindowsInternetSetting(valueName: string): Promise<string> {
  try {
    const output = await runCommand("reg.exe", [
      "query",
      internetSettingsRegistryPath,
      "/v",
      valueName,
    ]);
    const line = output
      .split(/\r?\n/)
      .map((item) => item.trim())
      .find((item) => item.startsWith(valueName));

    if (!line) {
      return "";
    }

    const parts = line.split(/\s{2,}/);

    return parts.slice(2).join(" ").trim();
  } catch {
    return "";
  }
}

async function readDetectedProxyProcesses(): Promise<DetectedProxyProcess[]> {
  const processes = await readTaskListProcesses();
  const listeningPortsByPid = await readListeningPortsByPid();

  return processes
    .map((processInfo) => {
      const software = knownProxySoftware.find((item) => item.match.test(processInfo.name));

      if (!software) {
        return null;
      }

      const ports = listeningPortsByPid.get(processInfo.pid) ?? [];
      const suggestedServer = resolveSuggestedProxyServer(ports);

      return {
        name: software.label,
        processName: processInfo.name,
        pid: processInfo.pid,
        ports,
        suggestedServer,
      };
    })
    .filter((item): item is DetectedProxyProcess => item !== null);
}

async function readTaskListProcesses(): Promise<Array<{ name: string; pid: number }>> {
  try {
    const output = await runCommand("tasklist.exe", ["/fo", "csv", "/nh"]);

    return output
      .split(/\r?\n/)
      .map((line) => parseCsvLine(line))
      .filter((fields) => fields.length >= 2)
      .map((fields) => ({
        name: fields[0],
        pid: Number.parseInt(fields[1], 10),
      }))
      .filter((processInfo) => processInfo.name && Number.isInteger(processInfo.pid));
  } catch {
    return [];
  }
}

async function readListeningPortsByPid(): Promise<Map<number, number[]>> {
  const portsByPid = new Map<number, Set<number>>();

  try {
    const output = await runCommand("netstat.exe", ["-ano", "-p", "tcp"]);

    for (const line of output.split(/\r?\n/)) {
      const parts = line.trim().split(/\s+/);

      if (parts.length < 5 || parts[0].toUpperCase() !== "TCP") {
        continue;
      }

      const state = parts[parts.length - 2]?.toUpperCase();
      const pid = Number.parseInt(parts[parts.length - 1], 10);
      const port = parseLocalPort(parts[1]);

      if (state !== "LISTENING" || !Number.isInteger(pid) || !port) {
        continue;
      }

      if (!portsByPid.has(pid)) {
        portsByPid.set(pid, new Set());
      }

      portsByPid.get(pid)?.add(port);
    }
  } catch {
    return new Map();
  }

  return new Map(
    [...portsByPid.entries()].map(([pid, ports]) => [
      pid,
      [...ports].sort((left, right) => left - right),
    ]),
  );
}

async function runCommand(command: string, args: string[]): Promise<string> {
  const result = await execFileAsync(command, args, {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    timeout: 4000,
    windowsHide: true,
  });

  return result.stdout;
}

function parseRegistryBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();

  return normalized === "1" || normalized === "0x1" || normalized === "true";
}

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    const nextCharacter = line[index + 1];

    if (character === '"' && nextCharacter === '"') {
      current += '"';
      index += 1;
      continue;
    }

    if (character === '"') {
      quoted = !quoted;
      continue;
    }

    if (character === "," && !quoted) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current || line.endsWith(",")) {
    values.push(current.trim());
  }

  return values;
}

function parseLocalPort(address: string): number | null {
  const match = /:(\d+)$/.exec(address.trim());

  if (!match) {
    return null;
  }

  const port = Number.parseInt(match[1], 10);

  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : null;
}

function resolveSuggestedProxyServer(ports: readonly number[]): string {
  const httpPort = knownHttpProxyPorts.find((port) => ports.includes(port));

  if (httpPort) {
    return `http://127.0.0.1:${httpPort}`;
  }

  const socksPort = knownSocksProxyPorts.find((port) => ports.includes(port));

  if (socksPort) {
    return `socks5://127.0.0.1:${socksPort}`;
  }

  return "";
}
