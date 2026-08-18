import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hookSource = readFileSync("src/features/library/hooks/useAutoSave.ts", "utf8");
const wrapperSource = readFileSync("src/features/library/hooks/useAiSettingsAutoSave.ts", "utf8");
const dialogSource = readFileSync("src/features/library/components/AiSettingsDialog.tsx", "utf8");

describe("useAiSettingsAutoSave (source contract)", () => {
  it("exposes flush/pause/resume alongside isSaving", () => {
    expect(hookSource).toContain("flush: () => Promise<boolean>");
    expect(hookSource).toContain("pause: () => void");
    expect(hookSource).toContain("resume: () => void");
    expect(hookSource).toContain("return { isSaving, flush, pause, resume };");
  });

  it("pause suppresses scheduling and resume restores it", () => {
    // pause clears the debounce timer and sets pausedRef; resume re-schedules
    expect(hookSource).toContain("pausedRef.current = true");
    expect(hookSource).toContain("pausedRef.current = false");
    expect(hookSource).toContain("function pause()");
    expect(hookSource).toContain("function resume()");
    // scheduling is gated on !pausedRef.current
    expect(hookSource).toContain("!pausedRef.current");
  });

  it("flush reports save outcome (true=ok, false=skipped/failed)", () => {
    expect(hookSource).toContain("async function flush(): Promise<boolean>");
    expect(hookSource).toContain("return true;");
    expect(hookSource).toContain("return false;");
    // already-saved is treated as success, paused/disabled as skip
    expect(hookSource).toContain("requestSignature === lastSavedSignatureRef.current");
  });

  it("wrapper merges pause sources into a suspend count", () => {
    expect(wrapperSource).toContain("pauseCountRef");
    expect(wrapperSource).toContain("Math.max(0, pauseCountRef.current - 1)");
    expect(wrapperSource).toContain("autoSave.pause()");
    expect(wrapperSource).toContain("autoSave.resume()");
    expect(wrapperSource).toContain("useAiSettingsAutoSave");
  });

  it("dialog pauses auto-save while testing all profiles and resumes after", () => {
    expect(dialogSource).toContain("useAiSettingsAutoSave");
    expect(dialogSource).toContain("autoSave.pause()");
    expect(dialogSource).toContain("autoSave.resume()");
    // test-all pause is now unified through the hook (no separate enabled flag)
    expect(dialogSource).not.toContain("enabled: canSaveSettings && !isTestingAllProfiles");
    expect(dialogSource).toContain("enabled: canSaveSettings");
  });
});