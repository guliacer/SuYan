import { describe, expect, it } from "vitest";
import { getUiErrorMessage } from "@/features/library/utils/uiMessages";

describe("uiMessages", () => {
  it("keeps dynamic remote AI failure details visible", () => {
    expect(getUiErrorMessage("AI_REMOTE_REQUEST_FAILED", "远程 AI 请求失败，状态码 401。原因：invalid api key")).toBe(
      "远程 AI 请求失败，状态码 401。原因：invalid api key",
    );
  });

  it("uses stable mapped messages for non-dynamic errors", () => {
    expect(getUiErrorMessage("AI_SETTINGS_INCOMPLETE", "raw message")).toBe("请先填写接口地址、模型和 API Key。");
  });
});
