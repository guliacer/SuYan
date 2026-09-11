import { CAPSULE_TONES } from "@/components/ui/capsuleTones";
import { getTodoTagTone } from "../utils/todoTags";

type Props = {
  tags: readonly string[];
  /** 超出该数量后折叠为 `+N`，默认展示前 3 个。 */
  max?: number;
};

/** 任务行上的只读标签胶囊；同名标签固定同色。 */
export function TodoTagCapsules({ tags, max = 3 }: Props) {
  if (!tags.length) return null;
  const visible = tags.slice(0, max);
  const hidden = tags.length - visible.length;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1" title={tags.join("、")}>
      {visible.map((tag) => (
        <span className={`max-w-24 shrink-0 truncate rounded-full border px-1.5 py-px text-[10px] ${CAPSULE_TONES[getTodoTagTone(tag)].solid}`} key={tag}>
          {tag}
        </span>
      ))}
      {hidden > 0 ? <span className="shrink-0 text-[10px] text-muted">+{hidden}</span> : null}
    </span>
  );
}
