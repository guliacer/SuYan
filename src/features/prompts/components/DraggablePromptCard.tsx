import { useEffect, useState } from "react";
import { CSS } from "@dnd-kit/utilities";
import { useSortable } from "@dnd-kit/sortable";
import type { ComponentProps } from "react";
import { PromptCard } from "./PromptCard";
import { clampPromptCardWidth, PROMPT_CARD_DEFAULT_WIDTH } from "../utils/promptCardSizing";

type Props = ComponentProps<typeof PromptCard> & { disabled?: boolean };

export function DraggablePromptCard({ disabled = false, entry, ...props }: Props) {
  const sortable = useSortable({ id: entry.id, disabled });
  const [liveWidth, setLiveWidth] = useState(() => clampPromptCardWidth(entry.cardWidth ?? PROMPT_CARD_DEFAULT_WIDTH));

  useEffect(() => {
    setLiveWidth(clampPromptCardWidth(entry.cardWidth ?? PROMPT_CARD_DEFAULT_WIDTH));
  }, [entry.cardWidth, entry.id]);

  return (
    <div ref={sortable.setNodeRef} className="max-w-full shrink-0" style={{ width: `${liveWidth}px`, maxWidth: "100%", transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition, opacity: sortable.isDragging ? 0.45 : 1 }}>
      <PromptCard {...props} entry={entry} onSizeChange={(size) => setLiveWidth(size.width)} dragHandleProps={disabled ? undefined : { ...sortable.attributes, ...sortable.listeners }} />
    </div>
  );
}
