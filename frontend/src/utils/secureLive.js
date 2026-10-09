import { WS_BASE_URL } from "../config/api";
import { getAccessToken } from "./tokenManager";

/**
 * One quiet socket per browser tab for secure messaging. The server only says "something new in thread N" (ids,
 * never text); the screens then fetch over the normal API. If the socket cannot connect, nothing breaks: the
 * screens also check for new messages on a timer (see useLiveRefresh).
 */
const MAX_FAILURES = 6;
const listeners = new Set();
const statusListeners = new Set();
let socket = null;
let timer = null;
let failures = 0;
let status = "closed";

const setStatus = (next) => {
  if (next === status) return;
  status = next;
  statusListeners.forEach((fn) => fn(next));
};

export const socketStatus = () => status;

function schedule() {
  clearTimeout(timer);
  if (failures >= MAX_FAILURES) return; // give up until the tab is shown again or the network returns
  const delay = Math.min(30000, 1000 * 2 ** failures);
  failures += 1;
  timer = setTimeout(open, delay);
}

function open() {
  if (listeners.size === 0 || socket) return;
  const token = getAccessToken();
  if (!token || typeof WebSocket === "undefined") return;
  let ws;
  try {
    ws = new WebSocket(`${WS_BASE_URL}/ws/secure-messages/?token=${encodeURIComponent(token)}`);
  } catch (err) {
    schedule();
    return;
  }
  socket = ws;
  setStatus("connecting");
  ws.onopen = () => {
    failures = 0;
    setStatus("open");
  };
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data && data.type === "secure_message") listeners.forEach((fn) => fn(data));
    } catch (err) {
      /* ignore anything that is not ours */
    }
  };
  ws.onclose = (event) => {
    if (socket === ws) socket = null;
    setStatus("closed");
    // 4401 / 4403: the server refused us (signed out, or no right); retrying cannot help
    if (listeners.size > 0 && event.code !== 4401 && event.code !== 4403) schedule();
  };
  ws.onerror = () => {
    try {
      ws.close();
    } catch (err) {
      /* already closed */
    }
  };
}

function close() {
  clearTimeout(timer);
  if (socket) {
    const ws = socket;
    socket = null;
    ws.onclose = null;
    try {
      ws.close();
    } catch (err) {
      /* already closed */
    }
  }
  setStatus("closed");
}

const retryNow = () => {
  if (listeners.size === 0) return;
  failures = 0;
  open();
};
if (typeof window !== "undefined") {
  window.addEventListener("online", retryNow);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") retryNow();
  });
}

/** Call `fn({thread, message, urgent})` whenever a new message arrives. Returns the way to stop. */
export function subscribe(fn) {
  listeners.add(fn);
  open();
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) close();
  };
}

export function onStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
