import { useLayoutEffect, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type Props = { anchorRef: RefObject<HTMLElement | null>; children: ReactNode; label: string; onClose: () => void; width?: number };
/** Fixed portal popovers remain visible inside clipped and scrolling workspaces. */
export function AnchoredPopover({ anchorRef, children, label, onClose, width = 320 }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: 8, top: 8, ready: false });
  useLayoutEffect(() => {
    function update() {
      const anchor = anchorRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const panelHeight = panel.current?.getBoundingClientRect().height ?? 0;
      const left = Math.max(8, Math.min(anchor.right - width, window.innerWidth - width - 8));
      const top = anchor.bottom + 8 + panelHeight <= window.innerHeight - 8 ? anchor.bottom + 8 : Math.max(8, anchor.top - panelHeight - 8);
      setPosition({ left, top, ready: true });
    }
    update();
    const observer = new ResizeObserver(update);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [anchorRef, width]);
  useEffect(() => {
    function pointer(event: PointerEvent) { if (!panel.current?.contains(event.target as Node) && !anchorRef.current?.contains(event.target as Node)) onClose(); }
    function keyboard(event: KeyboardEvent) { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); anchorRef.current?.focus(); } }
    document.addEventListener("pointerdown", pointer);
    document.addEventListener("keydown", keyboard);
    return () => { document.removeEventListener("pointerdown", pointer); document.removeEventListener("keydown", keyboard); };
  }, [anchorRef, onClose]);
  return createPortal(<div ref={panel} role="dialog" aria-label={label} className="fixed z-[300] max-h-[calc(100dvh-1rem)] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-2xl border border-border bg-panel p-4 text-foreground shadow-elevated" style={{ width, left: position.left, top: position.top, visibility: position.ready ? "visible" : "hidden" }}>{children}</div>, document.body);
}
