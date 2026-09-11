import { describe, expect, it } from "vitest";
import {
  extractWordDocumentBlocks,
  extractWordImageRelationships,
  pairWordDocumentPrompts,
} from "../../src/features/library/utils/wordDocumentImport";

describe("wordDocumentImport", () => {
  it("pairs an image with text on the same page", () => {
    const blocks = extractWordDocumentBlocks(`
      <w:document>
        <w:body>
          <w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>一位少女在唱片店挑选黑胶唱片。</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);

    expect(pairWordDocumentPrompts(blocks)).toEqual([
      {
        imageRelationshipId: "rId1",
        groupId: "flow-group-1",
        pageIndex: 0,
        pairingMode: "flow",
        prompt: "一位少女在唱片店挑选黑胶唱片。",
      },
    ]);
  });

  it("pairs an image-only page with prompt text on the next page", () => {
    const blocks = extractWordDocumentBlocks(`
      <w:document>
        <w:body>
          <w:p><w:r><w:drawing><a:blip r:embed="rId8"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:br w:type="page"/></w:r></w:p>
          <w:p><w:r><w:t>微缩海浪水族箱，玻璃立方体。</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);

    expect(pairWordDocumentPrompts(blocks)).toEqual([
      {
        imageRelationshipId: "rId8",
        groupId: "page-group-1",
        pageIndex: 0,
        pairingMode: "next-page",
        prompt: "微缩海浪水族箱，玻璃立方体。",
      },
    ]);
  });

  it("starts a new flow pair when another image appears after text", () => {
    const blocks = extractWordDocumentBlocks(`
      <w:document>
        <w:body>
          <w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>第一张提示词。</w:t></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>第二张提示词。</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);

    expect(pairWordDocumentPrompts(blocks)).toEqual([
      {
        imageRelationshipId: "rId1",
        groupId: "flow-group-1",
        pageIndex: 0,
        pairingMode: "flow",
        prompt: "第一张提示词。",
      },
      {
        imageRelationshipId: "rId2",
        groupId: "flow-group-2",
        pageIndex: 0,
        pairingMode: "flow",
        prompt: "第二张提示词。",
      },
    ]);
  });

  it("normalizes Word image relationship targets", () => {
    expect(
      extractWordImageRelationships(`
        <Relationships>
          <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image%201.jpeg"/>
          <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.com"/>
          <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/>
        </Relationships>
      `),
    ).toEqual([
      {
        id: "rId1",
        target: "word/media/image 1.jpeg",
      },
      {
        id: "rId3",
        target: "media/image2.png",
      },
    ]);
  });

  it("shares one prompt across consecutive image-only pages before a prompt page", () => {
    const blocks = extractWordDocumentBlocks(`
      <w:document>
        <w:body>
          <w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:br w:type="page"/></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:br w:type="page"/></w:r></w:p>
          <w:p><w:r><w:t>悬浮大陆城市，超现实概念艺术风格。</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);

    expect(pairWordDocumentPrompts(blocks)).toEqual([
      {
        imageRelationshipId: "rId1",
        groupId: "page-group-1",
        pageIndex: 0,
        pairingMode: "next-page",
        prompt: "悬浮大陆城市，超现实概念艺术风格。",
      },
      {
        imageRelationshipId: "rId2",
        groupId: "page-group-1",
        pageIndex: 1,
        pairingMode: "next-page",
        prompt: "悬浮大陆城市，超现实概念艺术风格。",
      },
    ]);
  });

  it("shares prompt when the prompt page also contains images (left images + right prompt layout)", () => {
    const blocks = extractWordDocumentBlocks(`
      <w:document>
        <w:body>
          <w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:br w:type="page"/></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId3"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>画面风格：超现实主义科幻概念艺术风格。</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);

    const pairs = pairWordDocumentPrompts(blocks);
    expect(pairs).toHaveLength(3);
    expect(pairs.every((pair) => pair.prompt === "画面风格：超现实主义科幻概念艺术风格。")).toBe(true);
    expect(new Set(pairs.map((pair) => pair.groupId)).size).toBe(1);
    expect(pairs.map((pair) => pair.imageRelationshipId)).toEqual(["rId1", "rId2", "rId3"]);
  });

  it("keeps multi-image + one trailing prompt as one flow group", () => {
    const blocks = extractWordDocumentBlocks(`
      <w:document>
        <w:body>
          <w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>同一组多图效果共用提示词。</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);

    expect(pairWordDocumentPrompts(blocks)).toEqual([
      {
        imageRelationshipId: "rId1",
        groupId: "flow-group-1",
        pageIndex: 0,
        pairingMode: "flow",
        prompt: "同一组多图效果共用提示词。",
      },
      {
        imageRelationshipId: "rId2",
        groupId: "flow-group-1",
        pageIndex: 0,
        pairingMode: "flow",
        prompt: "同一组多图效果共用提示词。",
      },
    ]);
  });

  it("does not merge different prompts that happen to share one page", () => {
    const blocks = extractWordDocumentBlocks(`
      <w:document>
        <w:body>
          <w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>第一组提示词。</w:t></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>第二组提示词。</w:t></w:r></w:p>
          <w:p><w:r><w:br w:type="page"/></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId3"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>第三组提示词。</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);

    const pairs = pairWordDocumentPrompts(blocks);
    expect(pairs.map((pair) => pair.prompt)).toEqual(["第一组提示词。", "第二组提示词。", "第三组提示词。"]);
    expect(new Set(pairs.map((pair) => pair.groupId)).size).toBe(3);
  });

  it("keeps repeated prompts separate when their image runs are not adjacent", () => {
    const blocks = extractWordDocumentBlocks(`
      <w:document>
        <w:body>
          <w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>相同提示词。</w:t></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>中间提示词。</w:t></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId3"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>相同提示词。</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);

    const pairs = pairWordDocumentPrompts(blocks);
    expect(pairs.map((pair) => pair.prompt)).toEqual(["相同提示词。", "中间提示词。", "相同提示词。"]);
    expect(new Set(pairs.map((pair) => pair.groupId)).size).toBe(3);
  });

  it("supports prompt-before-image tables without merging table cells", () => {
    const blocks = extractWordDocumentBlocks(`
      <w:document>
        <w:body>
          <w:tbl>
            <w:tr>
              <w:tc><w:p><w:r><w:t>表格提示词一。</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r></w:p></w:tc>
            </w:tr>
            <w:tr>
              <w:tc><w:p><w:r><w:t>表格提示词二。</w:t></w:r></w:p></w:tc>
              <w:tc><w:p><w:r><w:drawing><a:blip r:embed="rId3"/></w:drawing></w:r></w:p></w:tc>
            </w:tr>
          </w:tbl>
        </w:body>
      </w:document>
    `);

    const pairs = pairWordDocumentPrompts(blocks);
    expect(pairs.map((pair) => pair.imageRelationshipId)).toEqual(["rId1", "rId2", "rId3"]);
    expect(pairs.map((pair) => pair.prompt)).toEqual(["表格提示词一。", "表格提示词一。", "表格提示词二。"]);
    expect(pairs[0]?.groupId).toBe(pairs[1]?.groupId);
    expect(pairs[1]?.groupId).not.toBe(pairs[2]?.groupId);
  });

  it("ignores a short document heading before image-first prompt sections", () => {
    const blocks = extractWordDocumentBlocks(`
      <w:document>
        <w:body>
          <w:p><w:r><w:t>素材整理</w:t></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId1"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>第一组完整提示词：城市夜景、柔和光影与电影感构图。</w:t></w:r></w:p>
          <w:p><w:r><w:drawing><a:blip r:embed="rId2"/></w:drawing></w:r></w:p>
          <w:p><w:r><w:t>第二组完整提示词：森林人像、自然光线与浅景深效果。</w:t></w:r></w:p>
        </w:body>
      </w:document>
    `);

    const pairs = pairWordDocumentPrompts(blocks);
    expect(pairs.map((pair) => pair.prompt)).toEqual([
      "第一组完整提示词：城市夜景、柔和光影与电影感构图。",
      "第二组完整提示词：森林人像、自然光线与浅景深效果。",
    ]);
  });

});
