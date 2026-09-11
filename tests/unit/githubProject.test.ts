import { afterEach, describe, expect, it, vi } from "vitest";

describe("GitHub 项目灵感", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("只识别 GitHub 仓库根地址并拒绝目录和操作页面", async () => {
    const { parseGithubRepositoryUrl } = await import("../../src/features/prompts/utils/githubProject");
    expect(parseGithubRepositoryUrl("https://github.com/snownico0722/PaperTodo/")).toEqual({
      owner: "snownico0722",
      repository: "PaperTodo",
      url: "https://github.com/snownico0722/PaperTodo",
    });
    expect(parseGithubRepositoryUrl("项目地址：https://www.github.com/snownico0722/PaperTodo.git")).toEqual({
      owner: "snownico0722",
      repository: "PaperTodo",
      url: "https://github.com/snownico0722/PaperTodo",
    });
    expect(parseGithubRepositoryUrl("https://github.com/snownico0722/PaperTodo/tree/main")).toBeNull();
    expect(parseGithubRepositoryUrl("https://github.com/snownico0722/PaperTodo/issues/1")).toBeNull();
    expect(parseGithubRepositoryUrl("https://gitlab.com/snownico0722/PaperTodo")).toBeNull();
  });

  it("从 GitHub API 提取 README 和递归文件树", async () => {
    const responses = new Map<string, unknown>([
      ["/repos/snownico0722/PaperTodo", { name: "PaperTodo", full_name: "snownico0722/PaperTodo", default_branch: "main", owner: { login: "snownico0722" } }],
      ["/repos/snownico0722/PaperTodo/readme", { name: "README.md", encoding: "base64", content: Buffer.from("# PaperTodo\n\n项目说明", "utf8").toString("base64") }],
      ["/repos/snownico0722/PaperTodo/git/trees/main?recursive=1", { truncated: false, tree: [{ path: "README.md", type: "blob", size: 24 }, { path: "src", type: "tree" }, { path: "src/index.ts", type: "blob", size: 100 }] }],
      ["/repos/snownico0722/PaperTodo/releases?per_page=30", [{ id: 1, tag_name: "v1.0.0", name: "首个版本", body: "修复问题", html_url: "https://github.com/snownico0722/PaperTodo/releases/tag/v1.0.0", published_at: "2026-08-20T00:00:00Z", prerelease: false, draft: false, assets: [{ name: "PaperTodo.zip", browser_download_url: "https://github.com/snownico0722/PaperTodo/releases/download/v1.0.0/PaperTodo.zip", size: 2048, download_count: 3 }] }]],
    ]);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const body = responses.get(`${url.pathname}${url.search}`);
      return new Response(JSON.stringify(body), { status: body ? 200 : 404, headers: { "content-type": "application/json" } });
    }));

    const { fetchGithubProject } = await import("../../electron/main/library/githubProject");
    const project = await fetchGithubProject("https://github.com/snownico0722/PaperTodo");
    expect(project.name).toBe("PaperTodo");
    expect(project.releasesUrl).toBe("https://github.com/snownico0722/PaperTodo/releases");
    expect(project.releases).toEqual([expect.objectContaining({ id: "1", tagName: "v1.0.0", name: "首个版本", assets: [expect.objectContaining({ name: "PaperTodo.zip", downloadUrl: "https://github.com/snownico0722/PaperTodo/releases/download/v1.0.0/PaperTodo.zip" })] })]);
    expect(project.readmeContent).toContain("# PaperTodo");
    expect(project.files.map((file) => `${file.type}:${file.path}`)).toEqual([
      "file:README.md",
      "directory:src",
      "file:src/index.ts",
    ]);
    expect(project.files[0]?.htmlUrl).toContain("/blob/main/README.md");
    expect(project.files[2]?.downloadUrl).toContain("raw.githubusercontent.com");
  });

  it("将常见 README Markdown 解析为网页区块", async () => {
    const { parseGithubMarkdown } = await import("../../src/features/prompts/utils/githubMarkdown");
    const blocks = parseGithubMarkdown([
      "# 项目",
      "",
      "支持 **加粗**、![截图](./docs/demo.png)",
      "",
      "```ts",
      "const answer = 42;",
      "```",
      "",
      "- 第一项",
      "- 第二项",
    ].join("\n"));
    expect(blocks).toEqual(expect.arrayContaining([
      { kind: "heading", level: 1, text: "项目" },
      { kind: "code", language: "ts", code: "const answer = 42;" },
      { kind: "unordered-list", items: ["第一项", "第二项"] },
    ]));
  });
});
