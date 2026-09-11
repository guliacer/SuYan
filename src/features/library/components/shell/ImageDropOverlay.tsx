import { Upload } from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";

export function ImageDropOverlay() {
  const { t } = useLocale();
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center bg-overlay/60 p-6 backdrop-blur-sm"
    >
      <div className="flex max-w-md flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-primary bg-panel/95 px-10 py-8 text-center shadow-elevated">
        <span className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary">
          <Upload size={26} />
        </span>
        <p className="text-base font-semibold text-foreground">{t("松开鼠标即可导入图片")}</p>
      </div>
    </div>
  );
}
