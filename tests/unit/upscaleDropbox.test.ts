import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resolveUpscaleDropboxDir,
  scanUpscaleDropboxInPaths,
} from "../../electron/main/upscale/upscaleDropbox";
import { resolveUpscalePaths } from "../../electron/main/upscale/upscalePaths";
import type { UpscaleArtifact } from "../../electron/main/upscale/upscaleManifest";
import { REAL_ESRGAN_REQUIRED_FILES } from "../../electron/main/upscale/upscaleManifest";

let workRoot: string;

function fakeArtifact(
  modelId: string,
  fileName: string,
  content: Buffer,
): UpscaleArtifact {
  return {
    modelId: modelId as UpscaleArtifact["modelId"],
    fileName,
    byteSize: content.length,
    sha256: createHash("sha256").update(content).digest("hex"),
    url: `https://example.invalid/${fileName}`,
  };
}

async function writeDropboxFile(name: string, content: Buffer): Promise<void> {
  // 收件目录是「扫描时才建」的，测试先丢文件就得自己把目录建好。
  const dropboxDir = path.join(workRoot, "model-dropbox");
  await fs.mkdir(dropboxDir, { recursive: true });
  await fs.writeFile(path.join(dropboxDir, name), content);
}

beforeEach(async () => {
  workRoot = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-dropbox-"));
});

