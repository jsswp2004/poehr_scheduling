import React from "react";
import { Box, Button, Typography } from "@mui/material";
import { summarize, apptState } from "../../utils/calendar/calendarSummary";

const STATE_COLORS = { arrived: "#16a34a", scheduled: "#93b4f5", pending: "#f59e0b", no_show: "#ef4444" };

export function StatusBar({ stats }) {
  const parts = ["arrived", "scheduled", "pending", "no_show"].filter((k) => stats[k] > 0);
  return (
    <Box sx={{ display: "flex", height: 6, borderRadius: 3, overflow: "hidden", bgcolor: "#eef1f6" }} aria-hidden="true">
      {parts.map((k) => (
        <Box key={k} sx={{ flex: stats[k], bgcolor: STATE_COLORS[k] }} />
      ))}
    </Box>
  );
}

const timeOf = (a) => new Date(a.appointment_datetime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/**
 * Right-hand panel of the month view: the selected day's totals, the split by provider and
 * what is coming up. `appts` are the day's appointment records.
 */
export default function DaySummaryPanel({ date, appts, colors, onOpenDay, onNew, onOpenAppointment }) {
  const stats = summarize(appts);
  const max = Math.max(1, ...stats.byProvider.map((p) => p.count));
  const now = Date.now();
  const upcoming = [...appts]
    .filter((a) => apptState(a) !== "cancelled" && new Date(a.appointment_datetime).getTime() >= now)
    .sort((a, b) => new Date(a.appointment_datetime) - new Date(b.appointment_datetime))
    .slice(0, 5);
  return (
    <Box
      component="aside"
      aria-label="Day summary"
      data-testid="day-summary"
      sx={{ width: 280, flexShrink: 0, border: "1px solid #e2e8f0", borderRadius: "10px", p: 2, overflow: "auto", alignSelf: "stretch", bgcolor: "#fff" }}
    >
      <Typography sx={{ fontWeight: 600, fontSize: 15 }}>{date.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" })}</Typography>
      <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75, mt: 0.5 }}>
        <Typography component="span" data-testid="day-total" sx={{ fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>
          {stats.total}
        </Typography>
        <Typography component="span" variant="body2" color="text.secondary">
          {stats.total === 1 ? "appointment" : "appointments"}
        </Typography>
      </Box>
      <Box sx={{ my: 1 }}>
        <StatusBar stats={stats} />
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25, mt: 0.75, fontSize: 12, color: "text.secondary" }}>
          {stats.arrived > 0 && <span>{stats.arrived} arrived</span>}
          {stats.scheduled > 0 && <span>{stats.scheduled} scheduled</span>}
          {stats.pending > 0 && <span style={{ color: "#b45309" }}>{stats.pending} pending</span>}
          {stats.no_show > 0 && <span style={{ color: "#c0261d" }}>{stats.no_show} no-show</span>}
          {stats.cancelled > 0 && <span>{stats.cancelled} cancelled</span>}
        </Box>
      </Box>
      {stats.byProvider.map((p) => (
        <Box key={String(p.id ?? p.name)} sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.75, fontSize: 13 }}>
          <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: colors[String(p.id)] || "#94a3b8", flexShrink: 0 }} />
          <Box sx={{ width: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</Box>
          <Box sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: "#eef1f6", overflow: "hidden" }}>
            <Box sx={{ height: 6, width: `${(p.count / max) * 100}%`, bgcolor: colors[String(p.id)] || "#94a3b8" }} />
          </Box>
          <b style={{ width: 22, textAlign: "right" }}>{p.count}</b>
        </Box>
      ))}
      {upcoming.length > 0 && (
        <Box sx={{ mt: 1.5 }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: "text.secondary", textTransform: "uppercase", letterSpacing: "0.04em", mb: 0.5 }}>Next up</Typography>
          {upcoming.map((a) => (
            <Box
              key={a.id}
              role="button"
              tabIndex={0}
              onClick={() => onOpenAppointment(a)}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpenAppointment(a)}
              sx={{ display: "flex", gap: 1, py: 0.5, borderTop: "1px solid #eef1f6", fontSize: 13, cursor: "pointer", "&:hover": { bgcolor: "#f8fafc" } }}
            >
              <Box sx={{ width: 62, fontWeight: 600 }}>{timeOf(a)}</Box>
              <Box sx={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.patient_name || "Patient"}</Box>
            </Box>
          ))}
        </Box>
      )}
      <Box sx={{ display: "flex", gap: 1, mt: 2 }}>
        <Button variant="contained" size="small" onClick={onOpenDay} sx={{ textTransform: "none", fontWeight: 600 }}>
          Open day
        </Button>
        <Button variant="outlined" size="small" onClick={onNew} sx={{ textTransform: "none" }}>
          + New appointment
        </Button>
      </Box>
    </Box>
  );
}
