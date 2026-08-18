import { useRef } from "react";
import { useAutoSave, type AutoSaveResult } from "./useAutoSave";

type UseAiSettingsAutoSaveOptions<T> = {
  /** When false, auto-save is disabled entirely (e.g. incomplete enabled profiles). */
  enabled: boolean;
  isBusy: boolean;
  onError: (message: string) => void;
  onSave: (value: T) => Promise<AutoSaveResult>;
  value: T;
};

type UseAiSettingsAutoSaveResult = {
  isSaving: boolean;
  /** Manually persist the latest value now. Resolves true when saved (or
   * nothing needed saving), false when skipped or failed. */
  flush: () => Promise<boolean>;
  /** Pause auto-save (e.g. while testing all profiles or importing). Nested
   * pauses are counted; auto-save resumes only when every pause is released. */
  pause: () => void;
  /** Release one pause. Auto-save resumes once the pause count returns to 0. */
  resume: () => void;
};

/** AI 设置专用自动保存封装：把"测试全部 API"与"导入"等暂停源合并为
 * 一个显式的挂起计数，避免多个布尔暂停散落在不同 state 中。 */
export function useAiSettingsAutoSave<T>({
  enabled,
  isBusy,
  onError,
  onSave,
  value,
}: UseAiSettingsAutoSaveOptions<T>): UseAiSettingsAutoSaveResult {
  const autoSave = useAutoSave({
    enabled,
    isBusy,
    onError,
    onSave,
    value,
  });
  const pauseCountRef = useRef(0);

  return {
    isSaving: autoSave.isSaving,
    flush: autoSave.flush,
    pause: () => {
      pauseCountRef.current += 1;
      if (pauseCountRef.current === 1) {
        autoSave.pause();
      }
    },
    resume: () => {
      pauseCountRef.current = Math.max(0, pauseCountRef.current - 1);
      if (pauseCountRef.current === 0) {
        autoSave.resume();
      }
    },
  };
}