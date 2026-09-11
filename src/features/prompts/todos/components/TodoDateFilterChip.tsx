import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { formatTodoPlanDate } from "../utils/todoPlanning";
import { shiftDateKey } from "../utils/todoDate";
import { useLocale } from "@/components/LocaleProvider";

type Props = {
  active: boolean;
  count: number;
  dayKey: string;
  todayKey: string;
  onActivate: () => void;
  onChangeDay: (dayKey: string) => void;
};

/**
 * 日期筛选胶囊：未选中时与其它筛选项同宽，选中后才展开前后一天与日历按钮，
 * 避免筛选行常驻一排日期控件。
 */
export function TodoDateFilterChip({ active, count, dayKey, todayKey, onActivate, onChangeDay }: Props) {
  const { t } = useLocale();
  const label = dayKey === todayKey ? t("今天") : formatTodoPlanDate(dayKey);

  return <span className="flex items-center gap-0.5">
    {active ? <IconButton label={t("前一天")} onClick={() => onChangeDay(shiftDateKey(dayKey, -1))}><ChevronLeft size={14} /></IconButton> : null}
    <button aria-pressed={active} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium ${active ? "bg-primary-soft text-primary" : "text-muted hover:bg-background hover:text-foreground"}`} title={t("按日期查看事项")} type="button" onClick={onActivate}>
      <CalendarDays size={13} />
      {label}{count ? ` ${count}` : ""}
    </button>
    {active ? <>
      <IconButton label={t("后一天")} onClick={() => onChangeDay(shiftDateKey(dayKey, 1))}><ChevronRight size={14} /></IconButton>
      <span className="relative inline-flex size-7 items-center justify-center rounded-md text-muted hover:bg-background hover:text-foreground" title={t("选择日期")}>
        <CalendarDays size={14} />
        <input aria-label={t("选择查看日期")} className="absolute inset-0 cursor-pointer opacity-0" type="date" value={dayKey} onChange={(event) => { if (event.target.value) onChangeDay(event.target.value); }} onClick={(event) => event.currentTarget.showPicker()} />
      </span>
    </> : null}
  </span>;
}

function IconButton({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return <button aria-label={label} className="flex size-7 items-center justify-center rounded-md text-muted hover:bg-background hover:text-foreground" title={label} type="button" onClick={onClick}>{children}</button>;
}
