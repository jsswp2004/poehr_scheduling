import { useEffect, useRef } from "react";
import { subscribe, onStatus, socketStatus } from "../../utils/secureLive";

const FAST_POLL_MS = 20000; // socket is not connected: check often
const SLOW_POLL_MS = 90000; // socket is connected: only a safety net

/**
 * Run `refresh` when a new message arrives (socket nudge), when the tab comes back into view, and on a timer.
 * The timer is the safety net that keeps messages flowing if the socket is down.
 * `refresh(reason)` gets "nudge", "poll" or "focus".
 */
export default function useLiveRefresh(refresh, { enabled = true, fastMs = FAST_POLL_MS, slowMs = SLOW_POLL_MS } = {}) {
  const latest = useRef(refresh);
  latest.current = refresh;

  useEffect(() => {
    if (!enabled) return undefined;
    let interval = null;
    let pending = null;
    const run = (reason) => latest.current && latest.current(reason);
    const nudged = () => {
      clearTimeout(pending); // several nudges close together make one fetch
      pending = setTimeout(() => run("nudge"), 250);
    };
    const restart = (status) => {
      clearInterval(interval);
      interval = setInterval(() => run("poll"), status === "open" ? slowMs : fastMs);
    };
    const visible = () => {
      if (document.visibilityState === "visible") run("focus");
    };
    const unsubscribe = subscribe(nudged);
    const unwatch = onStatus(restart);
    restart(socketStatus());
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("secure-messages-changed", nudged);
    return () => {
      clearTimeout(pending);
      clearInterval(interval);
      unsubscribe();
      unwatch();
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("secure-messages-changed", nudged);
    };
  }, [enabled, fastMs, slowMs]);
}
