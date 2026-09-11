import { useEffect, useRef, useState } from "react";

export type AutoSaveResult = boolean | string | void;

type UseAutoSaveOptions<T> = {
  delayMs?: number;
  enabled?: boolean;
  isBusy?: boolean;
  onError?: (message: string) => void;
  onSave: (value: T) => Promise<AutoSaveResult>;
  onSaved?: () => void;
  serialize?: (value: T) => string;
  value: T;
};

type UseAutoSaveResult = {
  isSaving: boolean;
  /** Manually persist the latest value now. Resolves true when saved (or nothing needed saving). */
  flush: () => Promise<boolean>;
  /** Pause auto-save scheduling (in-flight flush still completes). */
  pause: () => void;
  /** Resume auto-save scheduling after a pause. */
  resume: () => void;
};

/** Debounces local draft changes and persists the latest complete snapshot. */
export function useAutoSave<T>({
  delayMs = 250,
  enabled = true,
  isBusy = false,
  onError,
  onSave,
  onSaved,
  serialize = (value) => JSON.stringify(value),
  value,
}: UseAutoSaveOptions<T>): UseAutoSaveResult {
  const [isSaving, setIsSaving] = useState(false);
  const valueRef = useRef(value);
  const signatureRef = useRef(serialize(value));
  const lastObservedSignatureRef = useRef(signatureRef.current);
  const lastSavedSignatureRef = useRef(signatureRef.current);
  const revisionRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const inFlightPromiseRef = useRef<Promise<boolean> | null>(null);
  const mountedRef = useRef(true);
  const enabledRef = useRef(enabled);
  const isBusyRef = useRef(isBusy);
  const pausedRef = useRef(false);
  const onSaveRef = useRef(onSave);
  const onErrorRef = useRef(onError);
  const onSavedRef = useRef(onSaved);
  const serializeRef = useRef(serialize);
  const flushRef = useRef<(() => Promise<boolean>) | null>(null);

  valueRef.current = value;
  signatureRef.current = serialize(value);
  enabledRef.current = enabled;
  isBusyRef.current = isBusy;
  onSaveRef.current = onSave;
  onErrorRef.current = onError;
  onSavedRef.current = onSaved;
  serializeRef.current = serialize;

  function clearTimer() {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function scheduleFlush() {
    clearTimer();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void flushRef.current?.();
    }, delayMs);
  }

  async function flush(): Promise<boolean> {
    // A close handler can call flush while the debounce timer is already saving.
    // Wait for that request, then retry once if a newer draft arrived meanwhile.
    const inFlightPromise = inFlightPromiseRef.current;
    if (inFlightPromise) {
      const result = await inFlightPromise;

      if (signatureRef.current !== lastSavedSignatureRef.current && enabledRef.current) {
        return flush();
      }

      return result;
    }

    // Pause blocks scheduling, but an explicit flush must still be allowed. This
    // is used by export/import and dialog close paths to drain the latest draft.
    // Explicit flushes pause scheduling first (dialog close/export/import).
    // They must be allowed to drain while the previous save is still reflected
    // as busy; the queued save operation itself is already serialized.
    if (!enabledRef.current || (isBusyRef.current && !pausedRef.current)) {
      return false;
    }

    const requestSignature = signatureRef.current;
    if (requestSignature === lastSavedSignatureRef.current) {
      return true;
    }

    const requestRevision = revisionRef.current;
    inFlightRef.current = true;

    const savePromise = (async () => {
      if (mountedRef.current) {
        setIsSaving(true);
      }

      try {
        const result = await onSaveRef.current(valueRef.current);
        const succeeded = result === true || typeof result === "undefined";

        if (requestRevision === revisionRef.current) {
          if (succeeded) {
            lastSavedSignatureRef.current = requestSignature;
            onSavedRef.current?.();
            return true;
          }

          onErrorRef.current?.(
            typeof result === "string" && result.trim() ? result : "自动保存失败，请稍后重试。",
          );
          return false;
        }

        return false;
      } catch (error) {
        if (requestRevision === revisionRef.current) {
          onErrorRef.current?.(error instanceof Error ? error.message : "自动保存失败，请稍后重试。");
        }

        return false;
      } finally {
        inFlightRef.current = false;
        inFlightPromiseRef.current = null;

        if (mountedRef.current) {
          setIsSaving(false);
        }

        if (
          mountedRef.current &&
          signatureRef.current !== lastSavedSignatureRef.current &&
          enabledRef.current &&
          !isBusyRef.current &&
          !pausedRef.current
        ) {
          scheduleFlush();
        }
      }
    })();

    inFlightPromiseRef.current = savePromise;
    return savePromise;
  }

  function pause() {
    pausedRef.current = true;
    clearTimer();
  }

  function resume() {
    pausedRef.current = false;

    if (
      mountedRef.current &&
      signatureRef.current !== lastSavedSignatureRef.current &&
      enabledRef.current &&
      !isBusyRef.current
    ) {
      scheduleFlush();
    }
  }

  flushRef.current = flush;

  useEffect(() => {
    const signature = signatureRef.current;

    if (signature !== lastObservedSignatureRef.current) {
      lastObservedSignatureRef.current = signature;
      revisionRef.current += 1;
    }

    if (signature === lastSavedSignatureRef.current) {
      clearTimer();
      return;
    }

    if (enabled && !isBusy && !pausedRef.current) {
      scheduleFlush();
    }
  }, [delayMs, enabled, isBusy, serialize, value]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      clearTimer();
      // Do not cancel an in-flight request. Its promise continues through the
      // renderer teardown and the main-process write queue completes it safely.
    };
  }, []);

  return { isSaving, flush, pause, resume };
}
