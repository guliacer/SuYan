import { describe, expect, it } from "vitest";
import {
  createPromptImportDuplicateKey,
  extractAiartPromptId,
  extractAipromptfillShareCode,
  extractGptImage2GalleryInfo,
  extractJimengWorkInfo,
  extractKnownPromptSiteInfo,
  extractPngTextChunks,
  extractWebToMindPromptInfo,
  extractXmiaomPromptInfo,
  extractXStatusInfo,
  getImportableRemoteMediaUrls,
  isSourceOnlyPrompt,
  mergePromptImportDrafts,
  parseAiartPromptPayload,
  parseAipromptfillSharePayload,
  parseFxTwitterTweetPayload,
  parseGptImage2GalleryMarkdown,
  parseJimengItemInfoPayload,
  parseJimengWorkHtml,
  parseKnownPromptSiteHtml,
  parsePromptDraftFromHtml,
  parsePromptDraftFromImageMetadata,
  parsePromptShareUrl,
  parsePromptText,
  parseWebToMindPromptCaseApiPayload,
  parseWebToMindPromptHtml,
  parseXmiaomPromptHtml,
  parseXStatusSyndicationPayload,
} from "../../electron/shared/promptImportParser";

describe("promptImportParser", () => {
  it("parses labeled prompt text", () => {
    const draft = parsePromptText(
      [
        "标题：角色设定助手",
        "提示词：请根据角色名称生成完整角色配置。",
        "反向提示词：不要堆砌形容词。",
        "标签：角色, 提示词工程",
      ].join("\n"),
    );

    expect(draft.title).toBe("角色设定助手");
    expect(draft.prompt).toBe("请根据角色名称生成完整角色配置。");
    expect(draft.negativePrompt).toBe("不要堆砌形容词。");
    expect(draft.tags).toEqual(["角色", "提示词工程"]);
  });

  it("removes Stable Diffusion parameter lines from prompt fields", () => {
    const draft = parsePromptText(
      [
        "cinematic portrait, soft light, detailed face",
        "Negative prompt: low quality, blurry",
        "Steps: 30, Sampler: Euler, CFG scale: 7, Seed: 123",
      ].join("\n"),
    );

    expect(draft.prompt).toBe("cinematic portrait, soft light, detailed face");
    expect(draft.negativePrompt).toBe("low quality, blurry");
    expect(draft.prompt).not.toContain("Steps");
  });

  it("turns supported share urls into editable source drafts", () => {
    const draft = parsePromptShareUrl(
      "https://aiart.pics/?category=%E5%BD%B1%E8%A7%86&prompt=019bb065-1453-7289-91e6-06b86264c749",
    );

    expect(draft?.title).toBe("AIArt 分享提示词");
    expect(draft?.tags).toEqual(["网页分享", "影视"]);
    expect(draft?.prompt).toContain("来源链接：https://aiart.pics/");
  });

  it("recognizes Prompt Fill hash share urls", () => {
    const url = "https://aipromptfill.com/#/share?share=PGTVZB";
    const draft = parsePromptShareUrl(url);

    expect(extractAipromptfillShareCode(url)).toBe("PGTVZB");
    expect(draft?.title).toBe("Prompt Fill 分享模板");
    expect(draft?.sourceUrl).toBe(url);
  });

  it("turns Prompt Fill share payloads into imported prompt drafts", () => {
    const draft = parseAipromptfillSharePayload(
      {
        n: { cn: "镜子自拍·Q版迷你自己", en: "Mirror Selfie" },
        c: {
          cn: "一位年轻女性在极简现代的家中拍镜子自拍，{{casual_mirror_outfit}}。{{selfie_render_blend}}。",
          en: "A young woman takes a mirror selfie, {{casual_mirror_outfit}}.",
        },
        t: ["人物", "摄影", "卡通"],
        a: "@Sairah_0",
        i: "https://img.wjwj.top/2026/05/07/b84c26a465935281af35511c690f69ba.png",
        ty: "image",
        s: {
          casual_mirror_outfit: {
            cn: "穿着全套黑色的休闲装，斜挎着一个包，头上戴着太阳镜",
            en: "wearing an all-black relaxed casual outfit",
          },
          selfie_render_blend: {
            cn: "柔和的自然光线，舒适的氛围美学，高细节",
            en: "soft natural light, highly detailed",
          },
        },
      },
      "https://aipromptfill.com/#/share?share=PGTVZB",
    );

    expect(draft?.title).toBe("镜子自拍·Q版迷你自己");
    expect(draft?.prompt).toBe(
      "一位年轻女性在极简现代的家中拍镜子自拍，穿着全套黑色的休闲装，斜挎着一个包，头上戴着太阳镜。柔和的自然光线，舒适的氛围美学，高细节。",
    );
    expect(draft?.tags).toEqual(["网页分享", "Prompt Fill", "人物", "摄影", "卡通", "图像提示词"]);
    expect(draft?.generationMethod).toBe("Prompt Fill");
    expect(draft?.authorName).toBe("@Sairah_0");
    expect(draft?.sourceImageUrl).toBe("https://img.wjwj.top/2026/05/07/b84c26a465935281af35511c690f69ba.png");
  });

  it("imports Prompt Fill shares even when image field is missing", () => {
    const draft = parseAipromptfillSharePayload(
      {
        n: { cn: "无图分享模板", en: "Text Only Share" },
        c: {
          cn: "请生成一张电影感人像，主体为{{subject}}。",
          en: "Create a cinematic portrait of {{subject}}.",
        },
        t: ["人像"],
        a: "@tester",
        s: {
          subject: {
            cn: "年轻女性",
            en: "a young woman",
          },
        },
        ty: "image",
      },
      "https://aipromptfill.com/#/share?share=SGZDAB",
    );

    expect(extractAipromptfillShareCode("https://aipromptfill.com/#/share?share=SGZDAB")).toBe("SGZDAB");
    expect(draft?.title).toBe("无图分享模板");
    expect(draft?.prompt).toContain("主体为年轻女性");
    expect(draft?.sourceImageUrls).toEqual([]);
  });

  it("imports Prompt Fill video shares from vu field even when image is empty", () => {
    const videoUrl = "https://img.wjwj.top/2026/02/08/85820eabd0f51ef1d215e5012cb2c8ff.mov";
    const draft = parseAipromptfillSharePayload(
      {
        n: { cn: "赛博朋克飞行器追逐", en: "Cyberpunk Vehicle Chase" },
        c: {
          cn: "### 赛博朋克飞行器追逐视频\n\n**电影风格**：{{sci_fi_movie_style}}，高对比度霓虹光影。",
          en: "### Cyberpunk Vehicle Chase Video\n\n**Movie Style**: {{sci_fi_movie_style}}.",
        },
        t: ["科幻", "动作", "影视", "游戏"],
        a: "John @johnAGI168",
        i: "",
        ty: "video",
        vu: videoUrl,
        s: {
          sci_fi_movie_style: {
            cn: "赛博朋克美学（Cyberpunk Aesthetics）",
            en: "Cyberpunk Aesthetics",
          },
        },
      },
      "https://aipromptfill.com/#/share?share=SGZDAB",
    );

    expect(draft?.title).toBe("赛博朋克飞行器追逐");
    expect(draft?.prompt).toContain("赛博朋克美学（Cyberpunk Aesthetics）");
    expect(draft?.tags).toContain("视频提示词");
    expect(draft?.sourceImageUrl).toBe(videoUrl);
    expect(draft?.sourceImageUrls).toEqual([videoUrl]);
    expect(getImportableRemoteMediaUrls(draft?.sourceImageUrls ?? [])).toEqual([videoUrl]);
  });

  it("expands Prompt Fill product poster shares instead of falling back to site metadata", () => {
    const draft = parseAipromptfillSharePayload(
      {
        n: { cn: "极简几何装置风海报", en: "Minimalist Geometric Product Poster" },
        c: {
          cn: "请为{{subject_product}}创作一张“极简几何装置风产品海报”。\n\n海报整体风格要求：高键白色摄影棚背景，干净、通透、柔和、明亮。",
          en: "Please create a poster for {{subject_product}}.",
        },
        t: ["产品", "创意", "摄影"],
        a: "@MrLarus",
        i: "https://s3.bmp.ovh/2026/04/24/xWHKmpbh.png",
        s: {
          subject_product: {
            cn: "草莓苏打水",
            en: "Strawberry Soda",
          },
        },
        ty: "image",
      },
      "https://aipromptfill.com/#/share?share=K2C27R",
    );

    expect(draft?.title).toBe("极简几何装置风海报");
    expect(draft?.prompt).toContain("请为草莓苏打水创作一张");
    expect(draft?.prompt).not.toContain("提示词填空器（Prompt Fill）是一个强大的");
    expect(draft?.tags).toEqual(["网页分享", "Prompt Fill", "产品", "创意", "摄影", "图像提示词"]);
    expect(draft?.authorName).toBe("@MrLarus");
    expect(draft?.sourceImageUrls).toEqual(["https://s3.bmp.ovh/2026/04/24/xWHKmpbh.png"]);
  });

  it("recognizes AIART.PICS path-style prompt urls", () => {
    const url = "https://aiart.pics/prompts/019ca2ee-6d03-78af-b70d-8ba3382f4559";

    expect(extractAiartPromptId(url)).toBe("019ca2ee-6d03-78af-b70d-8ba3382f4559");
  });

  it("turns AIART.PICS prompt payloads into imported prompt drafts with image urls", () => {
    const url = "https://aiart.pics/?prompt=019ca7cd-9a72-708c-a432-f3226d52d581";
    const draft = parseAiartPromptPayload(
      {
        success: true,
        data: {
          id: "019ca7cd-9a72-708c-a432-f3226d52d581",
          title: {
            en: "Nano Banana Pro on Gemini and GPT Image 1.5",
            zh: "Nano Banana Pro在Gemini和GPT图像1.5上的拍摄",
          },
          prompts: [
            "Nano Banana Pro on Gemini and GPT Image 1.5",
            "Prompt:",
            "{\n  \"master_prompt\": {\n    \"scene_type\": \"high-speed commercial luxury shake photography\"\n  }\n}",
          ],
          model: "nanoBanana-Pro",
          tags: ["高清分辨率", "VELORIA BLEND饮料", "奢华商业摄影"],
          images: [
            {
              path: "images/prompts/20260301/nano-banana-pro-on-gemini-and-gpt-image-1-5-img-1.jpg",
              sPath: "images/prompts/20260301/nano-banana-pro-on-gemini-and-gpt-image-1-5-img-1.jpg",
            },
            {
              path: "images/prompts/20260301/nano-banana-pro-on-gemini-and-gpt-image-1-5-img-2.jpg",
            },
          ],
          author: {
            name: "Meem",
            username: "mehvishs25",
            url: "https://x.com/mehvishs25",
            avatar: "https://pbs.twimg.com/profile_images/meem.jpg",
          },
        },
      },
      url,
    );

    expect(extractAiartPromptId(url)).toBe("019ca7cd-9a72-708c-a432-f3226d52d581");
    expect(draft?.title).toBe("Nano Banana Pro在Gemini和GPT图像1.5上的拍摄");
    expect(draft?.prompt).toContain("high-speed commercial luxury shake photography");
    expect(draft?.tags).toEqual([
      "网页分享",
      "AIART.PICS",
      "图像提示词",
      "高清分辨率",
      "VELORIA BLEND饮料",
      "奢华商业摄影",
    ]);
    expect(draft?.generationMethod).toBe("Nano Banana Pro");
    expect(draft?.authorName).toBe("Meem");
    expect(draft?.authorUrl).toBe("https://x.com/mehvishs25");
    expect(draft?.authorAvatarUrl).toBe("https://pbs.twimg.com/profile_images/meem.jpg");
    expect(draft?.sourceImageUrls).toEqual([
      "https://img1.aiart.pics/images/prompts/20260301/nano-banana-pro-on-gemini-and-gpt-image-1-5-img-1.jpg",
      "https://img1.aiart.pics/images/prompts/20260301/nano-banana-pro-on-gemini-and-gpt-image-1-5-img-2.jpg",
    ]);
  });

  it("accepts AIART.PICS single image object payloads", () => {
    const url = "https://aiart.pics/prompts/019ca2ee-6d03-78af-b70d-8ba3382f4559";
    const draft = parseAiartPromptPayload(
      {
        success: true,
        data: {
          id: "019ca2ee-6d03-78af-b70d-8ba3382f4559",
          title: {
            en: "Ancient Martial Arts Style Test",
            zh: "古风武侠砖石井壁仰拍风格测试",
          },
          prompts: [
            "风格 32：古风武侠砖石井壁仰拍风格\n完整创作指南\n【风格概述】\n风格名称：古风武侠砖石井壁仰拍风格",
          ],
          model: "nanoBanana-Pro",
          tags: ["Ancient Martial Arts", "Diamond Wall"],
          mediaType: "image",
          images: {
            path: "images/prompts/20260228/ancient-martial-arts-style-diamond-wall-inclined-shot-test-img-1.jpg",
            sPath: "images/prompts/20260228/ancient-martial-arts-style-diamond-wall-inclined-shot-test-img-1.jpg",
          },
          videos: [],
          author: {
            name: "John",
            username: "john87445528",
            url: "https://x.com/john87445528",
          },
        },
      },
      url,
    );

    expect(draft?.title).toBe("古风武侠砖石井壁仰拍风格测试");
    expect(draft?.prompt).toContain("古风武侠砖石井壁仰拍风格");
    expect(draft?.generationMethod).toBe("Nano Banana Pro");
    expect(draft?.sourceImageUrls).toEqual([
      "https://img1.aiart.pics/images/prompts/20260228/ancient-martial-arts-style-diamond-wall-inclined-shot-test-img-1.jpg",
    ]);
  });

  it("turns AIART.PICS video prompt payloads into imported prompt drafts with cover images", () => {
    const url = "https://aiart.pics/prompts/019ca7ce-957e-7f61-b090-443a188e1341";
    const draft = parseAiartPromptPayload(
      {
        success: true,
        data: {
          id: "019ca7ce-957e-7f61-b090-443a188e1341",
          title: {
            en: "Image Tagging Analysis",
            zh: "图像标签分析",
          },
          prompts: [
            "Nano Banana Pro Prompts.\nAll prompts after this post.",
            "#nanobananapro #promptshare #aiart",
            "Prompt 01:\nUltra-realistic portrait in cinematic natural light.",
            'Prompt 02:\n"Fine art photography portrait with editorial styling."',
          ],
          model: "nanoBanana-Pro",
          tags: ["Portrait", "Supermodel", "Photography"],
          mediaType: "video",
          images: [],
          videos: [
            {
              url: "images/prompts/20260301/image-tagging-analysis-video-1.mp4",
              cover: "images/prompts/20260301/image-tagging-analysis-video-1-cover.jpg",
            },
          ],
          author: {
            name: "Tischeins",
            username: "tisch_eins",
            url: "https://x.com/tisch_eins",
            avatar: "https://pbs.twimg.com/profile_images/1720788190997401600/H762ekpE_normal.jpg",
          },
          platform: "x",
          originUrl: "https://x.com/tisch_eins/status/2027670386092003334",
        },
      },
      url,
    );

    expect(extractAiartPromptId(url)).toBe("019ca7ce-957e-7f61-b090-443a188e1341");
    expect(draft?.title).toBe("图像标签分析");
    expect(draft?.prompt).toContain("Prompt 01");
    expect(draft?.prompt).toContain("Fine art photography");
    expect(draft?.tags).toEqual(["网页分享", "AIART.PICS", "视频提示词", "Portrait", "Supermodel", "Photography"]);
    expect(draft?.generationMethod).toBe("Nano Banana Pro");
    expect(draft?.authorName).toBe("Tischeins");
    expect(draft?.authorUrl).toBe("https://x.com/tisch_eins");
    expect(draft?.authorAvatarUrl).toBe(
      "https://pbs.twimg.com/profile_images/1720788190997401600/H762ekpE_normal.jpg",
    );
    expect(draft?.sourceImageUrl).toBe(
      "https://img1.aiart.pics/images/prompts/20260301/image-tagging-analysis-video-1.mp4",
    );
    expect(draft?.sourceImageUrls).toEqual([
      "https://img1.aiart.pics/images/prompts/20260301/image-tagging-analysis-video-1.mp4",
      "https://img1.aiart.pics/images/prompts/20260301/image-tagging-analysis-video-1-cover.jpg",
    ]);
    expect(getImportableRemoteMediaUrls(draft?.sourceImageUrls ?? [])).toEqual([
      "https://img1.aiart.pics/images/prompts/20260301/image-tagging-analysis-video-1.mp4",
    ]);
  });

  it("prefers AIART.PICS video urls over cover images when importing media", () => {
    const url = "https://aiart.pics/prompts/019c97e3-b7fb-7f97-9ca5-0fdc14328e6a";
    const draft = parseAiartPromptPayload(
      {
        success: true,
        data: {
          id: "019c97e3-b7fb-7f97-9ca5-0fdc14328e6a",
          title: {
            en: "Winter Golden Hour Wingsuit Flying",
            zh: "冬季金晖翼装飞行",
          },
          prompts: ["#GrokVideo\nWingsuit flying cinematic prompt for text to video generation."],
          model: "nanoBanana-Pro",
          tags: ["Wingsuit", "Winter"],
          mediaType: "video",
          images: [],
          videos: [
            {
              url: "images/prompts/20260226/winter-golden-hour-wingsuit-flying-video-1.mp4",
              cover: "images/prompts/20260226/winter-golden-hour-wingsuit-flying-video-1-cover.jpg",
            },
          ],
        },
      },
      url,
    );

    expect(draft?.tags).toContain("视频提示词");
    expect(draft?.sourceImageUrls).toEqual([
      "https://img1.aiart.pics/images/prompts/20260226/winter-golden-hour-wingsuit-flying-video-1.mp4",
      "https://img1.aiart.pics/images/prompts/20260226/winter-golden-hour-wingsuit-flying-video-1-cover.jpg",
    ]);
    expect(getImportableRemoteMediaUrls(draft?.sourceImageUrls ?? [])).toEqual([
      "https://img1.aiart.pics/images/prompts/20260226/winter-golden-hour-wingsuit-flying-video-1.mp4",
    ]);
  });

  it("imports AIART.PICS image media when payload also includes incidental videos", () => {
    const url = "https://aiart.pics/prompts/019c6152-b000-7ffe-88f0-ef432cbb5ded";
    const draft = parseAiartPromptPayload(
      {
        success: true,
        data: {
          id: "019c6152-b000-7ffe-88f0-ef432cbb5ded",
          title: {
            en: "Portrait Still Image",
            zh: "人像静帧图片",
          },
          prompts: ["A cinematic portrait still image with soft light and detailed face."],
          model: "nanoBanana-Pro",
          tags: ["Portrait", "Still"],
          mediaType: "image",
          images: [
            {
              path: "images/prompts/20260220/portrait-still-image-img-1.jpg",
              sPath: "images/prompts/20260220/portrait-still-image-img-1.jpg",
            },
          ],
          videos: [
            {
              url: "images/prompts/20260220/portrait-still-image-related-video-1.mp4",
              cover: "images/prompts/20260220/portrait-still-image-related-video-1-cover.jpg",
            },
          ],
        },
      },
      url,
    );

    expect(draft?.tags).toEqual(["网页分享", "AIART.PICS", "图像提示词", "Portrait", "Still"]);
    expect(draft?.sourceImageUrls).toEqual([
      "https://img1.aiart.pics/images/prompts/20260220/portrait-still-image-img-1.jpg",
      "https://img1.aiart.pics/images/prompts/20260220/portrait-still-image-related-video-1-cover.jpg",
    ]);
    expect(getImportableRemoteMediaUrls(draft?.sourceImageUrls ?? [])).toEqual([
      "https://img1.aiart.pics/images/prompts/20260220/portrait-still-image-img-1.jpg",
      "https://img1.aiart.pics/images/prompts/20260220/portrait-still-image-related-video-1-cover.jpg",
    ]);
  });

  it("recognizes GPT-Image-2 gallery GitHub markdown links", () => {
    const info = extractGptImage2GalleryInfo(
      "[gallery-part-1.md](https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-1.md)",
    );

    expect(info).toEqual({
      sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-1.md",
      rawUrl: "https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/docs/gallery-part-1.md",
      owner: "freestylefly",
      repo: "awesome-gpt-image-2",
      ref: "main",
      path: "docs/gallery-part-1.md",
    });

    expect(
      extractGptImage2GalleryInfo(
        "https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/docs/gallery-part-2.md",
      )?.sourceUrl,
    ).toBe("https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-2.md");
  });

  it("turns GPT-Image-2 gallery markdown cases into imported prompt drafts", () => {
    const info = extractGptImage2GalleryInfo(
      "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-1.md",
    );
    const drafts = parseGptImage2GalleryMarkdown(
      [
        '<a name="case-1"></a>',
        "",
        "### 例 1：信息图可视化设计",
        "",
        "![城市生命系统图谱 / Urban Metabolism Atlas](../data/images/case1.jpg)",
        "",
        "**来源：** 小红书号insight\\_express",
        "",
        "**提示词：**",
        "",
        "```text",
        'Vertical 9:16 isometric cutaway infographic "城市生命系统图谱 / Urban Metabolism Atlas".',
        "```",
        "",
        "***",
        "",
        '<a name="case-17"></a>',
        "",
        "### 例 17：界面交互设计图",
        "",
        "![type](../data/images/case17.jpg)",
        "",
        "**来源：** [@wory37303852](https://x.com/wory37303852)",
        "",
        "**提示词：**",
        "",
        "```text",
        '{ "type": "exploded view product diagram poster", "subject": "VR headset" }',
        "```",
      ].join("\n"),
      info!,
    );

    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({
      title: "例 1：信息图可视化设计",
      tags: ["网页分享", "GPT-Image-2", "图像提示词", "信息图可视化设计"],
      generationMethod: "GPT-Image-2",
      sourceUrl: "https://github.com/freestylefly/awesome-gpt-image-2/blob/main/docs/gallery-part-1.md#case-1",
      sourceImageUrl: "https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/images/case1.jpg",
      authorName: "小红书号insight_express",
      authorUrl: null,
      authorAvatarUrl: null,
    });
    expect(drafts[0]?.prompt).toContain("Urban Metabolism Atlas");
    expect(drafts[0]?.sourceImageUrls).toEqual([
      "https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/images/case1.jpg",
    ]);
    expect(drafts[1]).toMatchObject({
      title: "例 17：界面交互设计图",
      authorName: "@wory37303852",
      authorUrl: "https://x.com/wory37303852",
      sourceImageUrl: "https://raw.githubusercontent.com/freestylefly/awesome-gpt-image-2/main/data/images/case17.jpg",
    });
  });

  it("normalizes prompt duplicate keys for gallery imports", () => {
    expect(createPromptImportDuplicateKey("  Line One\r\n\r\nLine Two  ")).toBe(
      createPromptImportDuplicateKey("line one\nline two"),
    );
  });

  it("keeps only video urls when importing mixed video and cover media", () => {
    expect(
      getImportableRemoteMediaUrls([
        "https://v3-artist.vlabvod.com/hi720/?a=1",
        "https://p11-dreamina-sign.byteimg.com/cover.jpeg?x-expires=1",
        "https://p11-dreamina-sign.byteimg.com/c1080.webp?x-expires=1",
      ]),
    ).toEqual(["https://v3-artist.vlabvod.com/hi720/?a=1"]);
  });

  it("collapses WebToMind multi-bitrate video mirrors into a single primary video", () => {
    const primaryVideo =
      "https://908797aa0935118d554c27884448dbad.r2.cloudflarestorage.com/webtomind-media-prod/prompt-case-imports/x/2077973868317127103/60bb996d-6f1f-4280-8cde-33928545554c.mp4?X-Amz-Signature=abc";
    const twitter720 = "https://video.twimg.com/amplify_video/2077973716764401665/vid/avc1/1280x720/3Qiu-n8KwaE5ynJp.mp4?tag=29";
    const twitter360 = "https://video.twimg.com/amplify_video/2077973716764401665/vid/avc1/640x360/2tSE8Ge8Ey3BCmyR.mp4?tag=29";
    const twitter270 = "https://video.twimg.com/amplify_video/2077973716764401665/vid/avc1/480x270/6SpXXZS9tYPDGvnh.mp4?tag=29";
    const cover = "https://pbs.twimg.com/amplify_video_thumb/2077973716764401665/img/rQUZEoLaj9bTFxlm.jpg";

    expect(getImportableRemoteMediaUrls([primaryVideo, twitter720, twitter360, twitter270, cover])).toEqual([
      primaryVideo,
    ]);

    const draft = parseWebToMindPromptCaseApiPayload(
      JSON.stringify({
        cases: [
          {
            mediaType: "video",
            videoUrl: primaryVideo,
            videoUrls: [primaryVideo, twitter720, twitter360, twitter270],
            imageUrl: cover,
            imageUrls: [cover],
            title: "风格：照片级写实的水上竞技真人秀",
            prompt: "风格：照片级写实的水上竞技真人秀，UGC现场拍摄感，阳光明亮，节奏快速。",
            tags: ["video", "commercial"],
            model: "seedance",
          },
        ],
      }),
      "https://webtomind.com/zh-CN/prompts/commercial-prompt-case-0a85ee11",
    );

    expect(draft?.sourceImageUrls).toEqual([primaryVideo, cover]);
    expect(getImportableRemoteMediaUrls(draft?.sourceImageUrls ?? [])).toEqual([primaryVideo]);
  });

  it("keeps the highest twitter amplify bitrate when primary host is missing", () => {
    const twitter720 = "https://video.twimg.com/amplify_video/2077973716764401665/vid/avc1/1280x720/3Qiu-n8KwaE5ynJp.mp4?tag=29";
    const twitter360 = "https://video.twimg.com/amplify_video/2077973716764401665/vid/avc1/640x360/2tSE8Ge8Ey3BCmyR.mp4?tag=29";
    const twitter270 = "https://video.twimg.com/amplify_video/2077973716764401665/vid/avc1/480x270/6SpXXZS9tYPDGvnh.mp4?tag=29";

    expect(getImportableRemoteMediaUrls([twitter270, twitter360, twitter720])).toEqual([twitter720]);
  });

  it("keeps image-only imports and deduplicates derived byteimg variants", () => {
    const lowResUrl =
      "https://p26-dreamina-sign.byteimg.com/tos-cn-i-tb4s082cfz/35390890c6414d78900832ebacf39797~tplv-tb4s082cfz-aigc_resize:640:640.jpeg?x-expires=1&x-signature=low";
    const highResUrl =
      "https://p11-dreamina-sign.byteimg.com/tos-cn-i-tb4s082cfz/35390890c6414d78900832ebacf39797~tplv-tb4s082cfz-aigc_resize:1080:1080.jpeg?x-expires=1&x-signature=high";

    expect(getImportableRemoteMediaUrls([lowResUrl, highResUrl])).toEqual([highResUrl]);
  });

  it("recognizes and parses WebToMind prompt pages with effect images", () => {
    const url =
      "https://webtomind.com/zh-CN/prompts?card=20260607-clean-cta-mask&caseId=721b6252-6885-4777-a314-4d254f287598";
    const canonicalUrl = "https://webtomind.com/zh-CN/prompts/gpt-image-2-character-721b625268";
    const imageUrls = [
      "https://slixamjkvpoijrnbwzxi.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/case/202606/image-1.png",
      "https://slixamjkvpoijrnbwzxi.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/case/202606/image-2.png",
    ];
    const html = [
      "<html><head>",
      "<title>夏日海滨约会 | WebToMind Prompts</title>",
      `<link rel="canonical" href="${canonicalUrl}" />`,
      `<meta property="og:image" content="${imageUrls[0]}" />`,
      '<script id="webtomind-seo-jsonld" type="application/ld+json">',
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        name: "夏日海滨约会",
        description: "夏日海滨约会 · 指定角色：{凝光《原神》} 整体基调：阳光明媚的夏日假期…",
        url: canonicalUrl,
        inLanguage: "zh-CN",
        keywords:
          "GPT Image 2, character design, character consistency, concept art, cosplay prompt, realistic photo, AI image prompt",
        image: imageUrls.map((imageUrl) => ({ "@type": "ImageObject", url: imageUrl })),
      }),
      "</script>",
      "</head><body>",
      '<pre class="prompt-detail-ssr-prompt">指定角色：{凝光《原神》}\n整体基调：阳光明媚的夏日假期。\nNegative prompt: 低质量，Q版，卡通感。</pre>',
      "</body></html>",
    ].join("");

    const draft = parseWebToMindPromptHtml(html, url);

    expect(extractWebToMindPromptInfo(url)).toEqual({ sourceUrl: url });
    expect(draft).toMatchObject({
      title: "夏日海滨约会",
      generationMethod: "GPT Image 2",
      sourceUrl: canonicalUrl,
      sourceImageUrl: imageUrls[0],
      sourceImageUrls: imageUrls,
      authorName: "WebToMind",
      authorUrl: "https://webtomind.com/",
      authorAvatarUrl: "https://webtomind.com/icons/logo-icon.svg",
    });
    expect(draft?.prompt).toContain("指定角色：{凝光《原神》}");
    expect(draft?.prompt).toContain("Negative prompt");
    expect(draft?.tags).toEqual([
      "网页分享",
      "WebToMind",
      "图像提示词",
      "GPT Image 2",
      "character design",
      "character consistency",
      "concept art",
      "cosplay prompt",
      "realistic photo",
      "AI image prompt",
    ]);
  });

  it("parses WebToMind locked prompt-case API payloads with fresh signed covers", () => {
    const sourceUrl = "https://webtomind.com/zh-CN/prompts/xiaohongshu-cover-a951f7df";
    const freshImageUrl =
      "https://slixamjkvpoijrnbwzxi.supabase.co/storage/v1/object/sign/user-generated-images/demo/preview.webp?token=eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3ODUwNTEzNTR9.sig";
    const draft = parseWebToMindPromptCaseApiPayload(
      JSON.stringify({
        cases: [
          {
            id: "84241840-a507-4ba0-818b-94967a84bb5e",
            imageUrl: freshImageUrl,
            imageUrls: [freshImageUrl],
            mediaType: "image",
            titleZh: "小红书封面视觉导演 · 爆款标题封面 健身减脂打卡笔记封面",
            title: "小红书封面视觉导演 · 爆款标题封面 健身减脂打卡笔记封面",
            slug: "xiaohongshu-cover-a951f7df",
            category: "xiaohongshu",
            tags: ["xiaohongshu-cover", "social-cover", "gpt-image-2"],
            model: "gpt-image-2",
            prompt: "",
            promptLocked: true,
            promptPreviewZh:
              "小红书封面视觉导演：围绕「健身减脂打卡笔记封面」生成一张可直接作为小红书首图的商业封面。",
            commercialIntent: "商业场景：健身减脂打卡笔记封面",
          },
        ],
      }),
      sourceUrl,
    );

    expect(draft?.title).toContain("小红书封面");
    expect(draft?.prompt).toContain("健身减脂打卡笔记封面");
    expect(draft?.generationMethod).toBe("GPT Image 2");
    expect(draft?.sourceImageUrls).toEqual([freshImageUrl]);
    expect(getImportableRemoteMediaUrls(draft?.sourceImageUrls ?? [])).toEqual([freshImageUrl]);
  });

  it("prefers fresher signed media urls when merging WebToMind drafts", () => {
    const path =
      "https://slixamjkvpoijrnbwzxi.supabase.co/storage/v1/object/sign/user-generated-images/demo/preview.webp";
    const staleUrl = `${path}?token=eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3ODEyNzI4MjR9.old`;
    const freshUrl = `${path}?token=eyJhbGciOiJIUzI1NiJ9.eyJleHAiOjE3ODUwNTEzNTR9.fresh`;
    const merged = mergePromptImportDrafts(
      {
        title: "案例",
        prompt: "这是一段足够长的预览提示词内容，用于导入测试。",
        sourceImageUrl: staleUrl,
        sourceImageUrls: [staleUrl],
      },
      {
        sourceImageUrl: freshUrl,
        sourceImageUrls: [freshUrl],
      },
    );

    expect(merged.sourceImageUrl).toBe(freshUrl);
    expect(merged.sourceImageUrls).toEqual([freshUrl]);
  });

  it("recognizes Seedance 2.0 from WebToMind video prompt metadata", () => {
    const url = "https://webtomind.com/zh-CN/prompts/seedance-2-motion-case";
    const posterUrl =
      "https://slixamjkvpoijrnbwzxi.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/2026/06/25/seedance-2-motion-case.png";
    const videoUrl =
      "https://slixamjkvpoijrnbwzxi.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/2026/06/25/seedance-2-motion-case.mp4";
    const html = [
      "<html><head>",
      "<title>流光街景运动镜头 | WebToMind Prompts</title>",
      '<script id="webtomind-seo-jsonld" type="application/ld+json">',
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "CreativeWork",
        name: "流光街景运动镜头",
        description: "Seedance 2.0 视频模型，赛博朋克街景中人物转身，霓虹灯反射在雨水路面。",
        keywords: "Seedance 2.0, video prompt, camera movement",
        image: [{ "@type": "ImageObject", url: posterUrl }],
      }),
      "</script>",
      "</head><body>",
      '<pre class="prompt-detail-ssr-prompt">Seedance 2.0 video prompt. A cinematic dolly shot through neon rain.</pre>',
      "</body></html>",
    ].join("");

    const draft = parseWebToMindPromptHtml(html, url);

    expect(draft?.generationMethod).toBe("Seedance 2.0");
    expect(draft?.tags).toContain("视频提示词");
    expect(draft?.tags).toContain("Seedance 2.0");
    expect(draft?.sourceImageUrls).toEqual([videoUrl, posterUrl]);
  });

  it("parses WebToMind prompt case API video media before poster images", () => {
    const url = "https://webtomind.com/zh-CN/prompts/seedance-2-0-mecha-maid-sky-fall";
    const posterUrl =
      "https://slixamjkvpoijrnbwzxi.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/2026/06/25/seedance-2-0-more/mecha-maid-sky-fall.png";
    const videoUrl =
      "https://slixamjkvpoijrnbwzxi.supabase.co/storage/v1/object/public/generated-images/prompt-case-covers/2026/06/25/seedance-2-0-more/mecha-maid-sky-fall.mp4";
    const payload = JSON.stringify({
      cases: [
        {
          title: "高空坠落机甲女仆变身",
          prompt: "Seedance 2.0 video prompt. A mecha maid falls through clouds with cinematic camera motion.",
          tags: ["Seedance 2.0", "AI视频提示词", "视频提示词", "fashion"],
          model: "seedance-2-0",
          mediaType: "video",
          imageUrl: posterUrl,
          imageUrls: [posterUrl],
          videoUrl,
          videoUrls: [videoUrl],
          url,
        },
      ],
    });

    const draft = parseWebToMindPromptCaseApiPayload(payload, url);

    expect(draft?.title).toBe("高空坠落机甲女仆变身");
    expect(draft?.generationMethod).toBe("Seedance 2.0");
    expect(draft?.tags).toContain("视频提示词");
    expect(draft?.sourceImageUrl).toBe(videoUrl);
    expect(draft?.sourceImageUrls).toEqual([videoUrl, posterUrl]);
  });

  it("recognizes and parses 哗啦哗啦 prompt pages with author and image metadata", () => {
    const imageId = "cmrd2xqyw006jy2j0ikn8np28";
    const uuid = "143727a7-6562-4c00-af14-2d2b4a8d9734";
    const authorId = "cmra6iuc7000xmpio53jq0nt5";
    const url = `https://img.xmiaom.com/p/${imageId}`;
    const prompt = "超写实室内生活场景摄影，画面主体为一位年轻亚洲女孩，光线柔和，细节真实。";
    const flight = [
      `["$","$L15",null,${JSON.stringify({
        imageId,
        uuid,
        prompt,
        promptPublic: true,
        model: "gpt-image-2-4k",
        tags: ["室内"],
        nickname: "用户-179a00cb",
        authorUsername: "linuxdo_369791",
        authorId,
        href: `/api/img/${uuid}`,
      })}]`,
      '["$","$L13","写实-0",{"href":"/?tag=%E5%86%99%E5%AE%9E","children":"写实"}]',
    ].join("\n");
    const html = [
      "<html><head>",
      `<link rel="preload" as="image" href="/api/img/${uuid}" />`,
      `<link rel="preload" as="image" href="/api/avatar/${authorId}" />`,
      "</head><body>",
      `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`,
      "</body></html>",
    ].join("");

    const draft = parseXmiaomPromptHtml(html, url);

    expect(extractXmiaomPromptInfo(`请导入 ${url}?from=share`)).toEqual({ sourceUrl: url, imageId });
    expect(draft).toMatchObject({
      prompt,
      generationMethod: "GPT Image 2",
      sourceUrl: url,
      sourceImageUrl: `https://img.xmiaom.com/api/img/${uuid}`,
      sourceImageUrls: [`https://img.xmiaom.com/api/img/${uuid}`],
      authorName: "用户-179a00cb",
      authorUrl: "https://img.xmiaom.com/u/linuxdo_369791",
      authorAvatarUrl: `https://img.xmiaom.com/api/avatar/${authorId}`,
    });
    expect(draft?.tags).toEqual(["网页分享", "哗啦哗啦", "图像提示词", "GPT Image 2", "室内", "写实"]);
  });

  it("imports only the primary 哗啦哗啦 image instead of related feed thumbnails", () => {
    const imageId = "cmrem3utz008ps4v4ju592dsk";
    const primaryUuid = "c1c413f8-a56e-4b35-afc3-14f9e59e9bab";
    const relatedUuid = "88f0af1e-bf5f-4803-9b4b-bb7acd699464";
    const authorId = "cmracv4c4008nohkrq7l50h4f";
    const url = `https://img.xmiaom.com/p/${imageId}`;
    const prompt = "Full-body portrait, 35mm focal length, natural daylight photography, authentic street fashion.";
    const flight = [
      `1b:T${prompt.length.toString(16)},\n${prompt}\n`,
      `16:["$","$L1a",null,${JSON.stringify({
        layout: "sidebar",
        imageId,
        prompt: "$1b",
        promptPublic: true,
        model: "gpt-image-2",
        nickname: "YaoEIF",
        authorUsername: "linuxdo_426623",
        authorId,
        href: `/api/img/${primaryUuid}`,
      })}]`,
      // 推荐流缩略图不应进入 sourceImageUrls
      `["$","img",null,{"src":"/api/img/${relatedUuid}"}]`,
    ].join("\n");
    const html = [
      "<html><head>",
      `<link rel="preload" as="image" href="/api/img/${primaryUuid}" />`,
      `<link rel="preload" as="image" href="/api/img/${relatedUuid}" />`,
      `<meta property="og:image" content="https://img.xmiaom.com/api/img/${primaryUuid}" />`,
      "</head><body>",
      `<img src="/api/img/${relatedUuid}" />`,
      `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`,
      "</body></html>",
    ].join("");

    const draft = parseXmiaomPromptHtml(html, url);

    expect(draft?.sourceImageUrls).toEqual([`https://img.xmiaom.com/api/img/${primaryUuid}`]);
    expect(draft?.sourceImageUrl).toBe(`https://img.xmiaom.com/api/img/${primaryUuid}`);
    expect(draft?.prompt).toContain("Full-body portrait");
  });

  it("parses PromptMart video pages from Nuxt payload with full prompt and single video", () => {
    const sourceUrl = "https://www.promptmart.cn/prompt/74067784";
    const siteInfo = extractKnownPromptSiteInfo(sourceUrl);
    const videoPath = "/uploads/media/20260716/1784228164010-316659815.mp4";
    const coverPath = "/uploads/covers/20260716/1784228161146-664004577.jpg";
    const promptHtml =
      "<p>两位女性角色严格保持参考图中的外貌、妆容、发色与服装细节一致。</p><p>夜晚工业区雨夜巷口，霓虹色灯光、湿漉地面、蒸汽升腾。电影级低机位构图。</p><p>角色设定：AA@图1，BB@图2。</p>";
    const nuxtData = [
      ["ShallowReactive", 1],
      { data: 2 },
      ["ShallowReactive", 3],
      { "prompt-74067784": 4 },
      { prompt: 5, content: 12, related: 13, offlined: 14, notFound: 14 },
      {
        id: 6,
        urlId: 7,
        title: 8,
        img: 9,
        coverImg: 10,
        isVideo: 11,
        tags: 15,
        authorName: 16,
        categoryLabels: 17,
        promptText: 12,
      },
      739,
      74067784,
      "镜头前冲与拖拽女主成双 AI提示词",
      videoPath,
      coverPath,
      true,
      promptHtml,
      [],
      false,
      [18, 19],
      "Mila",
      [20],
      "#雨夜",
      "#双女主",
      "现代",
    ];
    const html = [
      "<html><head>",
      "<title>镜头前冲与拖拽女主成双AI视频提示词_谱码 PromptMart</title>",
      '<meta name="description" content="谱码PromptMart为您提供专业的《镜头前冲与拖拽女主成双》AI视频提示词营销简介。" />',
      `<meta property="og:image" content="${coverPath}" />`,
      `<script type="application/json" id="__NUXT_DATA__">${JSON.stringify(nuxtData)}</script>`,
      "</head><body>",
      `<video aria-label="demo" src="${videoPath}" poster="${coverPath}" autoplay loop muted></video>`,
      '<img src="/_nuxt/wechatcode.hcUDK0_F.png" />',
      "</body></html>",
    ].join("");

    const draft = parseKnownPromptSiteHtml(html, siteInfo!);

    expect(siteInfo?.siteName).toBe("谱码 PromptMart");
    expect(draft?.title).toContain("镜头前冲");
    expect(draft?.prompt).toContain("两位女性角色严格保持参考图");
    expect(draft?.prompt).toContain("AA@图1");
    expect(draft?.prompt).not.toContain("谱码PromptMart为您提供专业的");
    expect(draft?.sourceImageUrls).toEqual([`https://www.promptmart.cn${videoPath}`]);
    expect(draft?.sourceImageUrl).toBe(`https://www.promptmart.cn${videoPath}`);
    expect(draft?.tags).toContain("视频提示词");
    expect(draft?.authorName).toBe("Mila");
    expect(getImportableRemoteMediaUrls(draft?.sourceImageUrls ?? [])).toEqual([
      `https://www.promptmart.cn${videoPath}`,
    ]);
  });

  it("resolves 哗啦哗啦 RSC flight prompt references like $17", () => {
    const imageId = "cmrq2p4kk002tgdug47trwwb1";
    const uuid = "82d2e69a-5beb-4d17-95ee-b4e05a91b338";
    const authorId = "cmr9ziu16000ucb6rql2hnepu";
    const url = `https://img.xmiaom.com/p/${imageId}`;
    const prompt =
      'Create a soft, photorealistic lifestyle portrait in a bright minimalist living room during morning sunlight. A young woman with long, wavy {argument name="hair color" default="rose pink"} hair sits sideways on a cream sofa, turned slightly toward the camera with a fluffy, gentle smile implied. She wears exactly 2 visible clothing pieces: an oversized fuzzy white knit cardigan slipping off one shoulder, and a pale mint-green camisole or slip dress. The composition is vertical 3:4, waist-up to seated full torso, with her hair flowing over her shoulders and catching warm backlight.';
    const flight = [
      `17:T${prompt.length.toString(10)},\n${prompt}\n`,
      `18:null\n`,
      `["$","$L16",null,${JSON.stringify({
        layout: "sidebar",
        imageId,
        prompt: "$17",
        promptPublic: true,
        model: "gpt-image-2",
        nickname: "那边的蓝怪物",
        authorUsername: "wechat_ojkVk2T82jEVGMbRrsgk6Pd4hcdU",
        authorId,
        href: `/api/img/${uuid}`,
      })}]`,
      '["$","$L13","写实-0",{"href":"/?tag=%E5%86%99%E5%AE%9E","children":"写实"}]',
    ].join("\n");
    const html = [
      "<html><head>",
      `<link rel="preload" as="image" href="/api/img/${uuid}" />`,
      "</head><body>",
      `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`,
      "</body></html>",
    ].join("");

    const draft = parseXmiaomPromptHtml(html, url);

    expect(draft?.prompt).toBe(prompt);
    expect(draft?.generationMethod).toBe("GPT Image 2");
    expect(draft?.sourceImageUrls).toEqual([`https://img.xmiaom.com/api/img/${uuid}`]);
    expect(draft?.authorName).toBe("那边的蓝怪物");
    expect(draft?.authorUrl).toBe("https://img.xmiaom.com/u/wechat_ojkVk2T82jEVGMbRrsgk6Pd4hcdU");
    expect(draft?.authorAvatarUrl).toBe(`https://img.xmiaom.com/api/avatar/${authorId}`);
    expect(draft?.tags).toContain("哗啦哗啦");
  });

  it("resolves 哗啦哗啦 hex flight refs like $1b with hex T-length", () => {
    const imageId = "cmrem3utz008ps4v4ju592dsk";
    const uuid = "c1c413f8-a56e-4b35-afc3-14f9e59e9bab";
    const authorId = "cmracv4c4008nohkrq7l50h4f";
    const url = `https://img.xmiaom.com/p/${imageId}`;
    const prompt = [
      "Full-body portrait, 35mm focal length, natural daylight photography, authentic street fashion documentation style with cinematic color grading.",
      "",
      "Subject & Identity",
      "Young woman in elaborate Sweet Lolita fashion, vertical 3:4 composition.",
      "Sharp focus on subject with gentle background bokeh.",
    ].join("\n");
    // 真实页面：1b:Tdac, 且引用为 "$1b"
    const claimedHex = prompt.length.toString(16);
    const flight = [
      `1b:T${claimedHex},\n${prompt}\n`,
      `16:["$","$L1a",null,${JSON.stringify({
        layout: "sidebar",
        imageId,
        prompt: "$1b",
        promptPublic: true,
        model: "gpt-image-2",
        nickname: "YaoEIF",
        authorUsername: "linuxdo_426623",
        authorId,
        href: `/api/img/${uuid}`,
      })}]`,
      '17:["$","div",null,{"className":"mt-6","children":[["$","$L14","洛丽塔-0",{"href":"/?tag=%E6%B4%9B%E4%B8%BD%E5%A1%94","children":"洛丽塔"}]]}]',
    ].join("\n");
    const html = [
      "<html><head>",
      `<link rel="preload" as="image" href="/api/img/${uuid}" />`,
      `<meta property="og:image" content="https://img.xmiaom.com/api/img/${uuid}" />`,
      "</head><body>",
      `<script>self.__next_f.push([1,${JSON.stringify(flight)}])</script>`,
      "</body></html>",
    ].join("");

    const draft = parseXmiaomPromptHtml(html, url);

    expect(draft?.prompt).toContain("Full-body portrait, 35mm focal length");
    expect(draft?.prompt).toContain("Subject & Identity");
    expect(draft?.prompt).toContain("Sweet Lolita fashion");
    expect(draft?.generationMethod).toBe("GPT Image 2");
    expect(draft?.sourceImageUrls).toEqual([`https://img.xmiaom.com/api/img/${uuid}`]);
    expect(draft?.authorName).toBe("YaoEIF");
    expect(draft?.authorUrl).toBe("https://img.xmiaom.com/u/linuxdo_426623");
    expect(draft?.authorAvatarUrl).toBe(`https://img.xmiaom.com/api/avatar/${authorId}`);
  });

  it("recognizes recommended prompt sites and imports prompt metadata from page json", () => {
    const sourceUrl = "https://tusi.cn/work/model-case-1001?from=share";
    const html = [
      "<html><head>",
      "<title>东方幻想人物海报 - 吐司</title>",
      '<link rel="canonical" href="https://tusi.cn/work/model-case-1001" />',
      '<meta property="og:image" content="https://cdn.tusi.cn/works/fallback-cover.jpg" />',
      '<script id="__NEXT_DATA__" type="application/json">',
      JSON.stringify({
        props: {
          pageProps: {
            work: {
              title: "东方幻想人物海报",
              prompt: "一位身着青绿色汉服的女性角色站在竹林中，电影感光影，细节丰富。",
              negativePrompt: "低清晰度，错误手指，画面变形",
              model: "Stable Diffusion XL",
              tags: ["国风", "人物", "海报"],
              images: [
                {
                  url: "https://cdn.tusi.cn/works/effect-1.webp",
                },
              ],
              author: {
                name: "青山创作者",
                url: "https://tusi.cn/user/qingshan",
                avatar: "https://cdn.tusi.cn/avatar/qingshan.png",
              },
            },
          },
        },
      }),
      "</script>",
      "</head><body></body></html>",
    ].join("");
    const siteInfo = extractKnownPromptSiteInfo(`请导入 ${sourceUrl}`)!;
    const draft = parseKnownPromptSiteHtml(html, siteInfo);

    expect(siteInfo.siteName).toBe("吐司 Tusi");
    expect(draft).toMatchObject({
      title: "东方幻想人物海报",
      prompt: "一位身着青绿色汉服的女性角色站在竹林中，电影感光影，细节丰富。",
      negativePrompt: "低清晰度，错误手指，画面变形",
      generationMethod: "Stable Diffusion XL",
      sourceUrl: "https://tusi.cn/work/model-case-1001",
      sourceImageUrl: "https://cdn.tusi.cn/works/effect-1.webp",
      sourceImageUrls: [
        "https://cdn.tusi.cn/works/effect-1.webp",
        "https://cdn.tusi.cn/works/fallback-cover.jpg",
      ],
      authorName: "青山创作者",
      authorUrl: "https://tusi.cn/user/qingshan",
      authorAvatarUrl: "https://cdn.tusi.cn/avatar/qingshan.png",
    });
    expect(draft?.tags).toEqual([
      "网页分享",
      "吐司 Tusi",
      "中文社区",
      "模型广场",
      "AI 绘画",
      "国风",
      "人物",
      "海报",
    ]);
  });

  it("uses site defaults when recommended pages only expose partial author metadata", () => {
    const sourceUrl = "https://www.promptmart.cn/prompt/sku-233";
    const html = [
      "<html><head>",
      "<title>商业产品摄影提示词 | 谱码</title>",
      '<meta property="og:image" content="/assets/product-poster.png" />',
      '<script type="application/json">',
      JSON.stringify({
        promptDetail: {
          name: "商业产品摄影提示词",
          content: "高级商业摄影棚中的透明香水瓶，冷暖对比灯光，玻璃折射，真实产品广告质感。",
          imageUrl: "/assets/product-poster.png",
        },
      }),
      "</script>",
      "</head><body></body></html>",
    ].join("");
    const siteInfo = extractKnownPromptSiteInfo(sourceUrl)!;
    const draft = parseKnownPromptSiteHtml(html, siteInfo);

    expect(draft).toMatchObject({
      title: "商业产品摄影提示词",
      authorName: "谱码 PromptMart",
      authorUrl: "https://www.promptmart.cn",
      authorAvatarUrl: "https://www.promptmart.cn/favicon.ico",
      sourceUrl,
      sourceImageUrl: "https://www.promptmart.cn/assets/product-poster.png",
      sourceImageUrls: ["https://www.promptmart.cn/assets/product-poster.png"],
    });
    expect(draft?.prompt).toContain("透明香水瓶");
    expect(draft?.tags).toContain("提示词市场");
  });

  it("filters LibLib watermarked images and keeps the clean variant", () => {
    const sourceUrl = "https://www.liblib.art/imageinfo/8c8013cdd9f54f7898a65d26541213b2";
    const watermarkUrl =
      "https://images-wm.liblib.cloud/community-img/genius_playground/image/8f9454a371f744a689b6a3186242415b/6b18df5b53d5452b3d0e1f704c72e431d3accad8e7a5212eaa1b1386c05048d8.png";
    const cleanUrl =
      "https://liblibai-online.liblib.cloud/community-img/genius_playground/image/8f9454a371f744a689b6a3186242415b/0222706c457d0053423dff947d9f9a3599e8d3255111a7029ac1cebcb7584400.png";
    const html = [
      "<html><head>",
      "<title>添加一个场景展示图 - LibLibAI</title>",
      `<link rel="canonical" href="${sourceUrl}" />`,
      `<meta property="og:image" content="${watermarkUrl}" />`,
      '<script type="application/json">',
      JSON.stringify({
        promptDetail: {
          title: "添加一个场景展示图",
          content: "一位年轻女性站在卧室里，晨光洒进房间，柔和自然。",
          imageUrl: watermarkUrl,
          images: [{ url: watermarkUrl }, { url: cleanUrl }],
          author: {
            name: "LibLib 创作者",
            url: "https://www.liblib.art/user/demo",
          },
        },
      }),
      "</script>",
      "</head><body></body></html>",
    ].join("");

    const draft = parseKnownPromptSiteHtml(html, extractKnownPromptSiteInfo(sourceUrl)!);

    expect(draft).toMatchObject({
      title: "添加一个场景展示图",
      sourceUrl,
      sourceImageUrl: cleanUrl,
      sourceImageUrls: [cleanUrl],
      authorName: "LibLib 创作者",
      authorUrl: "https://www.liblib.art/user/demo",
    });
    expect(draft?.tags).toContain("LibLibAI");
  });

  it("deduplicates Jimeng byteimg variants from known site pages", () => {
    const sourceUrl = "https://jimeng.jianying.com/s/VhvlPLpZm-I/";
    const lowResUrl =
      "https://p26-dreamina-sign.byteimg.com/tos-cn-i-tb4s082cfz/35390890c6414d78900832ebacf39797~tplv-tb4s082cfz-aigc_resize:640:640.jpeg?x-expires=1&x-signature=low";
    const highResUrl =
      "https://p11-dreamina-sign.byteimg.com/tos-cn-i-tb4s082cfz/35390890c6414d78900832ebacf39797~tplv-tb4s082cfz-aigc_resize:1080:1080.jpeg?x-expires=1&x-signature=high";
    const html = [
      "<html><head>",
      "<title>机械姬 - 即梦AI</title>",
      `<meta property="og:image" content="${lowResUrl}" />`,
      `<link rel="preload" as="image" href="${highResUrl}" />`,
      '<script type="application/json">',
      JSON.stringify({
        item: {
          title: "机械姬",
          prompt: "机械姬，超现实主义，真人质感人像摄影，短发清冷机械姬，高清4K。",
          imageUrl: lowResUrl,
        },
      }),
      "</script>",
      "</head><body></body></html>",
    ].join("");
    const draft = parseKnownPromptSiteHtml(html, extractKnownPromptSiteInfo(sourceUrl)!);

    expect(draft?.sourceImageUrl).toBe(highResUrl);
    expect(draft?.sourceImageUrls).toEqual([highResUrl]);
  });

  it("recognizes Jimeng short share links before generic known-site parsing", () => {
    expect(extractJimengWorkInfo("https://jimeng.jianying.com/s/B7Nji6Lv5gU/")).toEqual({
      sourceUrl: "https://jimeng.jianying.com/s/B7Nji6Lv5gU/",
      workId: "B7Nji6Lv5gU",
    });
  });

  it("filters Jimeng static scripts out of importable media candidates", () => {
    const sourceUrl = "https://jimeng.jianying.com/s/B7Nji6Lv5gU/";
    const scriptUrl = "https://lf3-lv-buz.vlabstatic.com/obj/image-lvweb-buz/common/scripts/bdms-1.0.1.20.js";
    const imageUrl =
      "https://p26-dreamina-sign.byteimg.com/tos-cn-i-tb4s082cfz/ac61e34a65434801bef2f7b328451396~tplv-tb4s082cfz-aigc_resize:640:640.jpeg?x-expires=1787184000&x-signature=ok";
    const html = [
      "<html><head>",
      "<title>Dreamina - 即梦AI</title>",
      `<link rel="preload" href="${imageUrl}" as="image" />`,
      '<script type="application/json">',
      JSON.stringify({
        item: {
          title: "Dreamina",
          prompt: "一张明亮的电影感人像摄影作品，柔和自然光，细节清晰，真实质感。",
          imageUrl: scriptUrl,
        },
      }),
      "</script>",
      "</head><body></body></html>",
    ].join("");

    const draft = parseKnownPromptSiteHtml(html, extractKnownPromptSiteInfo(sourceUrl)!);

    expect(getImportableRemoteMediaUrls([scriptUrl, imageUrl])).toEqual([imageUrl]);
    expect(draft?.sourceImageUrl).toBe(imageUrl);
    expect(draft?.sourceImageUrls).toEqual([imageUrl]);
  });

  it("parses Jimeng work-detail HTML with nested text2image prompt and author metadata", () => {
    const sourceUrl = "https://jimeng.jianying.com/s/B7Nji6Lv5gU/";
    const imageUrl =
      "https://p26-dreamina-sign.byteimg.com/tos-cn-i-tb4s082cfz/ac61e34a65434801bef2f7b328451396~tplv-tb4s082cfz-aigc_resize:640:640.jpeg?x-expires=1&x-signature=ok";
    const avatarUrl =
      "https://p6-faceu-img-sign.byteimg.com/tos-cn-i-tb4s082cfz/15dd2b61f0c34aa6876a560650f5d127~tplv-resize:200:200.jpeg?x-expires=1&x-signature=avatar";
    const prompt =
      "莫奈风格，梵高作品，伦勃朗画作，金箔岩彩画，完美融入摄影技法+油画技法+3D技法，绿白色氛围感高级艺术海报。";
    const routerData = {
      loaderData: {
        "ai-tool/work-detail/(id$)": {
          workDetail: {
            ok: true,
            value: {
              id: "7653073476323986738",
              effectType: 9,
              commonAttr: {
                id: "7653073476323986738",
                title: "",
                description: "",
                coverUrl: imageUrl,
                coverUrlMap: {
                  "360": imageUrl.replace("640:640", "360:360"),
                  "640": imageUrl,
                },
              },
              author: {
                name: "噜噜可-v-孤德",
                avatarUrl,
              },
              aigcImageParams: {
                generateType: 1,
                text2videoParams: null,
                text2imageParams: {
                  prompt,
                  userNegativePrompt: "",
                  modelInfo: {
                    modelName: "图片 4.7",
                    rawModelSource: "Seedream 4.3 Design",
                  },
                },
              },
            },
          },
        },
      },
    };
    const html = [
      "<html><head><title>即梦AI - 一站式AI创作平台</title></head><body>",
      `window._ROUTER_DATA = ${JSON.stringify(routerData)};`,
      "</body></html>",
    ].join("");

    const draft = parseJimengWorkHtml(html, sourceUrl);
    const knownSiteDraft = parseKnownPromptSiteHtml(html, extractKnownPromptSiteInfo(sourceUrl)!);

    expect(draft).not.toBeNull();
    expect(draft?.prompt).toContain("莫奈风格");
    expect(draft?.authorName).toBe("噜噜可-v-孤德");
    expect(draft?.authorAvatarUrl).toBe(avatarUrl);
    expect(draft?.sourceImageUrls?.[0]).toContain("byteimg.com");
    expect(draft?.generationMethod).toBe("图片 4.7");
    expect(knownSiteDraft?.prompt).toContain("莫奈风格");
    expect(knownSiteDraft?.authorName).toBe("噜噜可-v-孤德");
  });

  it("rejects known-site drafts that only contain source-link placeholder prompts", () => {
    const sourceUrl = "https://tusi.cn/demo/placeholder-only";
    const html = [
      "<html><head>",
      "<title>吐司示例页</title>",
      `<meta name="description" content="这是页面营销描述，不是提示词正文。" />`,
      '<meta property="og:image" content="https://tusi.cn/demo/cover.jpg" />',
      "</head><body></body></html>",
    ].join("");

    expect(isSourceOnlyPrompt(`来源链接：${sourceUrl}`)).toBe(true);
    expect(parseKnownPromptSiteHtml(html, extractKnownPromptSiteInfo(sourceUrl)!)).toBeNull();
  });

  it("imports MotionSites links with effect image and source metadata", () => {
    const sourceUrl = "https://motionsites.ai/site/landing-motion-demo";
    const html = [
      "<html><head>",
      "<title>Motion landing page animation</title>",
      '<meta name="author" content="Motion Curator" />',
      '<meta property="profile:image" content="https://motionsites.ai/u/curator-avatar.jpg" />',
      '<meta property="og:image" content="https://motionsites.ai/cases/landing-motion-cover.jpg" />',
      '<script type="application/json">',
      JSON.stringify({
        item: {
          title: "Motion landing page animation",
          prompt:
            "A premium SaaS landing page with smooth scroll-triggered product reveal animations, refined typography, and cinematic UI transitions.",
          tags: ["SaaS", "Motion", "Landing Page"],
          coverUrl: "https://motionsites.ai/cases/landing-motion-cover.jpg",
        },
      }),
      "</script>",
      "</head><body></body></html>",
    ].join("");
    const draft = parseKnownPromptSiteHtml(html, extractKnownPromptSiteInfo(sourceUrl)!);

    expect(draft).toMatchObject({
      title: "Motion landing page animation",
      sourceUrl,
      sourceImageUrl: "https://motionsites.ai/cases/landing-motion-cover.jpg",
      authorName: "Motion Curator",
      authorUrl: "https://motionsites.ai",
      authorAvatarUrl: "https://motionsites.ai/u/curator-avatar.jpg",
    });
    expect(draft?.tags).toEqual([
      "网页分享",
      "MotionSites",
      "网页灵感",
      "动效参考",
      "交互设计",
      "SaaS",
      "Motion",
      "Landing Page",
    ]);
  });

  it("turns X status payloads into prompt drafts with author and effect images", () => {
    const url = "https://x.com/mehvishs25/status/2027928833253642365";
    const draft = parseFxTwitterTweetPayload(
      {
        code: 200,
        tweet: {
          url,
          id: "2027928833253642365",
          text: [
            "Nano Banana Pro on Gemini and GPT Image 1.5",
            "",
            "Prompt:",
            "",
            "{",
            '  "master_prompt": {',
            '    "scene_type": "high-speed commercial luxury shake photography"',
            "  }",
            "}",
          ].join("\n"),
          author: {
            screen_name: "mehvishs25",
            url: "https://x.com/mehvishs25",
            name: "Meem",
            avatar_url: "https://pbs.twimg.com/profile_images/2012472188067278848/cp_m4VoD_200x200.jpg",
          },
          media: {
            photos: [
              { url: "https://pbs.twimg.com/media/HCSmg0obMAAqr8N.jpg?name=orig" },
              { url: "https://pbs.twimg.com/media/HCSmg4BbQAA3-T4.jpg?name=orig" },
            ],
          },
        },
      },
      url,
    );

    expect(extractXStatusInfo(url)).toEqual({
      sourceUrl: url,
      statusId: "2027928833253642365",
      username: "mehvishs25",
    });
    expect(draft?.title).toBe("Nano Banana Pro on Gemini and GPT Image 1…");
    expect(draft?.prompt).toContain("high-speed commercial luxury shake photography");
    expect(draft?.tags).toEqual(["网页分享", "X", "图像提示词"]);
    expect(draft?.generationMethod).toBe("Nano Banana Pro");
    expect(draft?.authorName).toBe("Meem");
    expect(draft?.authorUrl).toBe("https://x.com/mehvishs25");
    expect(draft?.authorAvatarUrl).toBe(
      "https://pbs.twimg.com/profile_images/2012472188067278848/cp_m4VoD_200x200.jpg",
    );
    expect(draft?.sourceImageUrls).toEqual([
      "https://pbs.twimg.com/media/HCSmg0obMAAqr8N.jpg?name=orig",
      "https://pbs.twimg.com/media/HCSmg4BbQAA3-T4.jpg?name=orig",
    ]);
  });

  it("uses X syndication payloads as a fallback for status imports", () => {
    const url = "https://x.com/mehvishs25/status/2027928833253642365";
    const draft = parseXStatusSyndicationPayload(
      {
        text: "Nano Banana Pro prompt\n\nhttps://t.co/e1PM5rSofw",
        user: {
          name: "Meem",
          screen_name: "mehvishs25",
          profile_image_url_https: "https://pbs.twimg.com/profile_images/2012472188067278848/cp_m4VoD_normal.jpg",
        },
        photos: [
          {
            url: "https://pbs.twimg.com/media/HCSmg0obMAAqr8N.jpg",
          },
        ],
      },
      url,
    );

    expect(draft?.prompt).toBe("Nano Banana Pro prompt");
    expect(draft?.generationMethod).toBe("Nano Banana Pro");
    expect(draft?.authorUrl).toBe("https://x.com/mehvishs25");
    expect(draft?.sourceImageUrls).toEqual(["https://pbs.twimg.com/media/HCSmg0obMAAqr8N.jpg?name=orig"]);
    expect(draft?.tags).toContain("图像提示词");
  });

  it("imports X video tweets as a single highest-bitrate mp4 instead of poster image", () => {
    const url = "https://x.com/0xkyne/status/2077624322844426305";
    const poster = "https://pbs.twimg.com/amplify_video_thumb/2077623354224427009/img/Lbrmd-oHHIG016OK.jpg";
    const videoLow = "https://video.twimg.com/amplify_video/2077623354224427009/vid/avc1/320x588/_kU74dgHBiz31j_u.mp4?tag=25";
    const videoHigh =
      "https://video.twimg.com/amplify_video/2077623354224427009/vid/avc1/400x736/XZ01EKg0b4w9sCPC.mp4?tag=25";

    const fxDraft = parseFxTwitterTweetPayload(
      {
        text: "再熬一天就周末了兄弟们！看点好的吧！",
        mediaURLs: [videoHigh],
        media_extended: [
          {
            type: "video",
            url: videoHigh,
            thumbnail_url: poster,
          },
        ],
      },
      url,
    );

    expect(fxDraft?.sourceImageUrls).toEqual([videoHigh]);
    expect(fxDraft?.tags).toContain("视频提示词");
    expect(getImportableRemoteMediaUrls(fxDraft?.sourceImageUrls ?? [])).toEqual([videoHigh]);

    const syndicationDraft = parseXStatusSyndicationPayload(
      {
        text: "再熬一天就周末了兄弟们！看点好的吧！",
        photos: [],
        mediaDetails: [
          {
            type: "video",
            media_url_https: poster,
            video_info: {
              variants: [
                {
                  content_type: "application/x-mpegURL",
                  url: "https://video.twimg.com/amplify_video/2077623354224427009/pl/K4YRUXGYwhVmRurB.m3u8?tag=25",
                },
                { content_type: "video/mp4", bitrate: 800000, url: videoLow },
                { content_type: "video/mp4", bitrate: 5184000, url: videoHigh },
              ],
            },
          },
        ],
        video: {
          poster,
          variants: [
            {
              type: "application/x-mpegURL",
              src: "https://video.twimg.com/amplify_video/2077623354224427009/pl/K4YRUXGYwhVmRurB.m3u8?tag=25",
            },
            { type: "video/mp4", src: videoLow },
            { type: "video/mp4", src: videoHigh },
          ],
        },
      },
      url,
    );

    expect(syndicationDraft?.sourceImageUrls).toEqual([videoHigh]);
    expect(syndicationDraft?.sourceImageUrl).toBe(videoHigh);
    expect(syndicationDraft?.tags).toContain("视频提示词");
    expect(getImportableRemoteMediaUrls(syndicationDraft?.sourceImageUrls ?? [])).toEqual([videoHigh]);
  });

  it("uses long X note text, all effect images, and normalized author metadata", () => {
    const url = "https://x.com/iamsofiaijaz/status/2032920000000000000";
    const prompt = [
      "GPT Image 2 on ChatGPT",
      "",
      "Prompt:",
      "Use the reference image as the primary facial reference. Preserve the exact facial identity, facial structure, facial proportions, eye shape, nose shape, lip shape, jawline, cheekbones, skin tone, natural asymmetry, hairstyle details, and overall appearance with maximum accuracy.",
      "A cinematic luxury fashion portrait of the same woman from the reference image, standing beneath elegant beige sandstone arches in a sophisticated European-inspired urban setting during golden hour.",
      "She wears an oversized off-white sweatshirt styled off one shoulder, featuring three black stripes running down the sleeves, paired with relaxed black tailored trousers.",
      "High-end fashion magazine photography, luxury street-style aesthetic, cinematic composition, shallow depth of field, ultra-photorealistic, HDR, rich tonal range, soft warm color grading, 85mm lens, f/1.8, razor-sharp focus on the eyes.",
    ].join("\n");
    const draft = parseXStatusSyndicationPayload(
      {
        text: "GPT Image 2 on ChatGPT\n\nPrompt:\nUse the reference image as the primary facial reference. Preserve the exact facial identity, facial structure, facial proportions, eye shape, nose shape, lip shape, jawline, cheekbones, skin tone, natural asymmetry, hairstyle details, and overall https://t.co/demo",
        note_tweet: {
          note_tweet_results: {
            result: {
              text: prompt,
            },
          },
        },
        user: {
          name: "Aijaz",
          screen_name: "iamsofiaijaz",
          profile_image_url_https: "https://pbs.twimg.com/profile_images/1967066723779309573/aDWbkVgi_normal.jpg",
        },
        mediaDetails: [
          {
            media_url_https: "https://pbs.twimg.com/media/HJzFashion01.jpg",
            url: "https://t.co/demo",
          },
          {
            media_url_https: "https://pbs.twimg.com/media/HJzFashion02.jpg",
            url: "https://t.co/demo",
          },
        ],
      },
      url,
    );

    expect(draft?.prompt).toContain("overall appearance with maximum accuracy");
    expect(draft?.prompt).toContain("razor-sharp focus on the eyes");
    expect(draft?.prompt).not.toContain("https://t.co/demo");
    expect(draft?.sourceImageUrls).toEqual([
      "https://pbs.twimg.com/media/HJzFashion01.jpg?name=orig",
      "https://pbs.twimg.com/media/HJzFashion02.jpg?name=orig",
    ]);
    expect(draft?.authorName).toBe("Aijaz");
    expect(draft?.authorUrl).toBe("https://x.com/iamsofiaijaz");
    expect(draft?.authorAvatarUrl).toBe("https://pbs.twimg.com/profile_images/1967066723779309573/aDWbkVgi_normal.jpg");
  });

  it("extracts prompt objects from html json scripts", () => {
    const html = [
      "<html><head><title>分享页</title>",
      '<meta name="keywords" content="角色,写作">',
      "</head><body>",
      '<script type="application/json">',
      JSON.stringify({
        item: {
          title: "全栈开发专家",
          prompt: "你是一名冷静可靠的全栈开发专家，请给出可落地方案。",
          negativePrompt: "不要只给空泛建议。",
          tags: ["开发", "角色"],
        },
      }),
      "</script>",
      "</body></html>",
    ].join("");

    const draft = parsePromptDraftFromHtml(html, "https://promptfill.tanshilong.com/explore");

    expect(draft.title).toBe("全栈开发专家");
    expect(draft.prompt).toContain("全栈开发专家");
    expect(draft.negativePrompt).toBe("不要只给空泛建议。");
    expect(draft.tags).toEqual(["开发", "角色", "写作", "网页分享"]);
  });

  it("parses a Jimeng get_item_info video payload", () => {
    const draftContent = JSON.stringify({
      component_list: [
        {
          abilities: {
            gen_video: {
              text_to_video_params: {
                video_gen_inputs: [
                  {
                    prompt: "",
                    unified_edit_input: {
                      meta_list: [
                        { meta_type: "text", text: "一只橘猫在窗台上打盹，" },
                        { meta_type: "image", text: "", material_ref: { material_idx: 0 } },
                        { meta_type: "text", text: "阳光洒在毛发上，暖色调，电影质感。" },
                      ],
                    },
                  },
                ],
              },
            },
          },
        },
      ],
    });

    const payload = {
      ret: "0",
      errmsg: "success",
      data: {
        common_attr: {
          id: "7659267202557775130",
          effect_type: 53,
          title: "",
          description: "",
          cover_url: "https://p11-dreamina-sign.byteimg.com/cover.jpeg?x-expires=1",
          cover_url_map: {
            "360": "https://p26-dreamina-sign.byteimg.com/c360.webp?x-expires=1",
            "1080": "https://p11-dreamina-sign.byteimg.com/c1080.webp?x-expires=1",
          },
        },
        author: {
          name: "橘猫爱好者",
          avatar_url: "https://p3-passport.byteacctimg.com/avatar.image",
          sec_uid: "MS4wxxx",
        },
        video: {
          duration: 9,
          origin_video: null,
          transcoded_video: {
            "360p": { video_url: "https://v3-artist.vlabvod.com/lo360/?a=1" },
            "720p": { video_url: "https://v3-artist.vlabvod.com/hi720/?a=1" },
          },
        },
        aigc_image_params: {
          text2video_params: {
            model_config: { model_name: "即梦 Seedance 2.0 VIP" },
          },
        },
        aigc_draft: { content: draftContent },
      },
    };

    const draft = parseJimengItemInfoPayload(
      payload,
      "https://jimeng.jianying.com/ai-tool/work-detail/7659267202557775130?workDetailType=AiVideo&itemType=53",
    );

    expect(draft).not.toBeNull();
    expect(draft?.prompt).toBe("一只橘猫在窗台上打盹，阳光洒在毛发上，暖色调，电影质感。");
    expect(draft?.sourceImageUrl).toBe("https://v3-artist.vlabvod.com/hi720/?a=1");
    expect(draft?.sourceImageUrls?.[0]).toBe("https://v3-artist.vlabvod.com/hi720/?a=1");
    expect(draft?.sourceImageUrls?.some((url) => url.includes("c1080.webp"))).toBe(true);
    expect(draft?.generationMethod).toBe("即梦 Seedance 2.0 VIP");
    expect(draft?.authorName).toBe("橘猫爱好者");
    expect(draft?.tags).toContain("视频提示词");
  });

  it("rejects a Jimeng payload without a usable prompt", () => {
    expect(
      parseJimengItemInfoPayload(
        { ret: "0", data: { common_attr: { effect_type: 53 }, video: {} } },
        "https://jimeng.jianying.com/ai-tool/work-detail/123?workDetailType=AiVideo",
      ),
    ).toBeNull();

    expect(
      parseJimengItemInfoPayload({ ret: "1001", errmsg: "not login" }, "https://jimeng.jianying.com/ai-tool/work-detail/123"),
    ).toBeNull();
  });

  it("extracts prompt parameters from PNG text chunks", () => {
    const png = createPngWithText(
      "parameters",
      [
        "a bright city skyline, cinematic lighting",
        "Negative prompt: blur, bad anatomy",
        "Steps: 24, Sampler: DPM++ 2M, CFG scale: 6",
      ].join("\n"),
    );

    expect(extractPngTextChunks(png)).toEqual([
      {
        keyword: "parameters",
        text: "a bright city skyline, cinematic lighting\nNegative prompt: blur, bad anatomy\nSteps: 24, Sampler: DPM++ 2M, CFG scale: 6",
      },
    ]);

    const draft = parsePromptDraftFromImageMetadata(png);

    expect(draft.prompt).toBe("a bright city skyline, cinematic lighting");
    expect(draft.negativePrompt).toBe("blur, bad anatomy");
  });

  it("extracts positive/negative prompts from a ComfyUI prompt graph chunk", () => {
    const graph = {
      "6": {
        class_type: "CLIPTextEncode",
        inputs: { text: "一位古风发髻美女，灰色长发，仰拍视角，面部特写", clip: ["4", 1] },
        _meta: { title: "CLIP文本编码" },
      },
      "7": {
        class_type: "CLIPTextEncode",
        inputs: { text: "low quality, bad anatomy, extra digits", clip: ["4", 1] },
        _meta: { title: "CLIP文本编码" },
      },
      "4": {
        class_type: "CheckpointLoaderSimple",
        inputs: { ckpt_name: "models/myCustomModel_v1.safetensors" },
      },
      "3": {
        class_type: "KSampler",
        inputs: {
          seed: 123,
          steps: 20,
          model: ["4", 0],
          positive: ["6", 0],
          negative: ["7", 0],
          latent_image: ["5", 0],
        },
      },
    };
    const png = createPngWithText("prompt", JSON.stringify(graph));

    const draft = parsePromptDraftFromImageMetadata(png);

    expect(draft.prompt).toBe("一位古风发髻美女，灰色长发，仰拍视角，面部特写");
    expect(draft.negativePrompt).toBe("low quality, bad anatomy, extra digits");
    expect(draft.generationMethod).toBe("myCustomModel_v1");
    expect(draft.tags).toContain("ComfyUI");
  });
});

function createPngWithText(keyword: string, text: string): Uint8Array {
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const textData = concatBytes(encodeUtf8(keyword), Uint8Array.from([0]), encodeUtf8(text));

  return concatBytes(signature, createChunk("tEXt", textData), createChunk("IEND", new Uint8Array()));
}

function createChunk(type: string, data: Uint8Array): Uint8Array {
  const length = new Uint8Array(4);
  const view = new DataView(length.buffer);

  view.setUint32(0, data.length);

  return concatBytes(length, encodeAscii(type), data, new Uint8Array(4));
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }

  return output;
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function encodeAscii(value: string): Uint8Array {
  return Uint8Array.from([...value].map((character) => character.charCodeAt(0)));
}
