import { useEffect, useMemo, useState, useCallback } from "react";
import {
  alpha,
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../../config/api";

const TABS = [
  { key: "available", label: "Available" },
  { key: "time_off", label: "On time off" },
  { key: "no_schedule", label: "No recurring schedule" },
  { key: "working", label: "Working" },
];

const SHIFT_SHORT = { day: "Day", evening: "Eve", night: "Night", custom: "Custom" };

export const addDaysISO = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  const pad = (x) => String(x).padStart(2, "0");
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
};

function localISO() {
  const n = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${n.getFullYear()}-${pad(n.getMonth() + 1)}-${pad(n.getDate())}`;
}

export const prettyDate = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
};

export function statusText(p) {
  const d = p.detail || {};
  if (p.state === "time_off") {
    if (d.kind === "emergency") return "Called out";
    return d.pending ? "Time off requested (pending)" : "Approved time off";
  }
  if (p.state === "working") {
    return (d.shifts || [])
      .map((s) => `${SHIFT_SHORT[s.shift_type] || s.shift_label}${s.unit_name ? ` · ${s.unit_name}` : ""}`)
      .join(", ");
  }
  if (p.state === "no_schedule") return "No recurring schedule";
  return "Free";
}

function PersonRow({ p, canAssign, onAssign, onReview }) {
  const pct = Math.min(100, Math.round((p.week_hours / (p.weekly_cap || 36)) * 100));
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1.5}
      alignItems={{ sm: "center" }}
      sx={{ py: 1.25, borderBottom: 1, borderColor: "divider" }}
      data-testid="assign-person"
    >
      <Box sx={{ flex: "1 1 220px", minWidth: 0 }}>
        <Typography sx={{ fontWeight: 600 }}>
          {p.name} <Typography component="span" color="text.secondary">({p.role})</Typography>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {statusText(p)}
        </Typography>
      </Box>
      <Box sx={{ flex: "0 0 140px" }}>
        <Typography variant="caption" color={p.overtime ? "error.main" : "text.secondary"}>
          {p.week_hours}h of {p.weekly_cap}h this week{p.overtime ? " · overtime" : ""}
        </Typography>
        <Box sx={{ height: 6, borderRadius: 3, bgcolor: "action.hover", overflow: "hidden" }}>
          <Box sx={{ width: `${pct}%`, height: "100%", bgcolor: p.overtime ? "error.main" : "primary.main" }} />
        </Box>
      </Box>
      <Stack direction="row" spacing={1} alignItems="center" sx={{ flex: "0 0 auto" }}>
        {p.fits_gap && <Chip size="small" color="success" variant="outlined" label="Fits a gap" />}
        {canAssign && (
          <Button size="small" variant="contained" sx={{ minHeight: 36 }} onClick={() => onAssign(p)}>
            Assign
          </Button>
        )}
        {p.state === "time_off" && p.detail && p.detail.pending && (
          <Button size="small" variant="outlined" sx={{ minHeight: 36 }} onClick={onReview}>
            Review request
          </Button>
        )}
      </Stack>
    </Stack>
  );
}

export default function WhoCanBeAssigned({ token, units = [], onAssign, onReviewTimeOff, reloadKey = 0, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const [date, setDate] = useState(localISO());
  const [unit, setUnit] = useState("");
  const [role, setRole] = useState("all");
  const [tab, setTab] = useState("available");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(apiEndpoints.staffingAvailability, {
        headers: getAuthHeaders(token),
        params: { date, ...(unit ? { unit } : {}) },
      });
      setData(res.data);
    } catch (e) {
      setError("Couldn't load who can be assigned.");
    } finally {
      setLoading(false);
    }
  }, [token, date, unit]);

  useEffect(() => {
    if (open) load();
  }, [open, load, reloadKey]);

  const people = useMemo(() => (data ? data.people : []), [data]);
  const inRole = useMemo(() => people.filter((p) => role === "all" || p.role === role), [people, role]);
  const shown = useMemo(() => inRole.filter((p) => p.state === tab), [inRole, tab]);
  const tabCounts = useMemo(() => {
    const c = { available: 0, time_off: 0, no_schedule: 0, working: 0 };
    inRole.forEach((p) => {
      c[p.state] += 1;
    });
    return c;
  }, [inRole]);

  const gapUnit = unit ? unit : null;
  const assign = (p) => {
    const gap = (data && data.gaps ? data.gaps : []).find(
      (g) => (!g.role || g.role === p.nursing_role) && (!gapUnit || String(g.unit_id) === String(gapUnit))
    );
    onAssign({
      staff_id: p.id,
      date,
      unit_id: gap ? gap.unit_id : unit || "",
      shift_type: gap ? gap.shift_type : "day",
    });
  };

  const total = data ? data.counts.available + data.counts.no_schedule : 0;

  return (
    <Paper variant="outlined" sx={{ mb: 2, borderColor: "primary.main" }}>
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        spacing={1}
        sx={{ p: 1.75, bgcolor: (th) => alpha(th.palette.primary.main, 0.06) }}
      >
        <Box>
          <Typography sx={{ fontWeight: 700 }}>Who can be assigned</Typography>
          <Typography variant="body2" color="text.secondary">
            {data ? `${total} free on ${prettyDate(date)}` : "Check who is free, off or already working"}
          </Typography>
        </Box>
        <Button onClick={() => setOpen((o) => !o)} aria-expanded={open} sx={{ minHeight: 44 }}>
          {open ? "Hide" : "Show"}
        </Button>
      </Stack>
      <Collapse in={open}>
        <Box sx={{ p: 1.75 }}>
          <Stack direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap" sx={{ mb: 1.5 }}>
            <IconButton aria-label="Previous day" onClick={() => setDate(addDaysISO(date, -1))}>
              ‹
            </IconButton>
            <Typography sx={{ fontWeight: 600, minWidth: 110, textAlign: "center" }}>{prettyDate(date)}</Typography>
            <IconButton aria-label="Next day" onClick={() => setDate(addDaysISO(date, 1))}>
              ›
            </IconButton>
            <Button size="small" onClick={() => setDate(localISO())}>
              Today
            </Button>
            <TextField
              select
              size="small"
              label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              sx={{ minWidth: 160 }}
            >
              <MenuItem value="">All units</MenuItem>
              {units.map((u) => (
                <MenuItem key={u.id} value={String(u.id)}>
                  {u.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 1 }} role="group" aria-label="Filter by role">
            <Chip
              label={`All ${people.length}`}
              color={role === "all" ? "primary" : "default"}
              onClick={() => setRole("all")}
            />
            {(data ? data.roles : []).map((r) => (
              <Chip
                key={r.role}
                label={`${r.role} ${r.count}`}
                color={role === r.role ? "primary" : "default"}
                onClick={() => setRole(r.role)}
              />
            ))}
          </Stack>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ mb: 1 }}>
            {TABS.map((t) => (
              <Tab key={t.key} value={t.key} label={`${t.label} (${tabCounts[t.key]})`} />
            ))}
          </Tabs>

          {error && (
            <Alert severity="error" action={<Button onClick={load}>Retry</Button>}>
              {error}
            </Alert>
          )}
          {loading && !data && (
            <Box sx={{ p: 2, textAlign: "center" }} role="status" aria-label="Loading">
              <CircularProgress size={22} />
            </Box>
          )}
          {data && shown.length === 0 && !error && (
            <Box sx={{ py: 2 }}>
              <Typography color="text.secondary">
                {role !== "all" ? `No ${role} in "${TABS.find((t) => t.key === tab).label}" on ${prettyDate(date)}.` : `Nobody in "${TABS.find((t) => t.key === tab).label}" on ${prettyDate(date)}.`}
              </Typography>
              {role !== "all" && (
                <Button size="small" onClick={() => setRole("all")}>
                  Show all roles
                </Button>
              )}
            </Box>
          )}
          {shown.map((p) => (
            <PersonRow
              key={p.id}
              p={p}
              canAssign={p.state === "available" || p.state === "no_schedule"}
              onAssign={assign}
              onReview={onReviewTimeOff}
            />
          ))}
        </Box>
      </Collapse>
    </Paper>
  );
}
