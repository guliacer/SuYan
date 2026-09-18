import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const dialogSource = readFileSync(
  "src/features/library/components/shell/AppUpdateDialog.tsx",
  "utf8",
);
const styleSource = readFileSync("src/styles/tokens.css", "utf8");

describe("AppUpdateDialog upgrade progress", () => {
  it("keeps completed progress separate from the active handoff indicator", () => {
    expect(dialogSource).toContain('type UpgradeStage = "checked" | "opening" | "handed-off";');
    expect(dialogSource).toContain('setStage("opening")');
    expect(dialogSource).toContain('setStage("handed-off")');
    expect(dialogSource).toContain('className="upgrade-progress__complete"');
    expect(dialogSource).toContain('className="upgrade-progress__activity"');
    expect(styleSource).toContain("inset: 0 0 0 var(--upgrade-complete, 0%);");
    expect(styleSource).toContain(".upgrade-progress__activity::before");
  });

  it("returns to the confirmed state when the external page cannot open", () => {
    expect(dialogSource).toContain('setStage("checked");');
    expect(dialogSource).toContain('t("无法打开下载页面，请稍后重试。")');
    expect(dialogSource).toContain('t("下载页面已打开，后续安装由外部安装器完成。")');
  });

  it("uses the update-specific rotating tips with a variable interval", () => {
    expect(dialogSource).toContain('kind="update"');
    expect(dialogSource).toContain("intervalRangeMs={updateTipIntervalRange}");
  });
});
