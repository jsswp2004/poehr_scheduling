import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Fade, Paper, Tooltip } from "@mui/material";
import ChatIcon from "@mui/icons-material/Chat";

/**
 * The floating launcher and window shared by every assistant (Documentation, Scheduler, Communicator, Staffing).
 *
 *  - Closed it is a round bubble. Drag it anywhere; it snaps to the left or right edge and the spot is
 *    remembered in this browser (one position for all assistants). A tap opens the chat.
 *  - Double-click shrinks it to a small dot (and back). It fades when idle so it does not hide what is under it.
 *  - Open it is a window next to the bubble. Drag it by its title bar; the collapse button puts it away.
 *  - It always stays inside the window, clear of the navy header and the footer bar, and can be moved with the
 *    arrow keys when it has focus.
 *
 * children is a function: ({ dragProps }) => panel content. Spread dragProps on the title bar.
 */

const KEY = "power.assistant.bubble.v1";
const SIZE = 52;
const MINI = 34;
const EDGE = 8;
const TOP = 76; // clear of the 64px navy header
const BOTTOM = 40; // clear of the footer bar
const PANEL_W = 380;
const PANEL_H = 560;
const IDLE_MS = 2500;

const readSaved = () => {
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY));
    if (v && (v.side === "l" || v.side === "r") && typeof v.y === "number") return v;
  } catch (e) {
    /* storage can be blocked; fall back to the default spot */
  }
  return null;
};
const writeSaved = (v) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(v));
  } catch (e) {
    /* ignore */
  }
};

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

function FloatingAssistant({ open, onOpen, onClose, label = "assistant", children }) {
  const [spot, setSpot] = useState(() => readSaved() || { side: "r", y: null, mini: false });
  const [live, setLive] = useState(null); // {x, y} while dragging the bubble
  const [panelAt, setPanelAt] = useState(null); // {x, y} once the window was dragged
  const [idle, setIdle] = useState(false);
  const [, setTick] = useState(0); // re-render on resize
  const drag = useRef(null);
  const moved = useRef(false);
  const idleTimer = useRef(null);

  const size = spot.mini ? MINI : SIZE;
  const vw = typeof window === "undefined" ? 1200 : window.innerWidth;
  const vh = typeof window === "undefined" ? 800 : window.innerHeight;
  const maxY = vh - BOTTOM - size;
  const baseY = clamp(spot.y == null ? maxY - 24 : spot.y, TOP, Math.max(TOP, maxY));
  const baseX = spot.side === "l" ? EDGE : vw - size - EDGE;
  const x = live ? live.x : baseX;
  const y = live ? live.y : baseY;

  useEffect(() => {
    const onResize = () => setTick((t) => t + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const wake = useCallback(() => {
    setIdle(false);
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(() => setIdle(true), IDLE_MS);
  }, []);
  useEffect(() => {
    wake();
    return () => clearTimeout(idleTimer.current);
  }, [wake, open]);

  const save = (next) => {
    setSpot(next);
    writeSaved(next);
  };

  // ---- bubble ----
  const onDown = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY };
    moved.current = false;
    if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    wake();
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    if (!moved.current && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
    moved.current = true;
    setLive({
      x: clamp(e.clientX - d.dx, EDGE, vw - size - EDGE),
      y: clamp(e.clientY - d.dy, TOP, Math.max(TOP, maxY)),
    });
  };
  const onUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && moved.current && live) {
      save({ ...spot, side: live.x + size / 2 < vw / 2 ? "l" : "r", y: live.y });
    }
    setLive(null);
  };
  const onClick = (e) => {
    if (moved.current) {
      moved.current = false; // that was a drag, not a tap
      return;
    }
    if (e.detail >= 2) {
      // double-click: the first click already opened the chat, so put it away and toggle the small dot
      onClose();
      save({ ...spot, mini: !spot.mini });
      return;
    }
    onOpen();
  };
  const onKey = (e) => {
    const step = 24;
    const move = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!move) return;
    e.preventDefault();
    if (e.key === "ArrowLeft") save({ ...spot, side: "l", y: baseY });
    else if (e.key === "ArrowRight") save({ ...spot, side: "r", y: baseY });
    else save({ ...spot, y: clamp(baseY + move[1], TOP, Math.max(TOP, maxY)) });
  };

  // ---- window ----
  const panelW = Math.min(PANEL_W, vw - 16);
  const panelH = Math.min(PANEL_H, vh - TOP - BOTTOM);
  const autoAt = () => {
    const px = spot.side === "l" ? 16 : vw - panelW - 16;
    const low = baseY + size / 2 > vh / 2;
    const py = clamp(low ? baseY + size - panelH : baseY, TOP, vh - BOTTOM - panelH);
    return { x: px, y: py };
  };
  const at = panelAt || autoAt();
  const px = clamp(at.x, 8, Math.max(8, vw - panelW - 8));
  const py = clamp(at.y, TOP - 4, Math.max(TOP - 4, vh - BOTTOM - panelH));

  const panelDrag = useRef(null);
  const dragProps = {
    onPointerDown: (e) => {
      if (e.target.closest && e.target.closest("button")) return;
      panelDrag.current = { dx: e.clientX - px, dy: e.clientY - py };
      if (e.currentTarget.setPointerCapture) e.currentTarget.setPointerCapture(e.pointerId);
    },
    onPointerMove: (e) => {
      const d = panelDrag.current;
      if (!d) return;
      setPanelAt({ x: e.clientX - d.dx, y: e.clientY - d.dy });
    },
    onPointerUp: () => {
      panelDrag.current = null;
    },
    style: { cursor: "grab", touchAction: "none", userSelect: "none" },
  };

  const close = () => {
    setPanelAt(null); // next time it opens beside the bubble again
    onClose();
  };

  return (
    <>
      {!open && (
        <Tooltip title={`Open ${label}. Drag to move.`} placement={spot.side === "l" ? "right" : "left"}>
          <Box
            component="button"
            type="button"
            aria-label="Open assistant"
            onClick={onClick}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onKeyDown={onKey}
            onMouseEnter={wake}
            onFocus={wake}
            sx={{
              position: "fixed", left: x, top: y, width: size, height: size, zIndex: 1250,
              border: 0, p: 0, borderRadius: "50%", bgcolor: "primary.main", color: "primary.contrastText",
              boxShadow: 6, display: "grid", placeItems: "center", touchAction: "none",
              cursor: live ? "grabbing" : "grab",
              opacity: idle && !live ? 0.45 : 0.95,
              transform: live ? "scale(1.08)" : "none",
              transition: live
                ? "none"
                : "opacity .25s, transform .15s, left .22s ease, top .22s ease, width .15s, height .15s",
              "&:hover": { opacity: 1, bgcolor: "primary.dark" },
              "&:focus-visible": { outline: "2px solid", outlineColor: "primary.light", outlineOffset: 2, opacity: 1 },
            }}
          >
            <ChatIcon fontSize={spot.mini ? "small" : "medium"} />
          </Box>
        </Tooltip>
      )}

      <Fade in={open} mountOnEnter unmountOnExit>
        <Paper
          elevation={8}
          role="dialog"
          aria-label={label}
          sx={{
            position: "fixed", zIndex: 1250, left: px, top: py, width: panelW, height: panelH,
            borderRadius: 3, overflow: "hidden", border: 1, borderColor: "divider",
          }}
        >
          {children({ dragProps, close })}
        </Paper>
      </Fade>
    </>
  );
}

export default FloatingAssistant;
