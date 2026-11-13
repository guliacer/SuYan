/**
 * 超分模型补齐工具。
 *
 * 做四件事：
 *   1. 按 upscaleManifest.ts 里的定义，逐个检查 models/ 下的文件是否存在、大小是否对、SHA-256 是否对；
 *   2. 缺的 / 坏的从 CDN 下载（可选 --proxy 走代理）；
 *   3. 全部通过后重建 manifest.json，把 11 个模型都登记进去；
 *   4. 打印审计表：哪些就绪、哪些是这次补的、哪些还没搞定。
 *
 * 用法：
 *   node scripts/fetch-upscale-models.mjs
 *   node scripts/fetch-upscale-models.mjs --proxy http://127.0.0.1:7890
 *   node scripts/fetch-upscale-models.mjs --dry-run      # 只审计不下载
 *
 * 设计上是幂等的：已经就绪的文件一个字节都不会碰，可以反复跑。
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const proxyArg = args.indexOf("--proxy");
const proxyUrl = proxyArg >= 0 ? args[proxyArg + 1] : null;

const projectRoot = path.resolve(import.meta.dirname, "..");
const modelsDir = path.join(projectRoot, "release/win-unpacked/data/components/upscale-cugan/models");
const manifestPath = path.join(projectRoot, "release/win-unpacked/data/components/upscale-cugan/manifest.json");
const baseUrl = "https://real-cugan.webgpu.me/models";

/** 与 electron/main/upscale/upscaleManifest.ts 的 REAL_CUGAN_ARTIFACTS 保持一致。 */
const ARTIFACTS = [
  { modelId: "cugan-2x-no-denoise", fileName: "up2x-latest-no-denoise-fixed512.onnx", byteSize: 5_148_509, sha256: "bb553bc4e29c59916d0e87a97b4e211095ca7fbea3863b20a4f3b05a4e1721c2" },
  { modelId: "cugan-2x-conservative", fileName: "up2x-latest-conservative-fixed512.onnx", byteSize: 5_148_509, sha256: "68aa158c9322bf5c34ee2070c81818c707de7a7f0345885edf588a5f546eab91" },
  { modelId: "cugan-2x-denoise1", fileName: "up2x-latest-denoise1x-fixed512.onnx", byteSize: 5_148_509, sha256: "d46f5cbe196c339918120805ef359644b1363f67a96ce0c9f710c6f4ebcaa0b7" },
  { modelId: "cugan-2x-denoise2", fileName: "up2x-latest-denoise2x-fixed512.onnx", byteSize: 5_148_509, sha256: "9f8f36e24082e622cf2407075cfd0504c8e89e01ee9a610001075d1c734b00f2" },
  { modelId: "cugan-2x-denoise3", fileName: "up2x-latest-denoise3x-fixed512.onnx", byteSize: 5_148_509, sha256: "db2c6fe241c3002d4c838eaca87ce9f2c7e21129c5dcdfaec8538dc965132ffd" },
  { modelId: "cugan-3x-no-denoise", fileName: "up3x-latest-no-denoise-fixed512.onnx", byteSize: 5_155_423, sha256: "29b7ff8308fa4e51bb0959501019960b5943cd9bd3c13171cc28f1e49ec5dc1b" },
  { modelId: "cugan-3x-conservative", fileName: "up3x-latest-conservative-fixed512.onnx", byteSize: 5_155_423, sha256: "b4f57df0c9add55c44478576be6731dc16bb1b7e1968f3c5639fb6e88d9ba185" },
  { modelId: "cugan-3x-denoise3", fileName: "up3x-latest-denoise3x-fixed512.onnx", byteSize: 5_155_423, sha256: "c6788e2fd17069713f34aa7a07137e2d0e75c3d043245f92da186dbbdad78a6b" },
  { modelId: "cugan-4x-no-denoise", fileName: "up4x-latest-no-denoise-fixed512.onnx", byteSize: 5_637_971, sha256: "13696addef2b397e0aca4a43cd1bca2212232c95eaadfc52a9949335d2f3b2fe" },
  { modelId: "cugan-4x-conservative", fileName: "up4x-latest-conservative-fixed512.onnx", byteSize: 5_637_971, sha256: "bb58b399acbfaf8228e6f084bf1f82376882a3865dcd2f0ac71fa92dbbf183ee" },
  { modelId: "cugan-4x-denoise3", fileName: "up4x-latest-denoise3x-fixed512.onnx", byteSize: 5_637_971, sha256: "0db3b74d3501a6a9dbca5b865215369c90906ec30cd0061def91da7ca766206c" },
];

async function sha256Of(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function inspect(artifact) {
  const filePath = path.join(modelsDir, artifact.fileName);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return { ...artifact, filePath, state: "missing", detail: "文件不存在" };
  }
  if (stat.size !== artifact.byteSize) {
    return { ...artifact, filePath, state: "bad-size", detail: `大小 ${stat.size} ≠ 期望 ${artifact.byteSize}` };
  }
  const buffer = await fs.readFile(filePath);
  const hash = await sha256Of(buffer);
  if (hash !== artifact.sha256) {
    return { ...artifact, filePath, state: "bad-hash", detail: `SHA-256 不匹配（实际 ${hash.slice(0, 12)}…）` };
  }
  return { ...artifact, filePath, state: "ok", detail: "就绪" };
}

