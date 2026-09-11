import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const state = vi.hoisted(() => ({ uid: "issuer#alice" as string | null, file: "", available: true, committed: false, switchAtCommit: false, defaultName: "" }));
vi.mock("electron", () => ({ app: { getVersion: () => "9.8.7" }, dialog: {
  showOpenDialog: async () => ({ canceled: false, filePaths: [state.file] }),
  showSaveDialog: async (options: { defaultPath: string }) => {
    state.defaultName = options.defaultPath;
    return { canceled: false, filePath: state.file };
  },
} }));
vi.mock("../../electron/main/appLogger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("../../electron/main/account/accountService", () => ({
  getAuthorInfo: () => state.uid ? { uid: state.uid, username: "测试" } : null,
  getAccountBackupKey: async (uid: string, keyId = "test-backup-key-0001") => {
    if (!state.available || uid !== state.uid) throw new Error("账户验证失败");
    return { uid, keyId, key: Buffer.alloc(32, 7) };
  },
}));
vi.mock("../../electron/main/ai/aiSettingsStore", async () => {
  const { normalizeAiProviderSettings, toPublicAiProviderSettings } = await import("../../electron/main/ai/aiSettingsModel");
  return {
    readPrivateAiProviderSettings: async () => normalizeAiProviderSettings({}),
    writeAiProviderSettings: async (settings: unknown, beforeCommit?: () => void) => {
      if (state.switchAtCommit) state.uid = "issuer#bob";
      beforeCommit?.();
      state.committed = true;
      return toPublicAiProviderSettings(normalizeAiProviderSettings(settings));
    },
  };
});
import { serializeAccountBackup } from "../../electron/main/ai/aiSettingsAccountBackup";
import { normalizeAiProviderSettings } from "../../electron/main/ai/aiSettingsModel";
import { exportSettingsBackup, importSettingsApply, importSettingsPreview } from "../../electron/main/ai/aiSettingsBackupService";
let tempDir: string;
beforeEach(async () => {
  Object.assign(state, { uid: "issuer#alice", available: true, committed: false, switchAtCommit: false });
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-backup-service-"));
  state.file = path.join(tempDir, "fixture.suyan-ai");
  const settings = normalizeAiProviderSettings({ profiles: [{ id: "fixture", name: "测试配置", apiKey: "fixture-secret", model: "fixture-model", baseUrl: "https://example.test/v1" }] });
  await fs.writeFile(state.file, JSON.stringify(await serializeAccountBackup(settings)), "utf8");
});
afterEach(async () => { await fs.rm(tempDir, { recursive: true, force: true }); });

describe("账户备份预览与实际应用", () => {
  it("账户加密导出使用统一名称，保留 v3 账户验证格式", async () => {
    await exportSettingsBackup({ type: "account" });
    expect(state.defaultName).toMatch(/^素言-v9\.8\.7-AI设置-账户加密-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}\.suyan-ai$/);
    expect(JSON.parse(await fs.readFile(state.file, "utf8"))).toMatchObject({ formatVersion: 3, ownerUid: state.uid });
    expect((await importSettingsPreview()).formatVersion).toBe(3);
  });
  it("预览仅返回 v3 统计，同账户可以应用且令牌只能用一次", async () => {
    const preview = await importSettingsPreview();
    expect(preview.formatVersion).toBe(3);
    expect(JSON.stringify(preview)).not.toContain("fixture-secret");
    await importSettingsApply(preview.token, "replace");
    expect(state.committed).toBe(true);
    await expect(importSettingsApply(preview.token, "replace")).rejects.toMatchObject({ code: "AI_SETTINGS_BACKUP_INVALID" });
  });
  it.each([null, "issuer#bob"])("预览后换号或退出（%s）不写入设置", async (uid) => {
    const preview = await importSettingsPreview(); state.uid = uid;
    await expect(importSettingsApply(preview.token, "replace")).rejects.toThrow(/验证失败/);
    expect(state.committed).toBe(false);
  });
  it("预览后服务端撤销权限时再次验证失败，不使用已缓存明文绕过验证", async () => {
    const preview = await importSettingsPreview(); state.available = false;
    await expect(importSettingsApply(preview.token, "replace")).rejects.toThrow(/验证失败/);
    expect(state.committed).toBe(false);
  });
  it("排队写入过程中换号，提交前回调拒绝落盘", async () => {
    const preview = await importSettingsPreview(); state.switchAtCommit = true;
    await expect(importSettingsApply(preview.token, "replace")).rejects.toMatchObject({ code: "AI_BACKUP_ACCOUNT_CHANGED" });
    expect(state.committed).toBe(false);
  });
});
