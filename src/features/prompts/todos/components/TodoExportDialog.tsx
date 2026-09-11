import { useState } from "react";
import { Download } from "lucide-react";
import { AppDialog, DialogCloseButton } from "@/components/ui/AppDialog";
import { Button } from "@/components/ui/Button";
import { useLocale } from "@/components/LocaleProvider";
import { useTodoStore } from "../todoStore";

export function TodoExportDialog({ selectedTaskIds = [], onClose }: { selectedTaskIds?: string[]; onClose: () => void }) {
  const { t } = useLocale();
  const todo = useTodoStore();
  const [scope, setScope] = useState(selectedTaskIds.length ? "selected" : "all");
  const count = scope === "selected" ? selectedTaskIds.length : todo.tasks.length;
  return <AppDialog titleId="todo-export-title" panelClassName="flex w-full max-w-lg flex-col" onClose={onClose}>
    <header className="flex items-center justify-between border-b border-border px-5 py-4">
      <h2 id="todo-export-title" className="flex items-center gap-2 text-lg font-semibold"><Download size={19} />{t("导出待办事项")}</h2>
      <DialogCloseButton onClick={onClose} />
    </header>
    <div className="grid gap-4 p-5">
      <fieldset className="grid gap-3"><legend className="mb-2 text-sm font-medium">{t("导出范围")}</legend>
        <label className="flex items-center gap-3 rounded-xl border border-border p-3"><input type="radio" name="todo-export-scope" checked={scope === "all"} onChange={() => setScope("all")} /><span className="text-sm">{t("全部事项（{count} 项，含归档）", { count: todo.tasks.length })}</span></label>
        <label className={`flex items-center gap-3 rounded-xl border border-border p-3 ${!selectedTaskIds.length ? "opacity-50" : ""}`}><input type="radio" name="todo-export-scope" disabled={!selectedTaskIds.length} checked={scope === "selected"} onChange={() => setScope("selected")} /><span className="text-sm">{t("所选事项（{count} 项）", { count: selectedTaskIds.length })}</span></label>
      </fieldset>
      <p className="text-sm leading-6 text-muted">{t("保存为可重新导入的 JSON 文件，保留任务详情、项目、日期、标签、父子关系和归档状态。全部导出还包含进度视图设置。")}</p>
      <p className="text-xs leading-5 text-muted">{t("所选导出仅保留所选事项之间的父子关系。不包含关联提示词正文和工作日设置；导入后需重新关联提示词。")}</p>
    </div>
    <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
      <Button onClick={onClose}>{t("取消")}</Button>
      <Button variant="primary" icon={<Download size={15} />} disabled={todo.isLoading || (scope === "selected" && !count)} onClick={() => {
        const ids = scope === "selected" ? [...selectedTaskIds] : undefined;
        onClose();
        void todo.exportLibrary(ids);
      }}>{t("选择位置并导出")}</Button>
    </footer>
  </AppDialog>;
}
