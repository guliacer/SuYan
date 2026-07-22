import { useEffect, useMemo, useRef, useState } from "react";
import { useLibraryStore } from "@/features/library/store/useLibraryStore";
import type { LibraryItem } from "@/features/library/types/library";
import { toPromptCardData, PromptCardData } from "@/features/library/utils/promptFilters";

const cardCache = new WeakMap<LibraryItem, PromptCardData>();

function toCachedPromptCardData(item: LibraryItem): PromptCardData {
  const cached = cardCache.get(item);

  if (cached) {
    return cached;
  }

  const card = toPromptCardData(item);
  cardCache.set(item, card);
  return card;
}

const FIRST_BATCH_SIZE = 24;
const IDLE_BATCH_SIZE = 64;

export function usePromptCards(): PromptCardData[] {
  const items = useLibraryStore((state) => state.items);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const previousCardsRef = useRef<PromptCardData[]>([]);
  const previousItemsRef = useRef<readonly LibraryItem[]>([]);

  const [visibleCount, setVisibleCount] = useState(() => Math.min(FIRST_BATCH_SIZE, items.length));

  useEffect(() => {
    setVisibleCount((prev) => {
      // 删除后尽量保留已展开窗口，避免滚动位置附近突然塌缩再重建。
      if (items.length < previousItemsRef.current.length) {
        return Math.min(Math.max(prev, FIRST_BATCH_SIZE), items.length);
      }

      return Math.min(prev, items.length);
    });
  }, [items.length]);

  useEffect(() => {
    if (visibleCount >= items.length) {
      return;
    }

    let cancelled = false;

    const scheduleNext = () => {
      if (cancelled) {
        return;
      }

      setVisibleCount((prev) => Math.min(prev + IDLE_BATCH_SIZE, itemsRef.current.length));
    };

    const handle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(() => scheduleNext(), { timeout: 300 })
        : window.setTimeout(scheduleNext, 16);

    return () => {
      cancelled = true;

      if (typeof window.cancelIdleCallback === "function" && typeof handle === "number") {
        window.cancelIdleCallback(handle);
      } else {
        window.clearTimeout(handle as number);
      }
    };
  }, [visibleCount, items.length]);

  return useMemo(() => {
    const previousItems = previousItemsRef.current;
    const previousCards = previousCardsRef.current;
    const nextVisibleCount = Math.min(visibleCount, items.length);

    // 删除后主进程返回的新数组里，未改条目若复用了旧对象引用，可直接复用旧 card。
    if (
      previousCards.length > 0 &&
      previousItems.length === items.length &&
      previousItems.every((item, index) => item === items[index])
    ) {
      const reused =
        previousCards.length === nextVisibleCount
          ? previousCards
          : items.slice(0, nextVisibleCount).map(toCachedPromptCardData);
      previousItemsRef.current = items;
      previousCardsRef.current = reused;
      return reused;
    }

    const nextCards = items.slice(0, nextVisibleCount).map(toCachedPromptCardData);
    previousItemsRef.current = items;
    previousCardsRef.current = nextCards;
    return nextCards;
  }, [items, visibleCount]);
}
