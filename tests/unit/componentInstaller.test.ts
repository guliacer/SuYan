import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  installComponent,
  removeFfmpegComponentFromBaseDir,
  type ComponentArtifactProvider,
} from "../../electron/main/modules/componentInstaller";
import {
  readCurrentComponent,
  sha256Hex,
  type CommandRunner,
  type ZipArchiveLoader,
} from "../../electron/main/modules/componentSecurity";
import {
  DEFAULT_COMPONENT_LIMITS,
  FFMPEG_COMPONENT_RELEASE_PAGE_URL,
  FFMPEG_COMPONENT_VERSION,
  NSFW_COMPONENT_RELEASE_PAGE_URL,
  NSFW_COMPONENT_VERSION,
} from "../../electron/main/modules/componentConfig";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

async function makeBaseDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "suyan-install-"));
  temporaryDirectories.push(dir);
  return dir;
}

const loadZip: ZipArchiveLoader = async (data) => {
  const { default: JSZip } = await import("jszip");
  return JSZip.loadAsync(data);
};

const okRunner: CommandRunner = async () => ({ stdout: "ffmpeg version 7.1.1", stderr: "", code: 0 });
const failRunner: CommandRunner = async () => ({ stdout: "", stderr: "boom", code: 1 });

async function makeZip(files: Record<string, Buffer>): Promise<Buffer> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "nodebuffer" });
}
type SignedComponent = {
  publicPem: string;
  manifestBytes: Buffer;
  signature: Buffer;
  zipBuffer: Buffer;
};

async function buildSignedComponent(version = "7.1.1-suyan.1"): Promise<SignedComponent> {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const exe = Buffer.from("MZ fake ffmpeg binary");
  const license = Buffer.from("LICENSE TEXT");
  const zipBuffer = await makeZip({ "ffmpeg.exe": exe, LICENSE: license });
  const manifest = {
    componentId: "ffmpeg",
    version,
    platform: "win32-x64",
    archive: { name: "ffmpeg-win32-x64.zip", sha256: sha256Hex(zipBuffer), size: zipBuffer.length },
    files: [
      { name: "ffmpeg.exe", sha256: sha256Hex(exe), size: exe.length },
      { name: "LICENSE", sha256: sha256Hex(license), size: license.length },
    ],
  };
  const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
  const signature = crypto.sign(null, manifestBytes, privateKey);
  return { publicPem, manifestBytes, signature, zipBuffer };
}

function memoryProvider(component: SignedComponent, archiveOverride?: Buffer): ComponentArtifactProvider {
  return {
    fetchManifest: async () => component.manifestBytes,
    fetchSignature: async () => component.signature,
    fetchArchive: async () => archiveOverride ?? component.zipBuffer,
  };
}

const EXPECTED = { componentId: "ffmpeg", version: "7.1.1-suyan.1", platform: "win32-x64", exeName: "ffmpeg.exe" };

