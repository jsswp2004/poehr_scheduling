import { useMemo } from "react";
import { Box, Tooltip, Typography } from "@mui/material";
import { LEGEND_ORDER, STATUS_META, assignLanes, barGeometry, clock, hourLabel } from "./surgeryUtils";

const LABEL_W = 120;
const LANE_H = 30;

/** The Day Planner: one row per operating room, one bar per case, positioned by its time. */
export default function DayPlannerTab({ planner, selectedId, onSelect, onOpen }) {
  const { date, day_start: dayStart, day_end: dayEnd, rooms, unassigned, legend } = planner;
  const hours = useMemo(() => Array.from({ length: dayEnd - dayStart }, (_, i) => dayStart + i), [dayStart, dayEnd]);
  const counts = Object.fromEntries(legend.map((l) => [l.status, l.count]));
  const unassignedRow = unassigned.length ? [{ id: "none", name: "No room yet", cases: unassigned }] : [];

  const bar = (b, lane) => {
    const meta = STATUS_META[b.status];
    const g = barGeometry(b, date, dayStart, dayEnd);
    const picked = b.id === selectedId;
    return (
      <Tooltip
        key={b.id}
        title={`${b.label} · ${clock(b.scheduled_start)}-${clock(b.scheduled_end)}${b.overlap ? " · overlaps another case" : ""}`}
      >
        <Box
          role="button"
          tabIndex={0}
          aria-label={`Case ${b.case_number}`}
          onClick={() => onSelect(b.id)}
          onDoubleClick={() => onOpen(b.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onOpen(b.id);
            if (e.key === " ") {
              e.preventDefault();
              onSelect(b.id);
            }
          }}
          sx={{
            position: "absolute",
            top: lane * LANE_H + 3,
            height: LANE_H - 6,
            left: `${g.left}%`,
            width: `${g.width}%`,
            px: 0.75,
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            fontSize: 12,
            lineHeight: `${LANE_H - 8}px`,
            borderRadius: 0.75,
            cursor: "pointer",
            backgroundColor: meta.bg,
            color: meta.fg,
            border: `${picked ? 2 : 1}px solid ${b.overlap ? "#dc2626" : meta.border}`,
            outline: picked ? "2px solid #0f172a" : "none",
            outlineOffset: 1,
          }}
        >
          {b.label}
        </Box>
      </Tooltip>
    );
  };

  return (
    <Box>
      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 2, overflow: "auto", backgroundColor: "background.paper" }}>
        <Box sx={{ minWidth: 900 }}>
          <Box sx={{ display: "flex", position: "sticky", top: 0, zIndex: 2, backgroundColor: "background.paper", borderBottom: "1px solid", borderColor: "divider" }}>
            <Box sx={{ width: LABEL_W, flexShrink: 0 }} />
            <Box sx={{ position: "relative", flex: 1, height: 30 }}>
              {hours.map((h, i) => (
                <Typography
                  key={h}
                  variant="caption"
                  sx={{ position: "absolute", left: `${(i / hours.length) * 100}%`, top: 6, pl: 0.5, color: "text.secondary", fontWeight: 600 }}
                >
                  {hourLabel(h)}
                </Typography>
              ))}
            </Box>
          </Box>
          {[...rooms, ...unassignedRow].map((room) => {
            const { bars, lanes } = assignLanes(room.cases);
            return (
              <Box key={room.id} data-testid={`planner-row-${room.name}`} sx={{ display: "flex", borderBottom: "1px solid", borderColor: "divider" }}>
                <Box sx={{ width: LABEL_W, flexShrink: 0, px: 1, display: "flex", alignItems: "center", fontSize: 13, fontWeight: 600, backgroundColor: "#f8fafc", borderRight: "1px solid", borderColor: "divider" }}>
                  {room.name}
                </Box>
                <Box sx={{ position: "relative", flex: 1, height: lanes * LANE_H }}>
                  {hours.map((h, i) => (
                    <Box key={h} sx={{ position: "absolute", top: 0, bottom: 0, left: `${(i / hours.length) * 100}%`, borderLeft: "1px solid", borderColor: "divider" }} />
                  ))}
                  {bars.map((b) => bar(b, b.lane))}
                </Box>
              </Box>
            );
          })}
          {rooms.length === 0 && unassignedRow.length === 0 && (
            <Typography color="text.secondary" sx={{ p: 3, textAlign: "center" }}>
              No operating rooms are set up for this facility yet. An administrator can add them with Manage Rooms.
            </Typography>
          )}
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mt: 1.5 }} aria-label="Status legend">
        {LEGEND_ORDER.map((s) => (
          <Box key={s} sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 13 }}>
            <Box sx={{ width: 14, height: 14, borderRadius: 0.5, backgroundColor: STATUS_META[s].bg, border: `1px solid ${STATUS_META[s].border}` }} />
            {STATUS_META[s].label} ({counts[s] || 0})
          </Box>
        ))}
      </Box>
    </Box>
  );
}
