import { useLayoutEffect, useRef } from "react";

/** Keep sticky explorer menus inside the visible portion of their scroll pane. */
export function useLexiconMenuViewport(enabled: boolean) {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!enabled || !menu) return;
    const ancestors: HTMLElement[] = [];
    for (let parent = menu.parentElement; parent; parent = parent.parentElement) {
      ancestors.push(parent);
    }
    let frame = 0;
    const update = () => {
      frame = 0;
      let bottom = window.innerHeight;
      for (const ancestor of ancestors) {
        if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(ancestor).overflowY)) {
          const bounds = ancestor.getBoundingClientRect();
          bottom = Math.min(bottom, bounds.top + ancestor.clientTop + ancestor.clientHeight);
        }
      }
      const available = Math.max(0, Math.floor(bottom - menu.getBoundingClientRect().top - 12));
      const value = `${available}px`;
      if (menu.style.getPropertyValue("--lexicon-menu-available-height") !== value) {
        menu.style.setProperty("--lexicon-menu-available-height", value);
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onScroll = (event: Event) => {
      // Scrolling the menu itself does not change its available space.
      if (event.target === document || ancestors.includes(event.target as HTMLElement)) schedule();
    };
    update();
    const observer = new ResizeObserver(schedule);
    ancestors.forEach((ancestor) => observer.observe(ancestor));
    document.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", schedule);
    return () => {
      observer.disconnect();
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", schedule);
      if (frame) cancelAnimationFrame(frame);
      menu.style.removeProperty("--lexicon-menu-available-height");
    };
  }, [enabled]);

  return ref;
}
