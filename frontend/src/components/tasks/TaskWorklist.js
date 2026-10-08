import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Chip, IconButton, MenuItem, Stack, TextField, Typography } from "@mui/material";
import MedicationIcon from "@mui/icons-material/Medication";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { PrnDialog, TaskActionDialog, TaskDetailDialog } from "./TaskDialogs";
import TaskGrid, { DUE_BG, OVERDUE_BG } from "./TaskGrid";
import { authHeader, errorText, loadTaskMeta } from "./taskShared";

const PAGE_SIZE = 200;
const MAX_PAGES = 5;
const REFRESH_MS = 60000;

const midnight = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const dayInput = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromDayInput = (v) => {
  const [y, m, d] = (v || "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
};

/**
 * The nurse worklist as one day grid: the tasks down the left, the hours of the day across the top, and each task
 * in the hour it is due -- green when due, pink when overdue, red when missed, a check and initials when done.
 * With `patient` it is that patient's grid (the chart tab); without, the whole clinic (the Tasks page).
 * The server decides what each person may see and do; this screen shows it and relays its messages.
 */
export default function TaskWorklist({ patient = null }) {
  const scoped = !!patient;
  const [meta, setMeta] = useState(null);
  const [day, setDay] = useState(() => midnight());
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [assigned, setAssigned] = useState("");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState("");
  const [act, setAct] = useState(null); // { task, action }
  const [openId, setOpenId] = useState(null);
  const [prn, setPrn] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        setMeta(await loadTaskMeta());
      } catch (err) {
        if (err?.response?.status === 403) setDenied(true);
      }
    })();
  }, []);

  const dayKey = day.getTime();
  const load = useCallback(
    async (quiet = false) => {
      const mine = ++seq.current;
      if (!quiet) setLoading(true);
      setError("");
      try {
        const headers = await authHeader();
        const base = patient ? { patient: patient.id } : {};
        const from = new Date(dayKey);
        const params = { ...base, queue: "grid", from: from.toISOString(), to: addDays(from, 1).toISOString(), page_size: PAGE_SIZE };
        // anything still waiting or missed from before today stays visible from today on
        if (dayKey >= midnight().getTime()) params.include_earlier = 1;
        if (q.trim()) params.q = q.trim();
        if (type) params.task_type = type;
        if (assigned) params.assigned = assigned;
        const all = [];
        for (let page = 1; page <= MAX_PAGES; page += 1) {
          const list = await api.get(apiEndpoints.orderTasks, { headers, params: { ...params, page } });
          const got = list.data.results || [];
          all.push(...got);
          if (all.length >= (list.data.count || 0) || got.length === 0) break;
        }
        const qs = await api.get(apiEndpoints.orderTaskQueues, { headers, params: base });
        if (mine !== seq.current) return;
        setRows(all);
        setCounts(qs.data.counts || {});
        setDenied(false);
      } catch (err) {
        if (mine !== seq.current) return;
        if (err?.response?.status === 403) setDenied(true);
        else setError(errorText(err, "Could not load the tasks."));
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    },
    [patient, dayKey, q, type, assigned]
  );

  useEffect(() => {
    const timer = setTimeout(load, q ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, q]);

  useEffect(() => {
    const refresh = () => load(true);
    window.addEventListener("tasks-changed", refresh);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      window.removeEventListener("tasks-changed", refresh);
      clearInterval(timer);
    };
  }, [load]);

  if (denied) {
    return (
      <Alert severity="info" sx={{ m: 2 }} data-testid="tasks-denied">
        Tasks are available to nurses, doctors and administrators.
      </Alert>
    );
  }

  const canPerform = !!meta?.can_perform;
  const today = midnight();
  const isToday = day.getTime() === today.getTime();
  const overdue = counts.overdue || 0;
  const dueNow = Math.max(0, (counts.needs_action || 0) - overdue);
  const missed = counts.missed || 0;
  const dayLabel = day.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", year: "numeric" });

  return (
    <Box sx={{ p: 2 }} data-testid="task-worklist">
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="h6">{scoped ? `Tasks — ${patient.name}` : "Task Manager"}</Typography>
        {scoped && canPerform && (
          <Button variant="outlined" startIcon={<MedicationIcon />} onClick={() => setPrn(true)} data-testid="task-prn">
            Give as-needed dose
          </Button>
        )}
      </Stack>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} alignItems={{ md: "center" }} sx={{ my: 1.5 }}>
        <Stack direction="row" spacing={0.5} alignItems="center">
          <IconButton size="small" aria-label="Previous day" onClick={() => setDay(addDays(day, -1))} data-testid="day-prev">
            <ChevronLeftIcon />
          </IconButton>
          <TextField
            size="small"
            type="date"
            value={dayInput(day)}
            onChange={(e) => {
              const d = fromDayInput(e.target.value);
              if (d) setDay(d);
            }}
            inputProps={{ "aria-label": "Day", "data-testid": "day-input" }}
          />
          <IconButton size="small" aria-label="Next day" onClick={() => setDay(addDays(day, 1))} data-testid="day-next">
            <ChevronRightIcon />
          </IconButton>
          <Button size="small" onClick={() => setDay(today)} disabled={isToday} data-testid="day-today">
            Today
          </Button>
        </Stack>
        <TextField
          size="small"
          label="Search"
          placeholder={scoped ? "Medication or task" : "Patient, medication or task"}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          inputProps={{ "data-testid": "task-search" }}
          sx={{ minWidth: 240 }}
        />
        <TextField select size="small" label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ minWidth: 150 }} inputProps={{ "data-testid": "task-filter-type" }}>
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="medication">Medications</MenuItem>
          <MenuItem value="nursing">Nursing</MenuItem>
        </TextField>
        {!scoped && (
          <TextField select size="small" label="Patients" value={assigned} onChange={(e) => setAssigned(e.target.value)} sx={{ minWidth: 170 }} inputProps={{ "data-testid": "task-filter-assigned" }}>
            <MenuItem value="">All patients</MenuItem>
            <MenuItem value="me">Assigned to me</MenuItem>
          </TextField>
        )}
      </Stack>

      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }} data-testid="task-legend">
        <Typography variant="subtitle2" sx={{ mr: 1 }}>
          {dayLabel}
        </Typography>
        <Chip size="small" label={`Due now ${dueNow}`} sx={{ bgcolor: DUE_BG }} data-testid="legend-due" />
        <Chip size="small" label={`Overdue ${overdue}`} sx={{ bgcolor: OVERDUE_BG }} data-testid="legend-overdue" />
        <Chip size="small" variant="outlined" label={`Missed ${missed}`} sx={{ color: "#d32f2f", fontWeight: 700, borderColor: "#d32f2f" }} data-testid="legend-missed" />
        <Typography variant="caption" color="text.secondary">
          ✓ initials = done
        </Typography>
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      <TaskGrid
        rows={rows}
        day={day}
        showEarlier={dayKey >= today.getTime()}
        loading={loading}
        scoped={scoped}
        canPerform={canPerform}
        graceMinutes={meta?.grace_minutes ?? 60}
        onOpen={setOpenId}
        onChanged={() => load(true)}
        onMore={(task, action) => setAct({ task, action })}
      />

      {act && (
        <TaskActionDialog
          task={act.task}
          action={act.action}
          graceMinutes={meta?.grace_minutes ?? 60}
          onClose={() => setAct(null)}
          onDone={() => {
            setAct(null);
            load(true);
          }}
        />
      )}
      {openId && <TaskDetailDialog taskId={openId} canNote={canPerform} onClose={() => setOpenId(null)} onChanged={() => load(true)} />}
      {prn && patient && (
        <PrnDialog
          patient={patient}
          onClose={() => setPrn(false)}
          onDone={() => {
            setPrn(false);
            load(true);
          }}
        />
      )}
    </Box>
  );
}