function fetchBuffer(url, totalBytes, label) {
  return new Promise((resolve, reject) => {
    const doRequest = (target) => {
      const client = target.startsWith("http:") ? http : https;
      const request = client.get(target, (response) => {
        if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          doRequest(response.headers.location);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${label}: HTTP ${response.statusCode}`));
          return;
        }
        const chunks = [];
        let received = 0;
        let lastPercent = -1;
        response.on("data", (chunk) => {
          chunks.push(chunk);
          received += chunk.length;
          const percent = totalBytes > 0 ? Math.floor((received / totalBytes) * 100) : 0;
          if (percent !== lastPercent && percent % 20 === 0) {
            lastPercent = percent;
            process.stdout.write(`      ${label} ${percent}%\n`);
          }
        });
        response.on("end", () => resolve(Buffer.concat(chunks)));
        response.on("error", reject);
      });
      request.on("error", reject);
      request.setTimeout(120_000, () => {
        request.destroy(new Error(`${label}: 下载超时`));
      });
    };

    if (proxyUrl) {
      const parsed = new URL(url);
      const request = http.request(
        {
          host: new URL(proxyUrl).hostname,
          port: new URL(proxyUrl).port || 80,
          method: "CONNECT",
          path: `${parsed.hostname}:443`,
        },
        () => undefined,
      );
      request.on("connect", (res, socket) => {
        if (res.statusCode !== 200) {
          reject(new Error(`${label}: 代理 CONNECT 返回 ${res.statusCode}`));
          return;
        }
        const tlsRequest = https.request(
          {
            host: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: "GET",
            socket,
            agent: null,
            servername: parsed.hostname,
          },
          (response) => {
            if (response.statusCode !== 200) {
              response.resume();
              reject(new Error(`${label}: HTTP ${response.statusCode}`));
              return;
            }
            const chunks = [];
            response.on("data", (chunk) => chunks.push(chunk));
            response.on("end", () => resolve(Buffer.concat(chunks)));
            response.on("error", reject);
          },
        );
        tlsRequest.on("error", reject);
        tlsRequest.end();
      });
      request.on("error", reject);
      request.end();
      return;
    }

    doRequest(url);
  });
}

async function main() {
  await fs.mkdir(modelsDir, { recursive: true });

  console.log(`审计目录：${modelsDir}`);
  console.log(`下载源  ：${baseUrl}`);
  if (proxyUrl) console.log(`代理    ：${proxyUrl}`);
  if (dryRun) console.log("模式    ：--dry-run（只审计，不下载）");
  console.log("");

  const results = [];
  for (const artifact of ARTIFACTS) {
    results.push(await inspect(artifact));
  }

  const ready = results.filter((entry) => entry.state === "ok");
  const broken = results.filter((entry) => entry.state !== "ok");

  console.log("【审计结果】");
  for (const entry of results) {
    const mark = entry.state === "ok" ? "✓" : "✗";
    console.log(`  ${mark} ${entry.fileName.padEnd(44)} ${entry.detail}`);
  }
  console.log(`\n  就绪 ${ready.length} / ${ARTIFACTS.length}，待处理 ${broken.length}\n`);

  if (broken.length > 0 && !dryRun) {
    console.log("【开始补齐】");
    for (const entry of broken) {
      const url = `${baseUrl}/${entry.fileName}`;
      console.log(`  ↓ ${entry.fileName}`);
      const buffer = await fetchBuffer(url, entry.byteSize, entry.fileName);
      const hash = await sha256Of(buffer);
      if (buffer.length !== entry.byteSize) {
        throw new Error(`${entry.fileName}: 下载大小 ${buffer.length} ≠ 期望 ${entry.byteSize}`);
      }
      if (hash !== entry.sha256) {
        throw new Error(`${entry.fileName}: SHA-256 校验失败（${hash}）`);
      }
      // 先写临时文件再原子替换，避免下到一半留下半个模型。
      const tmp = `${entry.filePath}.part`;
      await fs.writeFile(tmp, buffer);
      await fs.rename(tmp, entry.filePath);
      console.log(`      OK ${(buffer.length / 1024 / 1024).toFixed(2)} MB，sha256 ${hash.slice(0, 12)}…`);
    }
    console.log("");
  }

  // 无论有没有下载，都按「磁盘上真实就绪的模型」重建 manifest，
  // 这样手工放进去的文件只要 hash 对就会被登记。
  const finalStates = [];
  for (const artifact of ARTIFACTS) {
    finalStates.push(await inspect(artifact));
  }
  const installed = finalStates.filter((entry) => entry.state === "ok");

  const manifest = {
    version: 1,
    installedAt: new Date().toISOString(),
    models: installed.map((entry) => ({
      modelId: entry.modelId,
      fileName: entry.fileName,
      byteSize: entry.byteSize,
      sha256: entry.sha256,
    })),
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  console.log(`manifest 已重建：${manifestPath}`);
  console.log(`  登记 ${installed.length} / ${ARTIFACTS.length} 个模型`);

  const stillMissing = finalStates.filter((entry) => entry.state !== "ok");
  if (stillMissing.length > 0) {
    console.log("\n【仍未就绪】");
    for (const entry of stillMissing) {
      console.log(`  ✗ ${entry.fileName} —— ${entry.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("\n全部 11 个 Real-CUGAN 模型就绪。");
  }
}

await main();
