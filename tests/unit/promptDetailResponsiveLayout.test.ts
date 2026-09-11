import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = path.resolve(__dirname, "../..");
const detailDialogSource = fs.readFileSync(
  path.join(projectRoot, "src", "features", "library", "components", "PromptDetailDialog.tsx"),
  "utf8",
);

describe("PromptDetailDialog responsive layout", () => {
  it("gives the detail column priority on narrow viewports", () => {
    expect(detailDialogSource).toContain(
      "grid-rows-[minmax(0,30dvh)_minmax(0,1fr)]",
    );
    expect(detailDialogSource).toContain(
      "min-[560px]:grid-rows-[minmax(0,32dvh)_minmax(0,1fr)]",
    );
    expect(detailDialogSource).toContain(
      '<aside className="flex min-h-0 min-w-0 flex-col overflow-x-hidden overflow-y-auto',
    );
    expect(detailDialogSource).toContain(
      "max-[899px]:max-h-[min(28dvh,16rem)] max-[899px]:overflow-y-auto",
    );
  });

  it("keeps the prompt body scrollable without fixed minimum heights", () => {
    expect(detailDialogSource).toContain(
      "min-h-[clamp(10rem,24dvh,20rem)] min-w-0 flex-1 flex-col overflow-hidden",
    );
    expect(detailDialogSource).toContain('className="h-full min-h-0 overflow-y-auto bg-background p-3"');
    expect(detailDialogSource).toContain("h-[clamp(10rem,28dvh,24rem)] min-h-0 max-h-[min(38dvh,24rem)]");
    expect(detailDialogSource).not.toContain("min-h-[460px]");
    expect(detailDialogSource).not.toContain("min-h-[520px]");
    expect(detailDialogSource).not.toContain("min-h-[620px]");
  });

  it("keeps all primary actions visible in one compact mobile row", () => {
    const footerStart = detailDialogSource.indexOf('<footer className="mt-4 grid shrink-0 grid-cols-3');
    const footerEnd = detailDialogSource.indexOf("</footer>", footerStart);

    expect(footerStart).toBeGreaterThanOrEqual(0);
    expect(footerEnd).toBeGreaterThan(footerStart);

    const footer = detailDialogSource.slice(footerStart, footerEnd);
    expect(footer.match(/<Button/g)?.length).toBe(3);
    expect(footer.match(/className="h-10 min-w-0/g)?.length).toBe(3);
    expect(footer).toContain("分享");
    expect(footer).toContain("复制提示词");
    expect(footer).toContain("传送到画布");
  });
});
