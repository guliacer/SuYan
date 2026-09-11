import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import type { CreateTodoWidgetInput, TodoDatePreset, TodoProgressWidget, TodoProject, UpdateTodoWidgetInput } from "../../types";

type Props = { projects: TodoProject[]; isBusy: boolean; widget?: TodoProgressWidget; onClose: () => void; onCreate: (input: CreateTodoWidgetInput) => Promise<unknown>; onUpdate?: (id: string, patch: UpdateTodoWidgetInput) => Promise<unknown> };

export function AddTodoWidgetDialog({ projects, isBusy, widget, onClose, onCreate, onUpdate }: Props) {
  const { t } = useLocale();
  const [viewType, setViewType] = useState<"project" | "date">(widget?.viewType ?? "project");
  const [projectScope, setProjectScope] = useState<"all" | "specific">(widget?.projectScope ?? "all");
  const [projectId, setProjectId] = useState(widget?.projectId ?? "");
  const [datePreset, setDatePreset] = useState<TodoDatePreset>(widget?.datePreset ?? "today");
  const [dateFrom, setDateFrom] = useState(toDateInput(widget?.dateFrom));
  const [dateTo, setDateTo] = useState(toDateInput(widget?.dateTo));
  const [includeCompleted, setIncludeCompleted] = useState(widget?.includeCompleted ?? true);
  const [showOverdue, setShowOverdue] = useState(widget?.showOverdue ?? true);
  const valid = viewType === "project" ? projectScope === "all" || Boolean(projectId) : datePreset !== "custom" || Boolean(dateFrom && dateTo && dateFrom <= dateTo);

  async function submit() {
    if (!valid || isBusy) return;
    const input: CreateTodoWidgetInput = viewType === "project"
      ? { viewType, projectScope, projectId: projectScope === "specific" ? projectId : undefined, includeCompleted, showOverdue }
      : { viewType, datePreset, dateFrom: datePreset === "custom" ? dateFrom : undefined, dateTo: datePreset === "custom" ? dateTo : undefined, includeCompleted, showOverdue };
    const result = widget && onUpdate ? await onUpdate(widget.id, input) : await onCreate(input);
    if (result) onClose();
  }

  return <AppDialog overlayClassName="z-[180] px-3 py-4" panelClassName="w-full max-w-lg" titleId="todo-widget-create-title" onClose={onClose}><header className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs text-muted">{t("灵感创作右侧")}</p><h2 className="mt-1 flex items-center gap-2 text-lg font-semibold" id="todo-widget-create-title"><BarChart3 size={18} />{widget ? t("编辑进度视图") : t("添加进度视图")}</h2></div><DialogCloseButton onClick={onClose} /></header><div className="grid gap-4 p-5"><div className="grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1"><button className={`rounded-lg px-3 py-2 text-sm ${viewType === "project" ? "bg-primary text-primary-foreground" : "text-muted"}`} type="button" onClick={() => setViewType("project")}>{t("按项目")}</button><button className={`rounded-lg px-3 py-2 text-sm ${viewType === "date" ? "bg-primary text-primary-foreground" : "text-muted"}`} type="button" onClick={() => setViewType("date")}>{t("按日期")}</button></div>{viewType === "project" ? <div className="grid gap-3"><label className="grid gap-1.5 text-sm font-medium">{t("查看范围")}<select className="h-10 rounded-xl border border-border bg-panel px-3 text-sm" value={projectScope} onChange={(event) => setProjectScope(event.target.value as "all" | "specific")}><option value="all">{t("全部项目概览")}</option><option value="specific">{t("指定项目")}</option></select></label>{projectScope === "specific" ? <label className="grid gap-1.5 text-sm font-medium">{t("项目")}<select className="h-10 rounded-xl border border-border bg-panel px-3 text-sm" value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">{t("请选择项目")}</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}{project.archived ? `（${t("已归档")}）` : ""}</option>)}</select></label> : null}</div> : <div className="grid gap-3"><label className="grid gap-1.5 text-sm font-medium">{t("日期范围")}<select className="h-10 rounded-xl border border-border bg-panel px-3 text-sm" value={datePreset} onChange={(event) => setDatePreset(event.target.value as TodoDatePreset)}><option value="today">{t("今天")}</option><option value="this-week">{t("本周")}</option><option value="this-month">{t("本月")}</option><option value="custom">{t("自定义日期范围")}</option></select></label>{datePreset === "custom" ? <div className="grid gap-3 min-[500px]:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">{t("开始")}<input className="h-10 rounded-xl border border-border bg-panel px-3 text-sm" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label className="grid gap-1.5 text-sm font-medium">{t("结束")}<input className="h-10 rounded-xl border border-border bg-panel px-3 text-sm" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label></div> : null}</div>}<label className="flex items-center gap-2 text-sm"><input checked={includeCompleted} type="checkbox" onChange={(event) => setIncludeCompleted(event.target.checked)} />{t("显示已完成任务")}</label><label className="flex items-center gap-2 text-sm"><input checked={showOverdue} type="checkbox" onChange={(event) => setShowOverdue(event.target.checked)} />{t("显示逾期数量")}</label></div><footer className="flex justify-end gap-2 border-t border-border px-5 py-4"><Button onClick={onClose}>{t("取消")}</Button><Button disabled={!valid || isBusy} variant="primary" onClick={() => void submit()}>{widget ? t("保存修改") : t("添加视图")}</Button></footer></AppDialog>;
}

function toDateInput(value?: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
