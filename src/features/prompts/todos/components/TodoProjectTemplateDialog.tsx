import { useEffect, useMemo, useState } from "react";
import { Check, Circle, FileText, LoaderCircle, WandSparkles, X } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { useLocale } from "@/components/LocaleProvider";
import type { CreateTodoProjectInput, CreateTodoTaskInput, TodoProject } from "../../types";
import { buildTodoProjectTemplateTasks, parseTodoProjectTemplate, TODO_PROJECT_TEMPLATE_EXAMPLE } from "../utils/todoProjectTemplate";

type Props = {
  isBusy: boolean;
  onClose: () => void;
  onCreateProject: (input: CreateTodoProjectInput) => Promise<TodoProject | null>;
  onCreateTask: (input: CreateTodoTaskInput) => Promise<unknown>;
};

export function TodoProjectTemplateDialog({ isBusy, onClose, onCreateProject, onCreateTask }: Props) {
  const { t } = useLocale();
  const [text, setText] = useState("");
  const [projectTitle, setProjectTitle] = useState("未命名项目");
  const [isCreating, setIsCreating] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const parsed = useMemo(() => parseTodoProjectTemplate(text), [text]);
  const itemCount = parsed.completedItems.length + parsed.pendingItems.length;

  useEffect(() => {
    setProjectTitle(parsed.projectTitle);
    setMessage("");
    setError("");
  }, [parsed.projectTitle]);

  async function createProject() {
    const title = projectTitle.trim();
    if (!title || itemCount === 0 || isBusy || isCreating) return;
    setIsCreating(true);
    setMessage("");
    setError("");
    try {
      const project = await onCreateProject({ name: title, description: parsed.projectDescription });
      if (!project) {
        setError(t("项目创建失败，请稍后重试。"));
        return;
      }
      const taskGroups = buildTodoProjectTemplateTasks(parsed, project);
      let createdCount = 0;
      for (const task of [...taskGroups.completed, ...taskGroups.pending]) {
        const created = await onCreateTask(task);
        if (created) createdCount += 1;
      }
      if (createdCount === itemCount) {
        setMessage(t("已创建项目“{name}”，并加入 {count} 项任务。", { name: project.name, count: createdCount }));
      } else {
        setError(t("项目已创建，但任务只加入 {created}/{total} 项，请检查保存状态后重试。", { created: createdCount, total: itemCount }));
      }
    } finally {
      setIsCreating(false);
    }
  }

  function fillExample() {
    setText(TODO_PROJECT_TEMPLATE_EXAMPLE);
  }

  return <AppDialog overlayClassName="z-[225] px-3 py-4" panelClassName="flex max-h-[min(900px,calc(100dvh-2rem))] w-full max-w-5xl flex-col" titleId="todo-project-template-title" onClose={onClose}>
    <header className="flex items-center justify-between border-b border-border px-5 py-4"><div><p className="text-xs text-muted">{t("内置模板 · 自动识别")}</p><h2 className="mt-1 flex items-center gap-2 text-lg font-semibold" id="todo-project-template-title"><WandSparkles size={19} />{t("从文本创建项目")}</h2></div><DialogCloseButton onClick={onClose} /></header>
    <div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="grid gap-5 min-[840px]:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
      <section className="grid content-start gap-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><label className="text-sm font-medium" htmlFor="todo-project-template-input">{t("项目进度文本")}</label><p className="mt-1 text-xs text-muted">{t("粘贴项目盘点、适配记录或带完成状态的事项文本，模板会自动分出已完成和未完成。")}</p></div><Button size="sm" icon={<FileText size={14} />} onClick={fillExample}>{t("填入示例")}</Button></div><textarea id="todo-project-template-input" aria-label={t("项目进度文本")} className="min-h-80 w-full resize-y rounded-xl border border-border bg-background px-3 py-3 text-sm leading-6 outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" placeholder={t("粘贴项目进度文本")} value={text} onChange={(event) => setText(event.target.value)} /><p className="text-xs text-muted">{t("当前模板会自动识别“已完成 / 未完成”语义和应用名称，不需要手动设置解析规则。")}</p></section>
      <section className="min-w-0"><div className="flex flex-wrap items-end justify-between gap-2"><div><p className="text-sm font-medium">{t("创建预览")}</p><p className="mt-1 text-xs text-muted">{itemCount ? t("共识别 {total} 项：{completed} 项已完成，{pending} 项未完成。", { total: itemCount, completed: parsed.completedItems.length, pending: parsed.pendingItems.length }) : t("输入文本后会显示项目结构。")}</p></div></div><label className="mt-3 grid gap-1.5 text-sm font-medium" htmlFor="todo-project-template-title-input">{t("项目标题")}<TextField id="todo-project-template-title-input" value={projectTitle} onChange={(event) => setProjectTitle(event.target.value)} /></label><div className="mt-4 grid gap-4 min-[560px]:grid-cols-2"><PreviewGroup title={t("已完成事项")} items={parsed.completedItems.map((item) => item.title)} completed /><PreviewGroup title={t("未完成事项")} items={parsed.pendingItems.map((item) => item.title)} /></div>{parsed.projectDescription ? <div className="mt-4 rounded-lg bg-background px-3 py-2 text-xs leading-5 text-muted"><strong className="font-medium text-foreground">{t("补充说明")}</strong><p className="mt-1">{parsed.projectDescription}</p></div> : null}{parsed.warnings.length ? <div className="mt-4 grid gap-1 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2 text-xs text-warning">{parsed.warnings.map((warning) => <p key={warning}>{warning}</p>)}</div> : null}</section>
    </div></div>
    <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-5 py-4"><div className="min-w-0 text-xs">{error ? <span className="text-danger">{error}</span> : message ? <span className="text-primary">{message}</span> : <span className="text-muted">{t("创建后会自动生成一个项目，并按状态写入任务。")}</span>}</div><div className="flex gap-2"><Button icon={<X size={15} />} onClick={onClose}>{t("取消")}</Button><Button disabled={!projectTitle.trim() || itemCount === 0 || isBusy || isCreating} variant="primary" icon={isCreating ? <LoaderCircle className="animate-spin" size={15} /> : <WandSparkles size={15} />} onClick={() => void createProject()}>{isCreating ? t("正在创建") : t("创建项目")}</Button></div></footer>
  </AppDialog>;
}

function PreviewGroup({ title, items, completed = false }: { title: string; items: string[]; completed?: boolean }) {
  const { t } = useLocale();
  return <section className="min-w-0 rounded-xl border border-border bg-background/45 p-3"><div className="flex items-center gap-2 text-sm font-medium"><span className={`flex size-5 items-center justify-center rounded-full border ${completed ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted"}`}>{completed ? <Check size={12} /> : <Circle size={11} />}</span>{title}<span className="text-xs font-normal text-muted">{items.length}</span></div><div className="mt-2 max-h-64 overflow-y-auto pr-1">{items.length ? <ul className="grid gap-1.5">{items.map((item) => <li className={`rounded-md px-2 py-1.5 text-xs leading-5 ${completed ? "bg-primary-soft/45 text-muted line-through" : "bg-panel text-foreground"}`} key={item}>{item}</li>)}</ul> : <p className="py-5 text-center text-xs text-muted">{t("暂无识别结果")}</p>}</div></section>;
}
