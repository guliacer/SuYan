import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertZipIntegrity, formatBytes, ZipCorruptError } from "../../electron/main/library/zipIntegrity";

let tempDir: string;

beforeAll(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-zip-integrity-"));
});

afterAll(async () => {
  await fs.rm(tempDir, { recursive: true, force: true });
});

async function writeValidZip(zipPath: string, payloadBytes = 64 * 1024): Promise<number> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("data.json", JSON.stringify({ schemaVersion: 1, items: [] }));
  // 加入一个较大的随机数据文件，确保 ZIP 有真实的本地文件头与数据区。
  zip.file("images/blob.bin", Buffer.alloc(payloadBytes, 7));
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await fs.writeFile(zipPath, buffer);
  return buffer.length;
}

describe("zipIntegrity", () => {
  it("accepts a完整（非截断）ZIP 文件并返回中央目录信息", async () => {
    const zipPath = path.join(tempDir, "ok.zip");
    const size = await writeValidZip(zipPath);
    const info = await assertZipIntegrity(zipPath);
    // data.json + images/blob.bin（JSZip 还会为 images/ 生成目录条目）
    expect(info.entryCount).toBeGreaterThanOrEqual(2);
    expect(info.centralDirectorySize).toBeGreaterThan(0);
    expect(info.centralDirectoryOffset).toBeGreaterThan(0);
    expect(info.centralDirectoryOffset + info.centralDirectorySize).toBeLessThanOrEqual(size);
  });

  it("rejects a truncated ZIP（截断尾部）with ZIP_CORRUPTED", async () => {
    const zipPath = path.join(tempDir, "truncated.zip");
    const size = await writeValidZip(zipPath);
    // 保留前 60%，直接切断文件尾部（真实截断场景：EOCD 与目录一并缺失）。
    const truncated = Buffer.alloc(Math.floor(size * 0.6));
    const full = await fs.readFile(zipPath);
    full.copy(truncated, 0, 0, truncated.length);
    await fs.writeFile(zipPath, truncated);

    await expect(assertZipIntegrity(zipPath)).rejects.toMatchObject({ code: "ZIP_CORRUPTED" });
  });

  it("rejects a ZIP whose EOCD declares a directory beyond the file size", async () => {
    const zipPath = path.join(tempDir, "declared-overflow.zip");
    const size = await writeValidZip(zipPath);
    const raw = await fs.readFile(zipPath);
    // 在中央目录偏移字段写入超出文件大小的值，模拟“缺中间数据”的损坏包。
    const eocdIndex = raw.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(eocdIndex).toBeGreaterThan(0);
    const tampered = Buffer.from(raw);
    tampered.writeUInt32LE(size + 1_000_000, eocdIndex + 16);
    await fs.writeFile(zipPath, tampered);

    await expect(assertZipIntegrity(zipPath)).rejects.toMatchObject({ code: "ZIP_CORRUPTED" });
  });

  it("rejects non-zip garbage and empty files", async () => {
    const garbagePath = path.join(tempDir, "garbage.bin");
    await fs.writeFile(garbagePath, Buffer.from("this is definitely not a zip file at all"));
    await expect(assertZipIntegrity(garbagePath)).rejects.toMatchObject({ code: "ZIP_CORRUPTED" });

    const emptyPath = path.join(tempDir, "empty.zip");
    await fs.writeFile(emptyPath, Buffer.alloc(0));
    await expect(assertZipIntegrity(emptyPath)).rejects.toMatchObject({ code: "ZIP_CORRUPTED" });
  });

  it("reports a missing file as ZIP_READ_FAILED", async () => {
    await expect(assertZipIntegrity(path.join(tempDir, "missing.zip"))).rejects.toMatchObject({ code: "ZIP_READ_FAILED" });
  });

  it("formats missing bytes in human units", () => {
    expect(formatBytes(1_500_000_000)).toContain("GB");
    expect(formatBytes(2_000_000)).toContain("MB");
    expect(formatBytes(512)).toContain("B");
  });

  it("exposes ZipCorruptError with the stable ZIP_CORRUPTED code", () => {
    const error = new ZipCorruptError("测试损坏");
    expect(error.code).toBe("ZIP_CORRUPTED");
    expect(error.message).toBe("测试损坏");
  });
});