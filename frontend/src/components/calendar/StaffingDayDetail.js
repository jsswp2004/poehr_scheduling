import { Alert, Box, Chip, LinearProgress, Stack, Typography } from "@mui/material";
import { COVERAGE_STATUS } from "../../pages/staffingCoverage";

/**
 * The body of the Staffing calendar's day dialog ("Coverage Status"), laid out as tiles:
 * a Census header with one tile per unit, then a Coverage header with one tile per unit that
 * lists its shifts. Units that fall short come first. Nothing here changes the numbers; it
 * shows what the server's coverage calculation already returned for the day.
 */
const RANK = { not_met: 0, at_risk: 1, unknown: 2, no_standard: 3, met: 4 };
const ROLE_LABELS = { rn: "RN", lpn: "LPN", cna: "CNA", other: "Other" };
const fmtHrs = (h) => (Math.round(Number(h) * 10) / 10).toString();
const rankOf = (status) => (status in RANK ? RANK[status] : 3);

export function groupByUnit(items) {
  const byUnit = new Map();
  (items || []).forEach((it) => {
    const unit = it.unit_name || "Whole organization";
    if (!byUnit.has(unit)) byUnit.set(unit, []);
    byUnit.get(unit).push(it);
  });
  return [...byUnit.entries()]
    .map(([unit, list]) => ({
      unit,
      items: list,
      worst: list.reduce((w, it) => (rankOf(it.status) < rankOf(w) ? it.status : w), list[0].status),
    }))
    .sort((a, b) => rankOf(a.worst) - rankOf(b.worst) || a.unit.localeCompare(b.unit));
}

function StatusChip({ status }) {
  const m = COVERAGE_STATUS[status];
  if (!m) return null;
  return <Chip size="small" label={`${m.icon} ${m.label}`} sx={{ bgcolor: m.bg, color: m.color, fontWeight: 600 }} />;
}

const tileSx = (bad) => ({
  border: "1px solid",
  borderColor: bad ? "error.main" : "divider",
  borderRadius: 1.5,
  p: 1.25,
  minWidth: 0,
  bgcolor: "background.paper",
});

function ShiftBlock({ it, rule, first }) {
  const m = COVERAGE_STATUS[it.status];
  const hasNeed = it.required_hours > 0;
  const pct = hasNeed ? Math.min(100, Math.round(((it.hours_scheduled ?? 0) / it.required_hours) * 100)) : null;
  return (
    <Box sx={{ borderTop: first ? 0 : "1px solid", borderColor: "divider", pt: first ? 0 : 1, mt: first ? 0 : 1 }}>
      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
        <Typography variant="subtitle2">{it.shift_label || "All day"}</Typography>
        <StatusChip status={it.status} />
      </Stack>
      {pct != null && (
        <LinearProgress
          variant="determinate"
          value={pct}
          aria-label={`${pct}% of the care hours needed are scheduled`}
          sx={{ my: 0.75, height: 6, borderRadius: 3, "& .MuiLinearProgress-bar": { bgcolor: m?.color } }}
        />
      )}
      {it.status !== "unknown" && it.status !== "no_standard" && (
        <Typography variant="body2">
          Staff scheduled: {it.assigned} (need {it.required}
          {it.shift_hours != null ? ` full ${fmtHrs(it.shift_hours)}-hr shifts` : ""})
          {it.required_hours != null && ` · Care hours: ${it.hours_scheduled ?? 0} of ${Math.round(it.required_hours * 10) / 10} needed for this shift`}
          {it.required_rn != null && ` · RNs in facility: ${it.rn_scheduled ?? 0} (need ${it.required_rn})`}
        </Typography>
      )}
      {it.census != null && it.required_hours != null && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          Census {it.census}
          {rule?.hppd_min != null && ` × ${rule.hppd_min} = ${fmtHrs(it.census * rule.hppd_min)} hrs/day; this shift carries ${fmtHrs(it.required_hours)} of them`}
        </Typography>
      )}
      {it.shift_hours != null && it.assigned > 0 && Math.abs(it.hours_scheduled / it.assigned - it.shift_hours) > 0.01 && (
        <Typography variant="caption" color="warning.main" sx={{ display: "block" }}>
          The {it.assigned} scheduled average {fmtHrs(it.hours_scheduled / it.assigned)} hrs each, but this unit's {it.shift_label} shift is{" "}
          {fmtHrs(it.shift_hours)} hrs, so they supply fewer care hours than the requirement assumes. Check the shift start/end times.
        </Typography>
      )}
      {it.on_call?.length > 0 && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          On call: {it.on_call.map((o) => `${o.name}${ROLE_LABELS[o.role] ? ` · ${ROLE_LABELS[o.role]}` : ""} (${fmtHrs(o.hours)} hrs)`).join(", ")}.
          On-call time is ad hoc: it can lift a short shift to amber but never makes it green.
        </Typography>
      )}
      {(it.reasons || []).map((r) => (
        <Typography key={r} variant="body2" sx={{ color: m?.color }}>
          {r}
        </Typography>
      ))}
      {it.note && (
        <Typography variant="caption" color="text.secondary">
          {it.note}
        </Typography>
      )}
    </Box>
  );
}

