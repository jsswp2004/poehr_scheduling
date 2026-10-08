import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import MedicationIcon from "@mui/icons-material/Medication";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { PrnDialog, TaskActionDialog, TaskDetailDialog } from "./TaskDialogs";
import TaskGrid from "./TaskGrid";
import { STATUS_COLOR, authHeader, errorText, fmtDateTime, fmtTime, loadTaskMeta } from "./taskShared";

const PAGE_SIZE = 50;
const REFRESH_MS = 60000;

/**
 * The nurse worklist: queue tabs with counts, filters and a table, with Give / Hold / Refuse on each row.
 * With `patient` it is that patient's task list (the chart tab); without, the whole clinic (the Tasks page).
 * The server decides what each person may see and do; this screen shows it and relays its messages.
 */
export default function TaskWorklist({ patient = null }) {
  const scoped = !!patient;
  const [meta, setMeta] = useState(null);
  const [queue, setQueue] = useState(scoped ? "all" : "needs_action");
  const [counts, setCounts] = useState({});
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
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

  const load = useCallback(
    async (quiet = false) => {
      const mine = ++seq.current;
      if (!quiet) setLoading(true);
      setError("");
      try {
        const headers = await authHeader();
        const base = patient ? { patient: patient.id } : {};
        const params = { ...base, queue, page, page_size: PAGE_SIZE };
        if (q.trim()) params.q = q.trim();
        if (type) params.task_type = type;
        if (assigned) params.assigned = assigned;
        const [list, qs] = await Promise.all([
          api.get(apiEndpoints.orderTasks, { headers, params }),
          api.get(apiEndpoints.orderTaskQueues, { headers, params: base }),
        ]);
        if (mine !== seq.current) return;
        setRows(list.data.results || []);
        setTotal(list.data.count || 0);
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
    [patient, queue, page, q, type, assigned]
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

  const queues = meta?.queues || [];
  const canPerform = !!meta?.can_perform;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cols = scoped ? 6 : 7;

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

      <Tabs
        value={queues.some((x) => x.value === queue) ? queue : false}
        onChange={(_, v) => {
          setQueue(v);
          setPage(1);
        }}
        variant="scrollable"
        scrollButtons="auto"
        sx={{ minHeight: 36, borderBottom: 1, borderColor: "divider", "& .MuiTab-root": { minHeight: 36, py: 0.5, textTransform: "none" } }}
        aria-label="Task queues"
      >
        {queues.map((x) => (
          <Tab key={x.value} value={x.value} data-testid={`task-queue-${x.value}`} label={`${x.label}${counts[x.value] != null && x.value !== "all" ? ` (${counts[x.value]})` : ""}`} />
        ))}
      </Tabs>

      <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ my: 1.5 }}>
        <TextField
          size="small"
          label="Search"
          placeholder={scoped ? "Medication or task" : "Patient, medication or task"}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(1);
          }}
          inputProps={{ "data-testid": "task-search" }}
          sx={{ minWidth: 240 }}
        />
        <TextField select size="small" label="Type" value={type} onChange={(e) => { setType(e.target.value); setPage(1); }} sx={{ minWidth: 150 }} inputProps={{ "data-testid": "task-filter-type" }}>
          <MenuItem value="">Any</MenuItem>
          <MenuItem value="medication">Medications</MenuItem>
          <MenuItem value="nursing">Nursing</MenuItem>
        </TextField>
        {!scoped && (
          <TextField select size="small" label="Patients" value={assigned} onChange={(e) => { setAssigned(e.target.value); setPage(1); }} sx={{ minWidth: 170 }} inputProps={{ "data-testid": "task-filter-assigned" }}>
            <MenuItem value="">All patients</MenuItem>
            <MenuItem value="me">Assigned to me</MenuItem>
          </TextField>
        )}
      </Stack>

      {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}

      {queue === "completed" ? (
        <TaskGrid
          rows={rows}
          loading={loading}
          scoped={scoped}
          canPerform={canPerform}
          graceMinutes={meta?.grace_minutes ?? 60}
          onOpen={setOpenId}
          onChanged={() => load(true)}
          onMore={(task) => setAct({ task, action: "complete" })}
        />
      ) : (
      <TableContainer component={Paper} variant="outlined">
        <Table size="small" aria-label="Tasks">
          <TableHead>
            <TableRow>
              <TableCell>Due</TableCell>
              {!scoped && <TableCell>Patient / bed</TableCell>}
              <TableCell>Task</TableCell>
              <TableCell>How often</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Documented</TableCell>
              <TableCell align="right">Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={cols}>
                  <CircularProgress size={20} />
                </TableCell>
              </TableRow>
            )}
            {!loading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={cols} data-testid="task-empty">
                  <Typography variant="body2" color="text.secondary">
                    No tasks in this list.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
            {rows.map((t) => {
              const can = (a) => (t.actions || []).includes(a);
              return (
                <TableRow key={t.id} hover sx={{ cursor: "pointer" }} onClick={() => setOpenId(t.id)} data-testid={`task-row-${t.id}`}>
                  <TableCell>
                    <Typography variant="body2">{t.is_prn ? "As needed" : fmtTime(t.due_at)}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {fmtDateTime(t.due_at)}
                    </Typography>
                    {t.overdue && <Chip size="small" color="error" sx={{ ml: 0.5 }} label={`${t.minutes_late} min late`} data-testid={`task-late-${t.id}`} />}
                  </TableCell>
                  {!scoped && (
                    <TableCell>
                      <Typography variant="body2">{t.patient_name}</Typography>
                      <Typography variant="caption" color="text.secondary">
                        {[t.unit_name, t.room_name, t.bed_name].filter(Boolean).join(" · ")}
                      </Typography>
                    </TableCell>
                  )}
                  <TableCell>
                    <Typography variant="body2" fontWeight={600}>
                      {t.title}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {[t.dose, t.route].filter(Boolean).join(" ")}
                      {t.instructions ? ` · ${t.instructions}` : ""}
                    </Typography>
                  </TableCell>
                  <TableCell>{t.frequency_label}</TableCell>
                  <TableCell>
                    <Chip size="small" color={STATUS_COLOR[t.status]} label={t.status_label} />
                  </TableCell>
                  <TableCell>
                    {t.performed_at ? (
                      <>
                        <Typography variant="body2">{fmtDateTime(t.performed_at)}</Typography>
                        <Typography variant="caption" color="text.secondary">
                          {t.performed_by_name}
                          {t.reason ? ` — ${t.reason}` : ""}
                        </Typography>
                      </>
                    ) : null}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                      {can("complete") && (
                        <Button size="small" variant="contained" onClick={() => setAct({ task: t, action: "complete" })} data-testid={`task-complete-${t.id}`}>
                          {t.task_type === "medication" ? "Give" : "Done"}
                        </Button>
                      )}
                      {can("hold") && (
                        <Button size="small" onClick={() => setAct({ task: t, action: "hold" })} data-testid={`task-hold-${t.id}`}>
                          Hold
                        </Button>
                      )}
                      {can("refuse") && (
                        <Button size="small" color="error" onClick={() => setAct({ task: t, action: "refuse" })} data-testid={`task-refuse-${t.id}`}>
                          Refused
                        </Button>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
      )}
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mt: 1 }}>
        <Typography variant="caption" color="text.secondary" data-testid="task-count">
          {total} task{total === 1 ? "" : "s"}
        </Typography>
        {pages > 1 && <Pagination count={pages} page={page} onChange={(_, p) => setPage(p)} size="small" />}
      </Stack>

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
