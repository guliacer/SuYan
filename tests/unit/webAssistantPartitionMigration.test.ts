import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  canonicalPartitionFolderName,
  listLeftoverLocalIterationDataDirs,
  migrateWebAssistantPartitions,
} from "../../electron/main/webAssistant/webAssistantPartitionMigration";

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function makeTempRoot(label: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `suyan-partition-${label}-`));
  tempRoots.push(root);
  return root;
}

function seedPartition(root: string, folderName: string, cookieBytes = "cookie"): string {
  const partitionDir = path.join(root, "Partitions", folderName);
  fs.mkdirSync(path.join(partitionDir, "Network"), { recursive: true });
  fs.writeFileSync(path.join(partitionDir, "Network", "Cookies"), cookieBytes);
  return partitionDir;
}

describe("web assistant partition migration", () => {
  it("maps encoded Chinese and leftover slugs onto the current ASCII names", () => {
    expect(canonicalPartitionFolderName(`webassistant-${encodeURIComponent("豆包")}`)).toBe("webassistant-doubao");
    expect(canonicalPartitionFolderName("webassistant-智谱清言")).toBe("webassistant-chatglm");
    expect(canonicalPartitionFolderName("webassistant-chatgpt-image")).toBe("webassistant-chatgpt");
    expect(canonicalPartitionFolderName("webassistant-qwen-chat")).toBe("webassistant-qwen");
    expect(canonicalPartitionFolderName("webassistant-doubao")).toBeNull();
  });

  it("recovers leftover rebuild partitions into the live portable profile", () => {
    const root = makeTempRoot("recover");
    const userData = path.join(root, "release", "win-unpacked", "data");
    const leftover = path.join(root, "release-next", "win-unpacked", "data");
    seedPartition(leftover, "webassistant-doubao", "doubao-login");
    seedPartition(leftover, `webassistant-${encodeURIComponent("智谱清言")}`, "chatglm-login");

    const result = migrateWebAssistantPartitions({
      userDataPath: userData,
      leftoverDataDirs: [leftover],
    });

    expect(result.recoveredFrom).toEqual([path.resolve(leftover)]);
    expect(result.renamed.map((entry) => entry.to)).toContain("webassistant-chatglm");
    expect(fs.readFileSync(path.join(userData, "Partitions", "webassistant-doubao", "Network", "Cookies"), "utf8")).toBe(
      "doubao-login",
    );
    expect(fs.readFileSync(path.join(userData, "Partitions", "webassistant-chatglm", "Network", "Cookies"), "utf8")).toBe(
      "chatglm-login",
    );
  });

  it("does not overwrite a destination partition that already has cookies", () => {
    const root = makeTempRoot("keep");
    const userData = path.join(root, "AppData", "SuYan");
    const leftover = path.join(root, "release", "win-unpacked", "data");
    seedPartition(userData, "webassistant-kimi", "current");
    seedPartition(leftover, "webassistant-kimi", "stale");

    migrateWebAssistantPartitions({
      userDataPath: userData,
      leftoverDataDirs: [leftover],
    });

    expect(fs.readFileSync(path.join(userData, "Partitions", "webassistant-kimi", "Network", "Cookies"), "utf8")).toBe(
      "current",
    );
  });

  it("lists leftover local iteration data dirs that actually exist", () => {
    const root = makeTempRoot("list");
    const unpackData = path.join(root, "release", "win-unpacked", "data");
    fs.mkdirSync(unpackData, { recursive: true });

    expect(
      listLeftoverLocalIterationDataDirs({
        cwd: root,
        packagedRoot: path.join(root, "release", "win-unpacked"),
      }),
    ).toEqual([path.resolve(unpackData)]);
  });
});
