import { Check, Sparkles } from "lucide-react";
import { CAPSULE_TONES } from "@/components/ui/capsuleTones";
import { useLocale } from "@/components/LocaleProvider";
import {
  PROMPT_CARD_COLORS,
  PROMPT_CARD_COLOR_LABELS,
  type PromptPaletteColorId,
} from "../utils/promptColors";

type Props = {
  value: PromptPaletteColorId | "";
  onChange: (value: PromptPaletteColorId | "") => void;
};

export function PromptCardColorPicker({ value, onChange }: Props) {
  const { t } = useLocale();
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{t("卡片颜色")}</legend>
      <div aria-label={t("选择卡片颜色")} className="flex flex-wrap gap-2" role="radiogroup">
        <button
          aria-label={t("自动配色")}
          aria-pressed={value === ""}
          className={`icon-tooltip-button flex size-9 items-center justify-center rounded-lg border transition-colors ${value === "" ? "border-primary bg-primary-soft text-primary ring-2 ring-primary/25" : "border-border bg-panel text-muted hover:bg-primary-soft"}`}
          type="button"
          onClick={() => onChange("")}
        >
          {value === "" ? <Check size={16} /> : <Sparkles size={16} />}
          <span className="icon-tooltip-button__bubble" role="tooltip">{t("自动配色")}</span>
        </button>
        {PROMPT_CARD_COLORS.map((color) => {
          const selected = value === color;
          return (
            <button
              aria-label={t(PROMPT_CARD_COLOR_LABELS[color])}
              aria-pressed={selected}
              className={`icon-tooltip-button flex size-9 items-center justify-center rounded-lg border transition-shadow ${CAPSULE_TONES[color].solid} ${selected ? "ring-2 ring-primary/35" : "hover:shadow-sm"}`}
              key={color}
              type="button"
              onClick={() => onChange(color)}
            >
              {selected ? <Check size={16} /> : <span aria-hidden="true" className="size-3 rounded-full border border-current/40 bg-current/70" />}
              <span className="icon-tooltip-button__bubble" role="tooltip">{t(PROMPT_CARD_COLOR_LABELS[color])}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