async function stagingLeftovers(base: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(base, "ffmpeg")).catch(() => [] as string[]);
  return entries.filter((entry) => entry.startsWith(".staging"));
}
describe("installComponent secure flow", () => {
  it("uses the fixed configured FFmpeg release page", () => {
    expect(FFMPEG_COMPONENT_RELEASE_PAGE_URL).toBe(
      `https://github.com/guliacer/suyan-components/releases/tag/ffmpeg-${FFMPEG_COMPONENT_VERSION}`,
    );
    expect(NSFW_COMPONENT_RELEASE_PAGE_URL).toBe(
      `https://github.com/guliacer/suyan-components/releases/tag/nsfw-${NSFW_COMPONENT_VERSION}`,
    );
  });

  it("installs a validly signed component and records current.json", async () => {
    const base = await makeBaseDir();
    const component = await buildSignedComponent();
    const result = await installComponent({
      provider: memoryProvider(component),
      baseComponentsDir: base,
      publicKeyPem: component.publicPem,
      limits: DEFAULT_COMPONENT_LIMITS,
      loadZip,
      expected: EXPECTED,
      selfCheckRunner: okRunner,
    });
    expect(result.version).toBe("7.1.1-suyan.1");
    const exe = path.join(result.installedDir, "ffmpeg.exe");
    expect((await fs.readFile(exe)).length).toBeGreaterThan(0);
    const current = await readCurrentComponent(base, "ffmpeg");
    expect(current?.version).toBe("7.1.1-suyan.1");
    expect(await stagingLeftovers(base)).toHaveLength(0);
  });

  it("supports a signed non-executable component with a custom staging self-check", async () => {
    const base = await makeBaseDir();
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const model = Buffer.from("model payload");
    const zipBuffer = await makeZip({ "model/nsfw.onnx": model });
    const manifest = {
      componentId: "nsfw-runtime",
      version: "1.0.0",
      platform: "win32-x64",
      archive: { name: "nsfw-runtime-win32-x64.zip", sha256: sha256Hex(zipBuffer), size: zipBuffer.length },
      files: [{ name: "model/nsfw.onnx", sha256: sha256Hex(model), size: model.length }],
    };
    const manifestBytes = Buffer.from(JSON.stringify(manifest), "utf8");
    const signature = crypto.sign(null, manifestBytes, privateKey);

    const result = await installComponent({
      provider: {
        fetchManifest: async () => manifestBytes,
        fetchSignature: async () => signature,
        fetchArchive: async () => zipBuffer,
      },
      baseComponentsDir: base,
      publicKeyPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      limits: DEFAULT_COMPONENT_LIMITS,
      loadZip,
      expected: { componentId: "nsfw-runtime", version: "1.0.0", platform: "win32-x64" },
      selfCheck: async (stagingDir) => {
        const content = await fs.readFile(path.join(stagingDir, "model", "nsfw.onnx"));
        return content.equals(model);
      },
    });

    expect(result.version).toBe("1.0.0");
    expect(await fs.readFile(path.join(result.installedDir, "model", "nsfw.onnx"))).toEqual(model);
  });

  it("rejects a component signed by the wrong key and installs nothing", async () => {
    const base = await makeBaseDir();
    const component = await buildSignedComponent();
    const wrong = await buildSignedComponent();
    await expect(
      installComponent({
        provider: memoryProvider(component),
        baseComponentsDir: base,
        publicKeyPem: wrong.publicPem,
        limits: DEFAULT_COMPONENT_LIMITS,
        loadZip,
        expected: EXPECTED,
        selfCheckRunner: okRunner,
      }),
    ).rejects.toThrow(/签名校验失败/);
    expect(await readCurrentComponent(base, "ffmpeg")).toBeNull();
  });
  it("rejects a version mismatch", async () => {
    const base = await makeBaseDir();
    const component = await buildSignedComponent("9.9.9");
    await expect(
      installComponent({
        provider: memoryProvider(component),
        baseComponentsDir: base,
        publicKeyPem: component.publicPem,
        limits: DEFAULT_COMPONENT_LIMITS,
        loadZip,
        expected: EXPECTED,
        selfCheckRunner: okRunner,
      }),
    ).rejects.toThrow(/版本不匹配/);
  });

  it("rejects a tampered archive and cleans up staging", async () => {
    const base = await makeBaseDir();
    const component = await buildSignedComponent();
    const tampered = Buffer.concat([component.zipBuffer, Buffer.from("x")]);
    await expect(
      installComponent({
        provider: memoryProvider(component, tampered),
        baseComponentsDir: base,
        publicKeyPem: component.publicPem,
        limits: DEFAULT_COMPONENT_LIMITS,
        loadZip,
        expected: EXPECTED,
        selfCheckRunner: okRunner,
      }),
    ).rejects.toThrow();
    expect(await readCurrentComponent(base, "ffmpeg")).toBeNull();
    expect(await stagingLeftovers(base)).toHaveLength(0);
  });
  it("rejects when the self-check fails and cleans up staging", async () => {
    const base = await makeBaseDir();
    const component = await buildSignedComponent();
    await expect(
      installComponent({
        provider: memoryProvider(component),
        baseComponentsDir: base,
        publicKeyPem: component.publicPem,
        limits: DEFAULT_COMPONENT_LIMITS,
        loadZip,
        expected: EXPECTED,
        selfCheckRunner: failRunner,
      }),
    ).rejects.toThrow(/自检失败/);
    expect(await stagingLeftovers(base)).toHaveLength(0);
  });

  it("preserves the previously installed version when an install fails", async () => {
    const base = await makeBaseDir();
    const oldPlatformDir = path.join(base, "ffmpeg", "6.0.0-old", "win32-x64");
    await fs.mkdir(oldPlatformDir, { recursive: true });
    await fs.writeFile(path.join(oldPlatformDir, "ffmpeg.exe"), "OLD BINARY");
    await fs.writeFile(
      path.join(base, "ffmpeg", "current.json"),
      JSON.stringify({ version: "6.0.0-old", platform: "win32-x64", installedAt: "" }),
    );
    const component = await buildSignedComponent();
    await expect(
      installComponent({
        provider: memoryProvider(component),
        baseComponentsDir: base,
        publicKeyPem: component.publicPem,
        limits: DEFAULT_COMPONENT_LIMITS,
        loadZip,
        expected: EXPECTED,
        selfCheckRunner: failRunner,
      }),
    ).rejects.toThrow();
    const current = await readCurrentComponent(base, "ffmpeg");
    expect(current?.version).toBe("6.0.0-old");
    expect(await fs.readFile(path.join(oldPlatformDir, "ffmpeg.exe"), "utf8")).toBe("OLD BINARY");
  });

  it("removes only the managed FFmpeg component directory", async () => {
    const base = await makeBaseDir();
    const ffmpegFile = path.join(base, "ffmpeg", "6.0-suyan.1", "win32-x64", "ffmpeg.exe");
    const otherComponentFile = path.join(base, "image-runtime", "keep.txt");
    const baseMarker = path.join(base, "keep.txt");
    await fs.mkdir(path.dirname(ffmpegFile), { recursive: true });
    await fs.mkdir(path.dirname(otherComponentFile), { recursive: true });
    await Promise.all([
      fs.writeFile(ffmpegFile, "managed ffmpeg"),
      fs.writeFile(otherComponentFile, "keep image runtime"),
      fs.writeFile(baseMarker, "keep base"),
    ]);

    await expect(removeFfmpegComponentFromBaseDir(base)).resolves.toBe(true);
    await expect(fs.stat(path.join(base, "ffmpeg"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(fs.readFile(otherComponentFile, "utf8")).resolves.toBe("keep image runtime");
    await expect(fs.readFile(baseMarker, "utf8")).resolves.toBe("keep base");
    await expect(removeFfmpegComponentFromBaseDir(base)).resolves.toBe(false);
  });
});
