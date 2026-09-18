import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  getProxySettingsValidationError,
  normalizeDetectedProxyServer,
  normalizeProxyServer,
  normalizeProxySettings,
  resolveProxyDetectionResult,
} from "@/features/library/types/proxy";

describe("proxy settings", () => {
  it("keeps proxy content top-aligned and mode choices compact", () => {
    const source = readFileSync("src/features/library/components/ProxySettingsDialog.tsx", "utf8");

    expect(source).toContain("h-16 min-h-0 content-center gap-1.5 rounded-lg border px-2.5 py-2");
    expect(source).toContain('className="text-[11px] leading-4 text-muted min-[900px]:text-xs"');
    expect(source).toContain('className="grid gap-3 min-[720px]:grid-cols-2"');
    expect(source).toContain('className={`grid min-h-0 flex-1 content-start gap-4');
    expect(source).not.toContain('className={`grid min-h-0 flex-1 content-center gap-4');
    expect(source).not.toContain("min-h-28 content-start gap-2 rounded-md border px-3 py-3");
  });

  it("uses system proxy by default", () => {
    expect(normalizeProxySettings(null)).toEqual({
      mode: "system",
      server: "",
      bypassRules: "localhost,127.0.0.1,<local>",
    });
  });

  it("normalizes host port proxy servers", () => {
    expect(normalizeProxyServer("127.0.0.1:7890")).toBe("http://127.0.0.1:7890");
    expect(normalizeProxyServer("socks5://127.0.0.1:7890/")).toBe("socks5://127.0.0.1:7890");
  });

  it("normalizes Windows per-protocol proxy servers", () => {
    expect(normalizeDetectedProxyServer("http=127.0.0.1:7890;https=127.0.0.1:7890;socks=127.0.0.1:7891")).toBe(
      "http://127.0.0.1:7890",
    );
    expect(normalizeDetectedProxyServer("socks=127.0.0.1:7891")).toBe("socks5://127.0.0.1:7891");
  });

  it("requires a valid server only for custom mode", () => {
    expect(getProxySettingsValidationError({ mode: "system", server: "" })).toBeNull();
    expect(getProxySettingsValidationError({ mode: "direct", server: "" })).toBeNull();
    expect(getProxySettingsValidationError({ mode: "custom", server: "" })).toBe("请填写代理地址。");
    expect(getProxySettingsValidationError({ mode: "custom", server: "ftp://127.0.0.1:7890" })).toContain(
      "代理地址格式不正确",
    );
    expect(getProxySettingsValidationError({ mode: "custom", server: "socks5://127.0.0.1:7890" })).toBeNull();
  });

  it("prefers Windows system proxy when detection finds one", () => {
    const detection = resolveProxyDetectionResult({
      systemProxy: {
        enabled: true,
        server: "127.0.0.1:7890",
        bypassRules: "localhost;127.0.0.1;<local>",
      },
      processes: [
        {
          name: "Clash / Mihomo",
          processName: "mihomo.exe",
          pid: 100,
          ports: [7890],
          suggestedServer: "http://127.0.0.1:7890",
        },
      ],
    });

    expect(detection.source).toBe("windows-system");
    expect(detection.settings).toEqual({
      mode: "custom",
      server: "http://127.0.0.1:7890",
      bypassRules: "localhost,127.0.0.1,<local>",
    });
  });

  it("uses running proxy software when system proxy is not configured", () => {
    const detection = resolveProxyDetectionResult({
      processes: [
        {
          name: "v2rayN",
          processName: "v2rayN.exe",
          pid: 101,
          ports: [10808, 10809],
          suggestedServer: "http://127.0.0.1:10809",
        },
      ],
    });

    expect(detection.source).toBe("running-process");
    expect(detection.settings).toMatchObject({
      mode: "custom",
      server: "http://127.0.0.1:10809",
    });
  });
});
