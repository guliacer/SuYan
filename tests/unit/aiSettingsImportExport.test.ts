import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dialogSource = readFileSync("src/features/library/components/AiSettingsDialog.tsx", "utf8");
const exportSource = readFileSync("src/features/library/components/AiSettingsExportDialog.tsx", "utf8");
const importSource = readFileSync("src/features/library/components/AiSettingsImportDialog.tsx", "utf8");
const storeSource = readFileSync("src/features/library/store/useLibraryStore.ts", "utf8");
const viewSource = readFileSync("src/features/library/components/LibraryView.tsx", "utf8");

describe("AI settings import/export dialogs and store wiring", () => {
  it("exposes export and import entry points inside the AI settings dialog", () => {
    expect(dialogSource).toContain("AiSettingsExportDialog");
    expect(dialogSource).toContain("AiSettingsImportDialog");
    expect(dialogSource).toContain("setIsExportOpen(true)");
    expect(dialogSource).toContain("setIsImportOpen(true)");
  });

  it("export dialog offers plain and encrypted backup types with password confirmation", () => {
    expect(exportSource).toContain('useState<"plain" | "full">("plain")');
    expect(exportSource).toContain("password !== passwordConfirm");
    expect(dialogSource).toContain("exportAiSettings");
    expect(exportSource).not.toContain("apiKey");
  });

  it("import dialog previews summary and requires confirmation for replace mode", () => {
    expect(importSource).toContain('useState<ImportMode>("merge")');
    expect(importSource).toContain("setConfirmingReplace(true)");
    expect(importSource).toContain("完全替换将清空现有 AI 配置");
    expect(dialogSource).toContain("importAiSettingsPreview");
    expect(dialogSource).toContain("importAiSettingsApply");
    // preview must never surface a plaintext key field
    expect(importSource).not.toContain("apiKey");
  });

  it("import apply updates the persisted store and surfaces a success message", () => {
    expect(storeSource).toContain("applyImportedAiSettings: (settings: PublicAiProviderSettings) => void");
    expect(storeSource).toContain("applyImportedAiSettings: (settings) =>");
    expect(storeSource).toContain("已导入 AI 设置备份。");
  });

  it("library view wires the imported settings callback into the dialog", () => {
    expect(viewSource).toContain("applyImportedAiSettings = useLibraryStore((state) => state.applyImportedAiSettings)");
    expect(viewSource).toContain("onApplyImportedSettings={applyImportedAiSettings}");
  });

  it("auto-save is paused around export/import and resumed in finally", () => {
    expect(dialogSource).toContain("api.autoSave.pause()");
    expect(dialogSource).toContain("api.autoSave.flush()");
    expect(dialogSource).toContain("api.autoSave.resume()");
  });
});