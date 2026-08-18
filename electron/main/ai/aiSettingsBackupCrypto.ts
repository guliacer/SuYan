import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

export type EncryptedBackupEnvelope = {
  salt: Buffer;
  iv: Buffer;
  authTag: Buffer;
  ciphertext: Buffer;
};

export class BackupCryptoError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "BackupCryptoError";
    this.code = code;
  }
}

export function deriveKey(password: string, salt: Buffer): Buffer {
  return scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
}

export function encryptBackup(plaintextUtf8: string, password: string): EncryptedBackupEnvelope {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveKey(password, salt);

  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextUtf8, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return { salt, iv, authTag, ciphertext };
}

export function decryptBackup(envelope: EncryptedBackupEnvelope, password: string): string {
  try {
    const key = deriveKey(password, envelope.salt);
    const decipher = createDecipheriv("aes-256-gcm", key, envelope.iv);
    decipher.setAuthTag(envelope.authTag);
    const plaintext = Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]);
    return plaintext.toString("utf8");
  } catch {
    throw new BackupCryptoError(
      "Backup decryption failed: wrong password or tampered data",
      "AI_SETTINGS_BACKUP_DECRYPT_FAILED",
    );
  }
}
