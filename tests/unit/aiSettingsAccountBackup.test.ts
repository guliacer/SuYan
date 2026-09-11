import { beforeEach, describe, expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
const state = vi.hoisted(() => ({ uid: "issuer#alice" as string | null, key: Buffer.alloc(32, 7), keyCalls: 0, available: true }));
vi.mock("../../electron/main/account/accountService", () => ({
  getAuthorInfo: () => state.uid ? { uid: state.uid, username: "测试" } : null,
  getAccountBackupKey: async (uid: string, keyId = "test-backup-key-0001") => {
    state.keyCalls++;
    if (!state.available) throw new Error("Guli Identity 尚未启用账户加密备份");
    if (state.uid !== uid || uid !== "issuer#alice") throw new Error("账户校验失败");
    return { uid, keyId, key: Buffer.from(state.key) };
  },
}));
import { parseAccountBackup, serializeAccountBackup } from "../../electron/main/ai/aiSettingsAccountBackup";
import { normalizeAiProviderSettings } from "../../electron/main/ai/aiSettingsModel";
import { parseBackupFile, serializePlainBackup, serializeFullBackup } from "../../electron/main/ai/aiSettingsBackup";
const settings = normalizeAiProviderSettings({ activeProfileId: "fixture", profiles: [{ id: "fixture", name: "测试配置", enabled: true, baseUrl: "https://api.example.test/v1", model: "test-model", apiKey: "fixture-private-api-key" }] });
beforeEach(() => { state.uid = "issuer#alice"; state.key = randomBytes(32); state.keyCalls = 0; state.available = true; });
describe("账户加密备份", () => {
  it("同账户成功往返且密钥只在加密负载内", async () => {
    const envelope = await serializeAccountBackup(settings);
    expect(JSON.stringify(envelope)).not.toContain("fixture-private-api-key");
    expect(JSON.stringify(envelope)).not.toContain(state.key.toString("base64"));
    const restored = await parseAccountBackup(JSON.parse(JSON.stringify(envelope)));
    expect(normalizeAiProviderSettings(restored.payload).profiles[0].apiKey).toBe("fixture-private-api-key");
    expect(restored.ownerUid).toBe("issuer#alice");
  });
  it("未登录与不同账户在请求密钥前拒绝导入", async () => {
    const envelope = await serializeAccountBackup(settings);
    const requests = state.keyCalls;
    state.uid = null;
    await expect(parseAccountBackup(envelope)).rejects.toMatchObject({ code: "AI_BACKUP_LOGIN_REQUIRED" });
    state.uid = "issuer#bob";
    await expect(parseAccountBackup(envelope)).rejects.toMatchObject({ code: "AI_BACKUP_WRONG_ACCOUNT" });
    expect(state.keyCalls).toBe(requests);
  });
  it("篡改时间、密钥标识、密文均不能通过认证解密", async () => {
    const envelope = await serializeAccountBackup(settings);
    for (const patch of [{ exportedAt: "changed" }, { keyId: "test-backup-key-0002" }, { ciphertext: Buffer.from("tampered").toString("base64") }]) {
      await expect(parseAccountBackup({ ...envelope, ...patch })).rejects.toMatchObject({ code: "AI_BACKUP_DECRYPT_FAILED" });
    }
  });
  it("公开 UID 无法解密；服务器不可用时不生成替代明文文件", async () => {
    const envelope = await serializeAccountBackup(settings);
    state.key = Buffer.alloc(32, 1);
    await expect(parseAccountBackup(envelope)).rejects.toMatchObject({ code: "AI_BACKUP_DECRYPT_FAILED" });
    state.available = false;
    await expect(serializeAccountBackup(settings)).rejects.toThrow(/尚未启用/);
  });
  it("普通导出与原密码加密格式仍可读，普通导出不含密钥", async () => {
    const plain = serializePlainBackup(settings);
    expect(JSON.stringify(plain)).not.toContain("fixture-private-api-key");
    expect(parseBackupFile(JSON.stringify(plain)).ok).toBe(true);
    const full = await serializeFullBackup(settings, "fixture-password");
    expect(parseBackupFile(JSON.stringify(full), "fixture-password").ok).toBe(true);
    expect(parseBackupFile(JSON.stringify(full), "wrong").ok).toBe(false);
  });
});
