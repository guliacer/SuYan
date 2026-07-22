import { describe, expect, it } from "vitest";
import {
  getGenerationModelOptions,
  hideGenerationModelOption,
  isGenericGenerationModelLabel,
  matchGenerationModelLabel,
  moveGenerationModelOption,
  resolveGenerationModelLabel,
} from "@/features/library/utils/generationModels";

describe("generationModels", () => {
  it("matches model aliases across spacing, punctuation and case", () => {
    expect(matchGenerationModelLabel("seedance-2.0 video prompt")).toBe("Seedance 2.0");
    expect(matchGenerationModelLabel("nanoBanana-Pro on Gemini")).toBe("Nano Banana Pro");
    expect(matchGenerationModelLabel("Generated with GPT-Image-2")).toBe("GPT Image 2");
    expect(matchGenerationModelLabel("Runway gen-4.5 camera move")).toBe("Runway Gen-4.5");
    expect(matchGenerationModelLabel("flux-2-pro portrait")).toBe("FLUX.2 Pro");
    expect(matchGenerationModelLabel("Midjourney Niji V7 anime")).toBe("Midjourney Niji V7");
    expect(matchGenerationModelLabel("veo3 cinematic video")).toBe("Google Veo 3");
  });

  it("puts common drawing models before less-used video models by default", () => {
    const options = getGenerationModelOptions();

    expect(options.slice(0, 3)).toEqual(["GPT Image 2", "Nano Banana 2", "Nano Banana Pro"]);
    expect(options.indexOf("Midjourney V7")).toBeLessThan(options.indexOf("Seedance 2.0"));
    expect(options.indexOf("FLUX.2 Pro")).toBeLessThan(options.indexOf("Seedance 2.0"));
  });

  it("applies user model order and hidden model preferences", () => {
    const options = getGenerationModelOptions({
      generationModelOrder: ["Seedream 5.0", "GPT Image 2"],
      hiddenGenerationModels: ["Nano Banana 2"],
    });

    expect(options.slice(0, 2)).toEqual(["Seedream 5.0", "GPT Image 2"]);
    expect(options).not.toContain("Nano Banana 2");
  });

  it("moves and hides generation model options without duplicating labels", () => {
    expect(moveGenerationModelOption(["GPT Image 2", "Nano Banana Pro"], "Nano Banana Pro", "GPT Image 2").slice(0, 2)).toEqual([
      "Nano Banana Pro",
      "GPT Image 2",
    ]);
    expect(hideGenerationModelOption(["SDXL 1.0", "sdxl 1.0"], "SDXL 1.0")).toEqual(["SDXL 1.0"]);
  });

  it("chooses the earliest model mention and the most specific version", () => {
    expect(matchGenerationModelLabel("Nano Banana Pro on Gemini and GPT Image 2")).toBe("Nano Banana Pro");
    expect(matchGenerationModelLabel("google veo3 cinematic video")).toBe("Google Veo 3");
  });

  it("treats source names as generic model labels", () => {
    expect(isGenericGenerationModelLabel("WebToMind")).toBe(true);
    expect(isGenericGenerationModelLabel("Prompt Fill")).toBe(true);
    expect(isGenericGenerationModelLabel("Seedance 2.0")).toBe(false);
  });

  it("falls back from generic source labels to category model matches", () => {
    expect(
      resolveGenerationModelLabel({
        category: "Seedance 2.0",
        generationMethod: "WebToMind",
        sourceUrl: "https://webtomind.com/zh-CN/prompts/seedance-2-demo",
        tags: ["网页分享", "视频提示词"],
        title: "镜头运动",
        prompt: "一段动态视频提示词",
      }),
    ).toBe("Seedance 2.0");
  });
});
