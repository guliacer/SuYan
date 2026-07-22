import { describe, expect, it } from "vitest";
import {
  buildUpdateCheckResult,
  compareSemver,
  normalizeVersion,
  parseGithubLatestReleaseJson,
  parseGithubReleasesAtom,
} from "../../electron/main/app/updateCheckerModel";

describe("updateChecker version helpers", () => {
  it("normalizes leading v", () => {
    expect(normalizeVersion("v0.1.0")).toBe("0.1.0");
    expect(normalizeVersion(" 1.2.3 ")).toBe("1.2.3");
  });

  it("compares semver-like versions", () => {
    expect(compareSemver("0.1.0", "0.1.0")).toBe(0);
    expect(compareSemver("0.2.0", "0.1.9")).toBe(1);
    expect(compareSemver("v0.1.0", "0.1.1")).toBe(-1);
    expect(compareSemver("1.0.0", "1.0")).toBe(0);
  });
});

describe("updateChecker parsers", () => {
  it("parses github latest release json", () => {
    const release = parseGithubLatestReleaseJson({
      tag_name: "v0.2.0",
      name: "素言 0.2.0",
      html_url: "https://github.com/guliacer/SuYan/releases/tag/v0.2.0",
      published_at: "2026-07-22T00:00:00Z",
    });

    expect(release).toEqual({
      version: "0.2.0",
      releaseName: "素言 0.2.0",
      releaseUrl: "https://github.com/guliacer/SuYan/releases/tag/v0.2.0",
      publishedAt: "2026-07-22T00:00:00Z",
      source: "github-api",
    });
  });

  it("parses github releases atom feed", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Release notes from SuYan</title>
  <entry>
    <id>tag:github.com,2008:Repository/1/v0.3.1</id>
    <updated>2026-07-21T12:00:00Z</updated>
    <link rel="alternate" type="text/html" href="https://github.com/guliacer/SuYan/releases/tag/v0.3.1"/>
    <title>v0.3.1</title>
  </entry>
</feed>`;

    const release = parseGithubReleasesAtom(xml);
    expect(release?.version).toBe("0.3.1");
    expect(release?.source).toBe("github-atom");
    expect(release?.releaseUrl).toContain("/releases/tag/v0.3.1");
  });

  it("returns null when atom has no entries", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>empty</title></feed>`;
    expect(parseGithubReleasesAtom(xml)).toBeNull();
  });
});

describe("updateChecker result mapping", () => {
  it("marks update available when remote is newer", () => {
    const result = buildUpdateCheckResult("0.1.0", {
      version: "0.2.0",
      releaseName: "0.2.0",
      releaseUrl: "https://github.com/guliacer/SuYan/releases/tag/v0.2.0",
      publishedAt: null,
      source: "github-api",
    });
    expect(result.status).toBe("update_available");
    expect(result.latestVersion).toBe("0.2.0");
  });

  it("marks up to date when remote is same or older", () => {
    const same = buildUpdateCheckResult("0.2.0", {
      version: "0.2.0",
      releaseName: null,
      releaseUrl: "https://github.com/guliacer/SuYan/releases/tag/v0.2.0",
      publishedAt: null,
      source: "github-atom",
    });
    expect(same.status).toBe("up_to_date");

    const older = buildUpdateCheckResult("0.3.0", {
      version: "0.2.0",
      releaseName: null,
      releaseUrl: "https://github.com/guliacer/SuYan/releases/tag/v0.2.0",
      publishedAt: null,
      source: "github-atom",
    });
    expect(older.status).toBe("up_to_date");
  });

  it("marks no releases when remote is empty", () => {
    const result = buildUpdateCheckResult("0.1.0", null);
    expect(result.status).toBe("no_releases");
    expect(result.releaseUrl).toContain("github.com/guliacer/SuYan/releases");
  });
});
