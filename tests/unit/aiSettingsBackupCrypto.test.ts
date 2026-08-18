import { describe, expect, it } from "vitest";
import {
  deriveKey,
  encryptBackup,
  decryptBackup,
  type EncryptedBackupEnvelope,
} from "../../electron/main/ai/aiSettingsBackupCrypto";

describe("deriveKey", () => {
  it("returns a 32-byte Buffer", () => {
    const salt = Buffer.alloc(16, 0xab);
    const key = deriveKey("test-password", salt);
    expect(key).toBeInstanceOf(Buffer);
    expect(key).toHaveLength(32);
  });

  it("returns the same key for the same password and salt", () => {
    const salt = Buffer.alloc(16, 0x01);
    const a = deriveKey("hello", salt);
    const b = deriveKey("hello", salt);
    expect(a.equals(b)).toBe(true);
  });

  it("returns different keys for different passwords", () => {
    const salt = Buffer.alloc(16, 0x01);
    const a = deriveKey("password-a", salt);
    const b = deriveKey("password-b", salt);
    expect(a.equals(b)).toBe(false);
  });

  it("returns different keys for different salts", () => {
    const a = deriveKey("same-password", Buffer.alloc(16, 0x01));
    const b = deriveKey("same-password", Buffer.alloc(16, 0x02));
    expect(a.equals(b)).toBe(false);
  });
});

describe("encryptBackup / decryptBackup round-trip", () => {
  it("decrypts the original plaintext with the correct password", () => {
    const plaintext = "this is a secret backup";
    const password = "my-secure-password";
    const envelope = encryptBackup(plaintext, password);
    const result = decryptBackup(envelope, password);
    expect(result).toBe(plaintext);
  });

  it("round-trips UTF-8 Chinese text", () => {
    const plaintext = "这是一段中文备份内容，包含特殊字符：中文标点、emoji 🎉、换行\n和制表符\t。";
    const password = "密码测试-123";
    const envelope = encryptBackup(plaintext, password);
    const result = decryptBackup(envelope, password);
    expect(result).toBe(plaintext);
  });

  it("round-trips a long plaintext", () => {
    const plaintext = "A".repeat(10000);
    const envelope = encryptBackup(plaintext, "long-text-password");
    expect(decryptBackup(envelope, "long-text-password")).toBe(plaintext);
  });
});

describe("error handling", () => {
  it("throws BackupCryptoError with code AI_SETTINGS_BACKUP_DECRYPT_FAILED for wrong password", () => {
    const envelope = encryptBackup("secret", "correct-password");
    expect(() => decryptBackup(envelope, "wrong-password")).toThrow(
      expect.objectContaining({ code: "AI_SETTINGS_BACKUP_DECRYPT_FAILED" }),
    );
  });

  it("throws BackupCryptoError with code AI_SETTINGS_BACKUP_DECRYPT_FAILED for tampered ciphertext", () => {
    const envelope = encryptBackup("secret", "password");
    const tampered = {
      ...envelope,
      ciphertext: Buffer.from(envelope.ciphertext),
    };
    // Flip a byte in the ciphertext
    tampered.ciphertext[0] ^= 0xff;
    expect(() => decryptBackup(tampered, "password")).toThrow(
      expect.objectContaining({ code: "AI_SETTINGS_BACKUP_DECRYPT_FAILED" }),
    );
  });

  it("throws BackupCryptoError with code AI_SETTINGS_BACKUP_DECRYPT_FAILED for tampered authTag", () => {
    const envelope = encryptBackup("secret", "password");
    const tampered = {
      ...envelope,
      authTag: Buffer.from(envelope.authTag),
    };
    tampered.authTag[0] ^= 0xff;
    expect(() => decryptBackup(tampered, "password")).toThrow(
      expect.objectContaining({ code: "AI_SETTINGS_BACKUP_DECRYPT_FAILED" }),
    );
  });
});

describe("envelope structure", () => {
  it("salt is 16 bytes", () => {
    const envelope = encryptBackup("test", "pw");
    expect(envelope.salt).toHaveLength(16);
  });

  it("iv is 12 bytes", () => {
    const envelope = encryptBackup("test", "pw");
    expect(envelope.iv).toHaveLength(12);
  });

  it("authTag is 16 bytes", () => {
    const envelope = encryptBackup("test", "pw");
    expect(envelope.authTag).toHaveLength(16);
  });
});

describe("randomness", () => {
  it("two encryptions of the same text produce different salt, iv, and ciphertext", () => {
    const plaintext = "same content";
    const password = "same-password";
    const a = encryptBackup(plaintext, password);
    const b = encryptBackup(plaintext, password);

    // Salt should differ (probabilistically, with 16 random bytes the collision chance is negligible)
    expect(a.salt.equals(b.salt)).toBe(false);
    // IV should differ
    expect(a.iv.equals(b.iv)).toBe(false);
    // Ciphertext should differ (due to different salt→different key, and different IV)
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });
});
