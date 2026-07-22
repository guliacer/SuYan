import { describe, expect, it } from "vitest";
import {
  isPendingStatusFeedbackText,
  resolveStatusFeedbackTone,
} from "@/features/library/utils/statusFeedback";

describe("statusFeedback", () => {
  it("marks running operation text as pending info feedback", () => {
    expect(isPendingStatusFeedbackText("正在测试代理连接...")).toBe(true);
    expect(isPendingStatusFeedbackText("检测中，请稍候")).toBe(true);
    expect(isPendingStatusFeedbackText("查询中")).toBe(true);
    expect(isPendingStatusFeedbackText("正在导入素材...")).toBe(true);
    expect(isPendingStatusFeedbackText("正在整理剪贴板素材...")).toBe(true);
    expect(resolveStatusFeedbackTone("正在查询模型列表...")).toBe("info");
    expect(resolveStatusFeedbackTone("正在上传词库图像...")).toBe("info");
  });

  it("keeps final feedback finite by treating it as success or error", () => {
    expect(isPendingStatusFeedbackText("连接成功。")).toBe(false);
    expect(resolveStatusFeedbackTone("连接成功。")).toBe("success");
    expect(resolveStatusFeedbackTone("连接失败。")).toBe("error");
  });
});
