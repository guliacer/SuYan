import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  loadGuliIdentityFileConfig,
  parseGuliIdentityEnv,
  resolveGuliIdentityConfigPaths,
} from "../../electron/main/account/oauth/guliIdentityConfig";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("guliIdentityConfig", () => {
  it("只解析允许的公共字段并支持 BOM、export 和引号", () => {
    expect(
      parseGuliIdentityEnv(
        '\uFEFFexport GULI_IDENTITY_ISSUER="https://auth.example.test"\n' +
          "GULI_IDENTITY_CLIENT_ID=public-client\n" +
          "GULI_IDENTITY_REDIRECT_URI='suyan://oauth/callback'\n" +
          "GULI_IDENTITY_SCOPES=openid email\n" +
          "DATABASE_URL=should-be-ignored\n",
      ),
    ).toEqual({
      GULI_IDENTITY_ISSUER: "https://auth.example.test",
      GULI_IDENTITY_CLIENT_ID: "public-client",
      GULI_IDENTITY_REDIRECT_URI: "suyan://oauth/callback",
      GULI_IDENTITY_SCOPES: "openid email",
    });
  });

  it("按显式、资源目录、软件目录和开发目录顺序生成候选路径", () => {
    const projectRoot = path.join("C:\\workspace", "suyan");
    expect(
      resolveGuliIdentityConfigPaths({
        explicitPath: path.join(projectRoot, "private.env"),
        resourcesPath: path.join(projectRoot, "resources"),
        executablePath: path.join(projectRoot, "SuYan.exe"),
        projectRoot,
      }),
    ).toEqual([
      path.join(projectRoot, "private.env"),
      path.join(projectRoot, "resources", "guli-identity.env"),
      path.join(projectRoot, "guli-identity.env"),
      path.join(projectRoot, "config", "guli-identity.env"),
      path.join(projectRoot, "private", "guli-identity.env"),
      path.join(projectRoot, "config", "guli-identity.public.env"),
      path.join(projectRoot, ".env"),
    ]);
  });

  it("保留高优先级文件的值并从低优先级文件补齐缺失字段", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "suyan-guli-config-"));
    temporaryDirectories.push(directory);
    const highPriority = path.join(directory, "resources.env");
    const lowPriority = path.join(directory, "private.env");

    fs.writeFileSync(
      highPriority,
      "GULI_IDENTITY_CLIENT_ID=public-client\nGULI_IDENTITY_SCOPES=openid email\n",
      "utf8",
    );
    fs.writeFileSync(
      lowPriority,
      "GULI_IDENTITY_ISSUER=https://auth.example.test\nGULI_IDENTITY_CLIENT_ID=lower-priority\n",
      "utf8",
    );

    expect(loadGuliIdentityFileConfig([highPriority, lowPriority])).toEqual({
      GULI_IDENTITY_ISSUER: "https://auth.example.test",
      GULI_IDENTITY_CLIENT_ID: "public-client",
      GULI_IDENTITY_SCOPES: "openid email",
    });
  });
});