export default function StaffingDayDetail({ day, census, rule }) {
  if (!day || !day.items || day.items.length === 0) {
    return (
      <Typography color="text.secondary">
        No coverage requirements apply to this day. Add a coverage requirement on the Assign Schedule tab, or enter a unit census so
        state rules can be calculated.
      </Typography>
    );
  }
  const units = groupByUnit(day.items);
  const anyCarried = census.some((c) => c.carried);
  return (
    <Stack spacing={2.5}>
      {day.open_emergencies > 0 && (
        <Alert severity="error">{day.open_emergencies} emergency call-out(s) waiting for cover. See the Time Off tab.</Alert>
      )}
      {day.pending_requests > 0 && <Alert severity="warning">{day.pending_requests} pending time-off request(s) this day.</Alert>}

      {census.length > 0 && (
        <Box component="section" aria-label="Census">
          <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ mb: 1 }}>
            <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
              Census
            </Typography>
            {rule?.hppd_min != null && (
              <Typography variant="caption" color="text.secondary">
                care hours = residents × {rule.hppd_min} nursing hrs per resident per day
              </Typography>
            )}
          </Stack>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))", gap: 1.25 }}>
            {census.map((c) => (
              <Box key={c.unit_name} sx={tileSx(false)}>
                <Typography variant="subtitle2">{c.unit_name}</Typography>
                <Typography sx={{ fontSize: 24, fontWeight: 600, lineHeight: 1.1 }}>
                  {c.census}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.5 }}>
                    resident{c.census === 1 ? "" : "s"}
                  </Typography>
                </Typography>
                {c.hppd != null && (
                  <Typography variant="body2" color="text.secondary">
                    {fmtHrs(c.census * c.hppd)} care hrs for the day
                  </Typography>
                )}
                {c.carried && <Chip size="small" color="warning" variant="outlined" label="Carried forward" sx={{ mt: 0.75, height: 20, fontSize: 11 }} />}
              </Box>
            ))}
          </Box>
          {anyCarried && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.75 }}>
              Carried forward: no census was entered for this date, so the last one entered is used.
            </Typography>
          )}
        </Box>
      )}

      <Box component="section" aria-label="Coverage by unit">
        <Stack direction="row" spacing={1.5} alignItems="baseline" sx={{ mb: 1 }}>
          <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700 }}>
            Coverage by unit
          </Typography>
          <Typography variant="caption" color="text.secondary">
            units that fall short come first
          </Typography>
        </Stack>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 1.25 }}>
          {units.map((u) => (
            <Box key={u.unit} sx={tileSx(u.worst === "not_met")}>
              <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {u.unit}
                </Typography>
                <StatusChip status={u.worst} />
              </Stack>
              {u.items.map((it, i) => (
                <ShiftBlock key={`${it.shift_label}-${i}`} it={it} rule={rule} first={i === 0} />
              ))}
            </Box>
          ))}
        </Box>
      </Box>
    </Stack>
  );
}
