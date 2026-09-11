import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { collectMediaFiles } from "../../electron/main/library/externalLibraryScanner";
import { scanMediaFilesViaRustStream } from "../../electron/main/runtime/rustFileOps";
import { rustCoreRuntime } from "../../electron/main/runtime/rustCoreRuntime";

const runtime = vi.hoisted(() => ({ userDataPath: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => runtime.userDataPath, isPackaged: false },
}));

vi.mock("../../electron/main/appLogger", () => ({
  logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

const rootPath = path.join(os.tmpdir(), `suyan-bench-${Date.now()}`);

const rustCoreBinary = path.resolve(
  process.cwd(),
  "native/suyan-core/target/release",
  process.platform === "win32" ? "suyan-core.exe" : "suyan-core",
);
const rustCoreAvailable = process.platform === "win32" && fs.existsSync(rustCoreBinary);

beforeAll(() => {
  if (!rustCoreAvailable) {
    return;
  }
  for (let d = 0; d < 50; d += 1) {
    const dir = path.join(rootPath, `dir${d}`);
    fs.mkdirSync(dir, { recursive: true });
    for (let f = 0; f < 40; f += 1) {
      fs.writeFileSync(path.join(dir, `img${f}.jpg`), Buffer.alloc(10 * 1024, f));
    }
  }
}, 60_000);

afterAll(async () => {
  fs.rmSync(rootPath, { recursive: true, force: true });
  await rustCoreRuntime.stop().catch(() => undefined);
});

describe("Node vs Rust scan performance (persistent sidecar)", () => {
  it("compares scan time on 2000 files", async () => {
    if (!rustCoreAvailable) {
      return;
    }
    // 预热 Rust sidecar（真实应用在启动时已就绪），避免把 spawn 开销计入。
    process.env.SUYAN_USE_RUST_FILE_OPS = "1";
    await rustCoreRuntime.start();

    let t0 = Date.now();
    const rustResult = await scanMediaFilesViaRustStream(rootPath, true, ["jpg"]);
    const tRust = Date.now() - t0;

    t0 = Date.now();
    const nodeFiles = await collectMediaFiles(rootPath, true);
    const tNode = Date.now() - t0;

    // eslint-disable-next-line no-console
    console.log(
      `Rust scan: ${tRust}ms (${rustResult?.files.length} files), Node scan: ${tNode}ms (${nodeFiles.length} files)`,
    );

    expect(rustResult?.files).toHaveLength(2000);
    expect(nodeFiles).toHaveLength(2000);
    expect(rustResult?.files.map((f) => f.relativePath)).toEqual(
      nodeFiles.map((f) => f.relativePath),
    );
  }, 60_000);
});
