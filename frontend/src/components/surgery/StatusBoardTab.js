import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, ButtonGroup, Checkbox, FormControlLabel, MenuItem, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import RefreshIcon from "@mui/icons-material/Refresh";
import { BOARD_FONT_SIZES, BOARD_NAME_MODES, LEGEND_ORDER, STATUS_META, boardName, boardRows, usDate } from "./surgeryUtils";

const PREFS_KEY = "surgeryStatusBoardPrefs";
const DEFAULT_PREFS = { size: 3, names: "last_initial", hideDone: false };
export const REFRESH_CHOICES = [
  { ms: 15000, label: "15 seconds" },
  { ms: 30000, label: "30 seconds" },
  { ms: 60000, label: "1 minute" },
  { ms: 300000, label: "5 minutes" },
];

// A person's own display choices are remembered in the browser; if storage is blocked the board still works.
const loadPrefs = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (saved && typeof saved === "object") return { ...DEFAULT_PREFS, ...saved };
  } catch (err) {
    // fall through to the defaults
  }
  return DEFAULT_PREFS;
};

/**
 * The Status Board: a large-type view of the day's cases for a wall screen or the OR desk.
 * Patient names can be cut down (see Names), and Full screen fills the display.
 */
export default function StatusBoardTab({ rows, date, refreshMs, onRefreshMsChange, onRefresh }) {
  const [prefs, setPrefs] = useState(loadPrefs);
  const [full, setFull] = useState(false);
  const boardRef = useRef(null);

  const update = (patch) =>
    setPrefs((p) => {
      const next = { ...p, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch (err) {
        // not remembered, still applied
      }
      return next;
    });

  useEffect(() => {
    const onChange = () => setFull(!!document.fullscreenElement && document.fullscreenElement === boardRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const supportsFullscreen = typeof document !== "undefined" && !!document.documentElement.requestFullscreen;
  const toggleFull = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (boardRef.current?.requestFullscreen) boardRef.current.requestFullscreen();
  };

  const shown = useMemo(() => boardRows(rows, prefs.hideDone), [rows, prefs.hideDone]);
  const counts = useMemo(() => {
    const c = Object.fromEntries(LEGEND_ORDER.map((s) => [s, 0]));
    rows.forEach((r) => {
      c[r.status] += 1;
    });
    return c;
  }, [rows]);
  const fontSize = BOARD_FONT_SIZES[prefs.size] || BOARD_FONT_SIZES[3];

  return (
    <Box ref={boardRef} data-testid="status-board" sx={{ backgroundColor: "background.default", p: full ? 2 : 0, height: full ? "100vh" : "auto", overflow: full ? "auto" : "visible" }}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        <Button variant="outlined" startIcon={full ? <FullscreenExitIcon /> : <FullscreenIcon />} onClick={toggleFull} disabled={!supportsFullscreen}>
          {full ? "Exit full screen" : "Full screen"}
        </Button>
        <ButtonGroup aria-label="Text size">
          {BOARD_FONT_SIZES.map((px, i) => (
            <Button key={px} aria-label={`Text size ${i + 1}`} aria-pressed={prefs.size === i} variant={prefs.size === i ? "contained" : "outlined"} onClick={() => update({ size: i })} sx={{ minWidth: 40, fontSize: 10 + i * 2, lineHeight: 1 }}>
              A
            </Button>
          ))}
        </ButtonGroup>
        <TextField size="small" select label="Names" value={prefs.names} onChange={(e) => update({ names: e.target.value })} sx={{ minWidth: 210 }}>
          {BOARD_NAME_MODES.map((m) => (
            <MenuItem key={m.value} value={m.value}>
              {m.label}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" select label="Refresh rate" value={refreshMs} onChange={(e) => onRefreshMsChange(Number(e.target.value))} sx={{ minWidth: 140 }}>
          {REFRESH_CHOICES.map((c) => (
            <MenuItem key={c.ms} value={c.ms}>
              {c.label}
            </MenuItem>
          ))}
        </TextField>
        <FormControlLabel control={<Checkbox checked={prefs.hideDone} onChange={(e) => update({ hideDone: e.target.checked })} />} label="Hide finished cases" />
        <Box sx={{ flex: 1 }} />
        <Button size="small" startIcon={<RefreshIcon />} onClick={onRefresh}>
          Refresh
        </Button>
      </Stack>

      <Typography variant="h6" sx={{ mb: 1 }}>
        Status Board · {usDate(date)} · {shown.length} {shown.length === 1 ? "case" : "cases"}
      </Typography>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 1.5 }} aria-label="Status legend">
        {LEGEND_ORDER.map((s) => (
          <Box key={s} sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 13 }}>
            <Box sx={{ width: 14, height: 14, borderRadius: 0.5, backgroundColor: STATUS_META[s].bg, border: `1px solid ${STATUS_META[s].border}` }} />
            {STATUS_META[s].label} ({counts[s]})
          </Box>
        ))}
      </Box>

      <Table size="small" aria-label="Surgery status board" sx={{ "& td, & th": { fontSize, py: fontSize / 4, whiteSpace: "nowrap" }, backgroundColor: "background.paper" }}>
        <TableHead>
          <TableRow>
            {["Date", "Room", "Time", "Case ID", "Patient Name", "Procedures", "Case Provider", "Status"].map((h) => (
              <TableCell key={h}>{h}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {shown.map((r) => {
            const meta = STATUS_META[r.status];
            return (
              <TableRow key={r.id} data-status={r.status}>
                <TableCell>{usDate(r.date)}</TableCell>
                <TableCell>
                  {r.room?.name || "Unassigned"}
                  {r.bed && <Typography variant="caption" component="div" color="text.secondary">{`Bed ${r.bed.path}`}</Typography>}
                </TableCell>
                <TableCell>{r.time}</TableCell>
                <TableCell>{r.case_number}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{boardName(r.patient.name, prefs.names)}</TableCell>
                <TableCell sx={{ whiteSpace: "normal !important", minWidth: 260 }}>{r.procedures_text}</TableCell>
                <TableCell>{r.surgeon?.name || ""}</TableCell>
                <TableCell sx={{ backgroundColor: meta.bg, color: meta.fg, fontWeight: 600, borderLeft: `6px solid ${meta.border}` }}>{r.status_label}</TableCell>
              </TableRow>
            );
          })}
          {shown.length === 0 && (
            <TableRow>
              <TableCell colSpan={8}>
                <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                  {rows.length === 0 ? "No cases booked for this day." : "Every case today is finished."}
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );
}
