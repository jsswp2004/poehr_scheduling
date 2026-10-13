import { useCallback, useEffect, useRef, useState } from "react";
import { staffApi } from "./api";
import { clockOffset } from "./format";

/** Re-renders every `intervalMs` so wait timers tick. */
export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Loads one day of video visits and keeps it fresh: polls while the tab is visible,
 * and refreshes immediately when an optional WebSocket sends any message.
 */
export function useSchedule(date, { pollMs = 5000, wsUrl, enabled = true } = {}) {
  const [state, setState] = useState({ items: [], loading: true, error: null, offsetMs: 0 });
  const dateRef = useRef(date);
  dateRef.current = date;
  const seq = useRef(0);

  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const data = await staffApi.schedule(dateRef.current);
      if (mine !== seq.current) return; // a newer request superseded this one
      setState({ items: data.items, loading: false, error: null, offsetMs: clockOffset(data.server_time) });
    } catch (error) {
      if (mine !== seq.current) return;
      setState((s) => ({ ...s, loading: false, error }));
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    setState((s) => ({ ...s, loading: true }));
    load();
  }, [date, load, enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      if (!document.hidden) load();
    }, pollMs);
    return () => clearInterval(id);
  }, [load, pollMs, enabled]);

  useEffect(() => {
    if (!wsUrl || !enabled) return undefined;
    let socket;
    let closed = false;
    let retry;
    const open = () => {
      socket = new WebSocket(wsUrl);
      socket.onmessage = () => load();
      socket.onclose = () => {
        if (!closed) retry = setTimeout(open, 3000);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    };
  }, [wsUrl, load, enabled]);

  return { ...state, reload: load };
}