afterEach(async () => {
  await fs.rm(workRoot, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
});

describe("超分模型收件目录", () => {
  it("识别不出的文件原地不动，并说明原因", async () => {
    await writeDropboxFile("随便下的东西.txt", Buffer.from("hello"));
    const result = await scanUpscaleDropboxInPaths(resolveUpscalePaths(workRoot), resolveUpscaleDropboxDir(workRoot));

    expect(result.scanned).toBe(1);
    expect(result.rejectedCount).toBe(1);
    expect(result.entries[0].fileName).toBe("随便下的东西.txt");
    expect(result.entries[0].state).toBe("rejected");
    expect(result.entries[0].detail).toContain("不认识这个文件");
    // 用户的东西绝不能被删
    await expect(fs.stat(path.join(workRoot, "model-dropbox", "随便下的东西.txt"))).resolves.toBeTruthy();
  });

  it("校验通过的 Real-CUGAN 模型自动落盘并登记进 manifest", async () => {
    const content = Buffer.from("fake-cugan-model-bytes-0001");
    const artifact = fakeArtifact("cugan-2x-no-denoise", "up2x-latest-no-denoise-fixed512.onnx", content);
    await writeDropboxFile(artifact.fileName, content);

    const result = await scanUpscaleDropboxInPaths(resolveUpscalePaths(workRoot), resolveUpscaleDropboxDir(workRoot), {
      artifacts: [artifact],
    });

    expect(result.installedCount).toBe(1);
    expect(result.entries[0].state).toBe("installed");
    expect(result.realCuganInstalledModelIds).toEqual(["cugan-2x-no-denoise"]);

    const manifestPath = path.join(workRoot, "components", "upscale-cugan", "manifest.json");
    const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8")) as { models: unknown[] };
    expect(manifest.models).toHaveLength(1);

    const installed = await fs.readFile(
      path.join(workRoot, "components", "upscale-cugan", "models", artifact.fileName),
    );
    expect(installed.equals(content)).toBe(true);
  });

  it("内容被改动过（SHA-256 不匹配）的模型拒绝安装并给出原因", async () => {
    const content = Buffer.from("fake-cugan-model-bytes-0002");
    const artifact = fakeArtifact("cugan-2x-conservative", "up2x-latest-conservative-fixed512.onnx", content);
    await writeDropboxFile(artifact.fileName, Buffer.from("被改过的字节"));

    const result = await scanUpscaleDropboxInPaths(resolveUpscalePaths(workRoot), resolveUpscaleDropboxDir(workRoot), {
      artifacts: [artifact],
    });

    expect(result.rejectedCount).toBe(1);
    expect(result.entries[0].detail).toMatch(/体积|SHA-256/u);
    expect(result.realCuganInstalledModelIds).toEqual([]);
  });

  it("反复丢同一个文件是幂等的，第二次报「已安装」不重复写盘", async () => {
    const content = Buffer.from("fake-cugan-model-bytes-0003");
    const artifact = fakeArtifact("cugan-2x-denoise1", "up2x-latest-denoise1x-fixed512.onnx", content);
    await writeDropboxFile(artifact.fileName, content);

    const first = await scanUpscaleDropboxInPaths(resolveUpscalePaths(workRoot), resolveUpscaleDropboxDir(workRoot), {
      artifacts: [artifact],
    });
    expect(first.installedCount).toBe(1);

    const second = await scanUpscaleDropboxInPaths(resolveUpscalePaths(workRoot), resolveUpscaleDropboxDir(workRoot), {
      artifacts: [artifact],
    });
    expect(second.installedCount).toBe(0);
    expect(second.alreadyCount).toBe(1);
    expect(second.entries[0].state).toBe("already");
  });

  it("手工放进 models 目录的模型，扫描后也会被登记进 manifest（修复漏登记）", async () => {
    const content = Buffer.from("fake-cugan-model-bytes-0004");
    const artifact = fakeArtifact("cugan-4x-conservative", "up4x-latest-conservative-fixed512.onnx", content);
    const modelsDir = path.join(workRoot, "components", "upscale-cugan", "models");
    await fs.mkdir(modelsDir, { recursive: true });
    await fs.writeFile(path.join(modelsDir, artifact.fileName), content);

    const result = await scanUpscaleDropboxInPaths(resolveUpscalePaths(workRoot), resolveUpscaleDropboxDir(workRoot), {
      artifacts: [artifact],
    });

    // 收件目录是空的，但磁盘上有合法模型 —— 也要登记。
    expect(result.scanned).toBe(0);
    expect(result.realCuganInstalledModelIds).toEqual(["cugan-4x-conservative"]);
    const manifest = JSON.parse(
      await fs.readFile(path.join(workRoot, "components", "upscale-cugan", "manifest.json"), "utf8"),
    ) as { models: Array<{ modelId: string }> };
    expect(manifest.models.map((entry) => entry.modelId)).toEqual(["cugan-4x-conservative"]);
  });

  it("Real-ESRGAN 散件凑齐 12 个必需文件后判定为可用", async () => {
    for (const relativePath of REAL_ESRGAN_REQUIRED_FILES) {
      const target = path.join(workRoot, "components", "upscale-realesrgan", relativePath);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, `stub:${relativePath}`);
    }
    // 收件目录里再丢一个 .param，验证「已有就跳过」。
    await writeDropboxFile("realesrgan-x4plus.param", Buffer.from("stub:models/realesrgan-x4plus.param"));

    const result = await scanUpscaleDropboxInPaths(resolveUpscalePaths(workRoot), resolveUpscaleDropboxDir(workRoot));

    expect(result.realEsrganInstalled).toBe(true);
    const entry = result.entries.find((item) => item.fileName === "realesrgan-x4plus.param");
    expect(entry?.state).toBe("already");
  });

  it("Real-ESRGAN 缺文件时不算可用，并告知还差什么", async () => {
    await writeDropboxFile("realesrgan-x4plus.bin", Buffer.from("stub:models/realesrgan-x4plus.bin"));

    const result = await scanUpscaleDropboxInPaths(resolveUpscalePaths(workRoot), resolveUpscaleDropboxDir(workRoot));

    expect(result.realEsrganInstalled).toBe(false);
    expect(result.entries[0].state).toBe("installed");
    expect(result.entries[0].detail).toContain("还需补齐");
  });

  it("收件目录第一次使用时会放一份说明文件", async () => {
    await scanUpscaleDropboxInPaths(resolveUpscalePaths(workRoot), resolveUpscaleDropboxDir(workRoot));
    const readme = await fs.readFile(
      path.join(workRoot, "model-dropbox", "放这里就行.txt"),
      "utf8",
    );
    expect(readme).toContain("Real-CUGAN");
    expect(readme).toContain("up2x-latest-no-denoise-fixed512.onnx");
  });
});
