import { app, dialog as nativeDialog } from "electron";
import type { BrowserWindow, OpenDialogOptions, OpenDialogReturnValue, SaveDialogOptions, SaveDialogReturnValue } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { reportExportProgress } from "./exportTask";

type DialogDirectories = { import?: string; export?: string };
let writeQueue: Promise<void> = Promise.resolve();

function preferencesPath(): string {
  const userData = app.getPath("userData");
  if (!path.isAbsolute(userData)) throw new Error("应用数据目录尚未就绪");
  return path.join(userData, "library", "file-dialog-settings.json");
}

async function readDirectories(filePath: string): Promise<DialogDirectories> {
  try {
    const value = JSON.parse(await fs.readFile(filePath, "utf8"));
    const state: DialogDirectories = {};
    for (const key of ["import", "export"] as const) {
      if (typeof value?.[key] === "string" && path.isAbsolute(value[key])) state[key] = value[key];
    }
    return state;
  } catch { return {}; }
}

async function rememberedDirectory(kind: keyof DialogDirectories): Promise<string | undefined> {
  try {
    await writeQueue;
    const directory = (await readDirectories(preferencesPath()))[kind];
    if (directory && (await fs.stat(directory)).isDirectory()) return directory;
  } catch { /* Removed folders/disconnected drives fall back to the normal chooser location. */ }
  return undefined;
}

async function rememberDirectory(kind: keyof DialogDirectories, directory: string): Promise<void> {
  let filePath: string;
  try { filePath = preferencesPath(); } catch { return; }
  const write = async () => {
    const state = await readDirectories(filePath);
    const temporaryPath = `${filePath}.${randomUUID()}.tmp`;
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(temporaryPath, JSON.stringify({ ...state, [kind]: directory }, null, 2), "utf8");
      await fs.rename(temporaryPath, filePath);
    } finally { await fs.rm(temporaryPath, { force: true }).catch(() => undefined); }
  };
  // Preference writes never hold a library lock or turn a successful export into a failure.
  writeQueue = writeQueue.then(write, write).catch(() => {
    void import("../appLogger").then(({ logger }) => {
      logger.warn("main", "file-dialog:remember-failed", { code: "DIALOG_DIRECTORY_SAVE_FAILED" });
    }).catch(() => undefined);
  });
  await writeQueue;
}

function showOpenDialog(options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
function showOpenDialog(owner: BrowserWindow, options: OpenDialogOptions): Promise<OpenDialogReturnValue>;
async function showOpenDialog(ownerOrOptions: BrowserWindow | OpenDialogOptions, maybeOptions?: OpenDialogOptions): Promise<OpenDialogReturnValue> {
  const owner = maybeOptions ? ownerOrOptions as BrowserWindow : undefined;
  const options = maybeOptions ?? ownerOrOptions as OpenDialogOptions;
  const directory = await rememberedDirectory("import");
  const next = { ...options, ...(directory ? { defaultPath: directory } : {}) };
  const result = owner ? await nativeDialog.showOpenDialog(owner, next) : await nativeDialog.showOpenDialog(next);
  if (!result.canceled && result.filePaths[0]) {
    const chosen = result.filePaths[0];
    const isDirectory = options.properties?.includes("openDirectory") && (await fs.stat(chosen).catch(() => null))?.isDirectory();
    await rememberDirectory("import", isDirectory ? chosen : path.dirname(chosen));
  }
  return result;
}

function showSaveDialog(options: SaveDialogOptions): Promise<SaveDialogReturnValue>;
function showSaveDialog(owner: BrowserWindow, options: SaveDialogOptions): Promise<SaveDialogReturnValue>;
async function showSaveDialog(ownerOrOptions: BrowserWindow | SaveDialogOptions, maybeOptions?: SaveDialogOptions): Promise<SaveDialogReturnValue> {
  const owner = maybeOptions ? ownerOrOptions as BrowserWindow : undefined;
  const options = maybeOptions ?? ownerOrOptions as SaveDialogOptions;
  const directory = await rememberedDirectory("export");
  const next = { ...options, ...(directory ? { defaultPath: path.join(directory, path.basename(options.defaultPath ?? "")) } : {}) };
  reportExportProgress("请选择导出文件的保存位置…");
  const result = owner ? await nativeDialog.showSaveDialog(owner, next) : await nativeDialog.showSaveDialog(next);
  if (!result.canceled && result.filePath) await rememberDirectory("export", path.dirname(result.filePath));
  return result;
}

/** Shared main-process file dialogs. Renderer access remains behind existing IPC methods. */
export const dialog = {
  showOpenDialog,
  showSaveDialog,
  get showMessageBox() { return nativeDialog.showMessageBox; },
};
