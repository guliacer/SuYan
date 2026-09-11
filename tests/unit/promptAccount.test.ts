import { describe, expect, it } from "vitest";
import {
  deriveSiteUrl,
  deriveWebsiteTitle,
  detectAccountType,
  normalizeWebsiteAccountContent,
  parseAccountContent,
  stripAccountPasswordFromContent,
} from "../../src/features/prompts/utils/promptAccount";

describe("detectAccountType", () => {
  it("识别邮箱格式的账号 + 密码为账号类型", () => {
    expect(detectAccountType("站点：即梦AI\n账号：user@example.com\n密码：abc123")).toBe(true);
    expect(detectAccountType("账号名称: user@example.com\n密码: xyz")).toBe(true);
    expect(detectAccountType("邮箱：a@b.com\n密码：123456")).toBe(true);
    expect(detectAccountType("账号 a@b.com\npassword: secret")).toBe(true);
    expect(detectAccountType("网址：https://example.com/login\n账户名称：alice\n密码：secret")).toBe(true);
  });

  it("缺少密码标签时不识别为账号", () => {
    expect(detectAccountType("账号：user@example.com")).toBe(false);
    expect(detectAccountType("账号：user@example.com\n备注：无需密码")).toBe(false);
  });

  it("账号名称不是邮箱格式时不识别为账号", () => {
    expect(detectAccountType("账号：zhangsan\n密码：123456")).toBe(false);
    expect(detectAccountType("用户名：abc\n密码：123")).toBe(false);
  });

  it("纯文本与 smtp 邮箱配置不误判为账号", () => {
    expect(detectAccountType("写一篇关于春天的文章")).toBe(false);
    expect(detectAccountType("smtp.qq.com:465\n邮箱密码：xxx")).toBe(false);
  });
});

describe("parseAccountContent", () => {
  it("按行解析站点、账号与密码", () => {
    expect(parseAccountContent("站点：即梦AI\n账号：user@example.com\n密码：abc123")).toEqual({
      site: "即梦AI",
      name: "user@example.com",
      password: "abc123",
    });
  });

  it("解析网址、邮箱账户和密码模板", () => {
    expect(parseAccountContent("网址: https://example.com/login\n邮箱账户: alice@example.com\n密码: secret")).toEqual({
      site: "https://example.com/login",
      name: "alice@example.com",
      password: "secret",
    });
  });

  it("兼容 CRLF 与账号名称/邮箱叫法", () => {
    expect(parseAccountContent("账号名称: user@example.com\r\n密码: abc\r\n")).toEqual({
      name: "user@example.com",
      password: "abc",
    });
    expect(parseAccountContent("邮箱：a@b.com\n密码：123")).toEqual({ name: "a@b.com", password: "123" });
  });

  it("支持「账号：a@b.com 密码：xxx」单行写法", () => {
    expect(parseAccountContent("账号：a@b.com 密码：abc123")).toEqual({
      name: "a@b.com",
      password: "abc123",
    });
  });

  it("缺少字段时只返回存在的内容", () => {
    expect(parseAccountContent("账号：a@b.com")).toEqual({ name: "a@b.com" });
    expect(parseAccountContent("密码：abc")).toEqual({ password: "abc" });
    expect(parseAccountContent("纯文本")).toEqual({});
  });
});

describe("stripAccountPasswordFromContent", () => {
  it("移除密码行并保留站点与账号", () => {
    expect(stripAccountPasswordFromContent("站点：即梦AI\n账号：user@example.com\n密码：abc123")).toBe(
      "站点：即梦AI\n账号：user@example.com",
    );
  });

  it("单行写法只保留账号名称部分", () => {
    expect(stripAccountPasswordFromContent("账号：a@b.com 密码：abc123")).toBe("账号：a@b.com");
  });

  it("不受大小写与英文标签影响", () => {
    expect(stripAccountPasswordFromContent("Account: a@b.com\nPassword: secret")).toBe("Account: a@b.com");
  });

  it("非账号内容原样保留", () => {
    expect(stripAccountPasswordFromContent("写一篇关于春天的文章\n记得保存")).toBe("写一篇关于春天的文章\n记得保存");
  });
});

describe("normalizeWebsiteAccountContent", () => {
  it("只保留网站账户模板并从网址生成标题", () => {
    expect(normalizeWebsiteAccountContent(
      "备注：会员账号\n网址：https://www.example.com/login?token=secret\n账户名称：alice\n密码：secret-pass",
    )).toEqual({
      title: "example.com",
      content: "url: https://www.example.com/login\naccount: alice\npassword: secret-pass",
      parsed: {
        site: "https://www.example.com/login",
        name: "alice",
        password: "secret-pass",
      },
    });
  });

  it("保留旧格式并在没有网址时不强行套用网站模板", () => {
    expect(normalizeWebsiteAccountContent("站点：即梦AI\n账号：user@example.com\n密码：secret")).toBeNull();
    expect(deriveWebsiteTitle("https://www.example.com/path")).toBe("example.com");
  });

  it("邮箱账号标题使用邮箱-账号格式", () => {
    expect(normalizeWebsiteAccountContent(
      "网址：https://mail.example.com/login\n邮箱账户：alice@example.com\n密码：secret-pass",
    )).toMatchObject({
      title: "邮箱-alice@example.com",
      content: "url: https://mail.example.com/login\naccount: alice@example.com\npassword: secret-pass",
    });
  });
});

describe("deriveSiteUrl", () => {
  it("完整 URL 原样返回（去掉首尾空白）", () => {
    expect(deriveSiteUrl(" https://jimeng.jianying.com/ai/")).toBe("https://jimeng.jianying.com/ai/");
    expect(deriveSiteUrl("http://example.com")).toBe("http://example.com/");
  });

  it("裸域名自动补全 https://", () => {
    expect(deriveSiteUrl("civitai.com")).toBe("https://civitai.com/");
    expect(deriveSiteUrl("www.civitai.com/artworks")).toBe("https://www.civitai.com/artworks");
  });

  it("纯站点名称/空值/带空格内容无法打开，返回 null", () => {
    expect(deriveSiteUrl("即梦AI")).toBeNull();
    expect(deriveSiteUrl("平台账号")).toBeNull();
    expect(deriveSiteUrl("")).toBeNull();
    expect(deriveSiteUrl(undefined)).toBeNull();
    expect(deriveSiteUrl("site name with spaces")).toBeNull();
  });
});
