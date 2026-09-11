import { useCallback, useEffect, useRef, useState } from "react";
import type { TodoCalendarChange, TodoCalendarSettings, TodoHolidayResult } from "../../../types/todoCalendar";
import { defaultTodoCalendar } from "./utils/todoWorkCalendar";

export function useTodoCalendar(year: number) {
  const [settings, setSettings] = useState<TodoCalendarSettings>(defaultTodoCalendar);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [holiday, setHoliday] = useState<TodoHolidayResult | null>(null);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const savingRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    void window.suyanApi.readTodoCalendar().then((result) => {
      if (cancelled) return;
      if (result.ok) { setSettings(result.data); setReady(true); }
      else setError(result.error.message);
    }).catch(() => { if (!cancelled) setError("日历设置读取失败，请重新打开规划页重试。"); });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async (force = true) => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const result = await window.suyanApi.getTodoHolidayYear(year, force);
      if (id !== requestId.current) return;
      if (result.ok) setHoliday(result.data);
      else setHoliday({ calendar: null, status: "error", message: result.error.message });
    } catch {
      if (id === requestId.current) setHoliday({ calendar: null, status: "error", message: "节假日加载失败，暂按工作模式和个人调整显示，可重试" });
    } finally { if (id === requestId.current) setLoading(false); }
  }, [year]);

  useEffect(() => {
    setHoliday(null);
    if (ready && settings.useHolidays) void refresh(false);
    else setLoading(false);
    return () => { requestId.current += 1; };
  }, [refresh, ready, settings.useHolidays]);

  async function update(change: TodoCalendarChange) {
    if (!ready || savingRef.current) return;
    savingRef.current = true;
    setSaving(true); setError(""); setMessage("");
    try {
      const result = await window.suyanApi.updateTodoCalendar(change);
      if (result.ok) { setSettings(result.data); setMessage("日历设置已保存"); }
      else setError(result.error.message);
    } catch { setError("日历设置保存失败，请重试。"); }
    finally { savingRef.current = false; setSaving(false); }
  }
  return { settings, ready, saving, error, message, holiday, loading, refresh, update };
}
