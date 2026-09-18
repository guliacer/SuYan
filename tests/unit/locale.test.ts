import { describe, expect, it } from "vitest";
import { normalizeAppLanguage } from "../../src/types/locale";
import { translateUiText } from "../../src/components/LocaleProvider";

describe("locale", () => {
  it("defaults unknown or missing language values to Simplified Chinese", () => {
    expect(normalizeAppLanguage(undefined)).toBe("zh-CN");
    expect(normalizeAppLanguage("fr-FR")).toBe("zh-CN");
    expect(normalizeAppLanguage("en-US")).toBe("en-US");
  });

  it("translates built-in UI text and interpolates values", () => {
    expect(translateUiText("zh-CN", "系统设置")).toBe("系统设置");
    expect(translateUiText("en-US", "系统设置")).toBe("System Settings");
    expect(translateUiText("en-US", "剩余 {seconds} 秒 · 正在等待授权", { seconds: 12 })).toBe(
      "12s remaining · waiting for authorization",
    );
    expect(translateUiText("en-US", "已查询到 3 个模型。")).toBe("Found 3 models.");
    expect(translateUiText("en-US", "正在扫描：sample.png (2/5)")).toBe("Processing: sample.png (2/5)");
    expect(translateUiText("en-US", "灵感汇集ing")).toBe("Gathering inspiration");
  });

  it("translates detailed feature-guide copy without changing user content", () => {
    expect(translateUiText("en-US", "先了解窗口布局和素材浏览：可以调整或隐藏边栏、固定窗口位置，再查找、筛选和打开作品。切换到网格后，还可以按卡片的每个区域了解具体用法。")).toContain(
      "Start with the window layout",
    );
    expect(translateUiText("en-US", "点击提示词工具栏中的图片加号，可以从本地文件或剪贴板添加参考图；添加后可在提示词区域预览和管理。视频素材不提供此入口。")).toContain(
      "Click the image-plus button",
    );
  });

  it("leaves user-authored content untouched", () => {
    const prompt = "一只穿蓝色外套的猫，柔和自然光";
    expect(translateUiText("en-US", prompt)).toBe(prompt);
  });
});
