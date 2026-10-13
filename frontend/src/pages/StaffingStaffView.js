import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogContentText,
  DialogTitle, IconButton, Paper, Tab, Tabs, TextField, Typography,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import axios from "axios";
import {
  addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek,
} from "date-fns";
import { getAccessToken } from "../utils/tokenManager";
import { apiEndpoints, getAuthHeaders } from "../config/api";

/**
 * Staff view of the Staffing Center (role "staff"): the web twin of the phone app's staff screens.
 *   My Shifts - the next 30 days, with "I can't make my shift" for today/tomorrow
 *   Calendar  - month view; dots mark your shifts, click a day to see who is on
 *   Time Off  - request time off, see decisions, cancel a pending request
 * Staff can only act on their own records; the server enforces that.
 *
 * Props: tab ("shifts" | "calendar" | "timeoff"), onTabChange(tab)
 */

const SHIFT_COLORS = { day: "#1976d2", evening: "#f57c00", night: "#5e35b1", custom: "#546e7a" };
const STATUS_COLOR = {
  open: "error.main", pending: "warning.dark", approved: "success.main",
  denied: "text.secondary", resolved: "success.main", cancelled: "text.secondary",
};
const ymd = (d) => format(d, "yyyy-MM-dd");
const hhmm = (t) => (t ? t.slice(0, 5) : "");
const shiftRange = (s, e) => (s && e ? `${hhmm(s)}–${hhmm(e)}` : "All day");
const results = (data) => (Array.isArray(data) ? data : data?.results || []);

// Overnight shifts (end <= start) roll onto the next day.
const shiftSpan = (date, start, end) => {
  const s = new Date(`${date}T${start || "00:00:00"}`);
  let e = new Date(`${date}T${end || "23:59:59"}`);
  if (start && end && e <= s) e = new Date(e.getTime() + 24 * 3600 * 1000);
  return { start: s, end: e };
};

const errText = (e) => {
  const d = e?.response?.data;
  if (typeof d === "string" && d.length < 300) return d;
  if (d?.error) return String(d.error);
  if (d?.detail) return String(d.detail);
  if (d && typeof d === "object") return Object.values(d).flat().join(" ");
  return e?.message || "Something went wrong.";
};

const rangeLabel = (r) =>
  r.start_date === r.end_date
    ? format(parseISO(r.start_date), "EEE MMM d, yyyy")
    : `${format(parseISO(r.start_date), "MMM d")} – ${format(parseISO(r.end_date), "MMM d, yyyy")}`;

function StaffingStaffView({ tab, onTabChange }) {
  const headers = useMemo(() => getAuthHeaders(getAccessToken()), []);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loadingMe, setLoadingMe] = useState(true);

  // Shifts window: covers the 30-day list and the visible calendar month, so one fetch serves both.
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selected, setSelected] = useState(ymd(new Date()));
  const [shifts, setShifts] = useState([]);
  const [loadingShifts, setLoadingShifts] = useState(false);
  const [timeOff, setTimeOff] = useState([]);
  const [loadingOff, setLoadingOff] = useState(false);

  const [callOutShift, setCallOutShift] = useState(null);
  const [form, setForm] = useState({ start: ymd(new Date()), end: ymd(new Date()), reason: "" });
  const [saving, setSaving] = useState(false);

  const loadMe = useCallback(async () => {
    try {
      const res = await axios.get(apiEndpoints.staffingMe, { headers });
      setMe(res.data);
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoadingMe(false);
    }
  }, [headers]);

  const gridStart = startOfWeek(month);
  const gridEnd = endOfWeek(endOfMonth(month));
  const winStart = ymd(gridStart < new Date() ? gridStart : new Date());
  const winEnd = ymd(addDays(gridEnd > addDays(new Date(), 30) ? gridEnd : addDays(new Date(), 30), 0));

  const loadShifts = useCallback(async () => {
    setLoadingShifts(true);
    try {
      const res = await axios.get(apiEndpoints.staffingShifts, { headers, params: { start: winStart, end: winEnd } });
      setShifts(results(res.data));
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoadingShifts(false);
    }
  }, [headers, winStart, winEnd]);

  const loadTimeOff = useCallback(async () => {
    setLoadingOff(true);
    try {
      const res = await axios.get(apiEndpoints.staffingMyTimeOff, { headers });
      setTimeOff(results(res.data));
    } catch (e) {
      setError(errText(e));
    } finally {
      setLoadingOff(false);
    }
  }, [headers]);

  useEffect(() => { loadMe(); }, [loadMe]);
  useEffect(() => { loadShifts(); }, [loadShifts]);
  useEffect(() => { loadTimeOff(); }, [loadTimeOff]);

  const mine = useMemo(() => shifts.filter((s) => me && s.staff === me.id), [shifts, me]);
  const byDate = useMemo(() => {
    const m = {};
    shifts.forEach((s) => { (m[s.date] = m[s.date] || []).push(s); });
    return m;
  }, [shifts]);

  const calledOut = useMemo(
    () => new Set(timeOff.filter((r) => r.kind === "emergency" && ["open", "approved", "resolved"].includes(r.status) && r.shift_id).map((r) => r.shift_id)),
    [timeOff],
  );

  const canCallOut = (s) => {
    const span = shiftSpan(s.date, s.start_time, s.end_time);
    return span.end >= new Date() && span.start <= addDays(new Date(), 1).setHours(23, 59, 59, 999);
  };

  const upcoming = useMemo(() => {
    const now = new Date();
    const limit = addDays(now, 30);
    const list = mine.filter((s) => {
      const span = shiftSpan(s.date, s.start_time, s.end_time);
      return span.end >= now && span.start <= limit;
    });
    const groups = {};
    list.forEach((s) => { (groups[s.date] = groups[s.date] || []).push(s); });
    return Object.keys(groups).sort().map((d) => ({ date: d, shifts: groups[d] }));
  }, [mine]);

  const reportCallOut = async () => {
    const s = callOutShift;
    setCallOutShift(null);
    try {
      const r = await axios.post(apiEndpoints.staffingMyTimeOff, { kind: "emergency", shift_id: s.id }, { headers });
      if (r.data?.duplicate) setNotice("Your manager already has this call-out.");
      else if (r.data?.alert_sent) setNotice("Your manager has been alerted.");
      else setNotice("Call-out saved. It is on your manager's list, but no alert could be sent. Please also call the unit.");
      loadTimeOff();
      loadShifts();
    } catch (e) {
      setError(`${errText(e)} Please call the unit directly.`);
    }
  };

  const submitRequest = async () => {
    if (!form.start || !form.end) { setError("Choose a start and end date."); return; }
    if (form.end < form.start) { setError("The end date is before the start date."); return; }
    setSaving(true);
    setError("");
    try {
      await axios.post(
        apiEndpoints.staffingMyTimeOff,
        { kind: "off_request", start_date: form.start, end_date: form.end, reason: form.reason },
        { headers },
      );
      setForm((f) => ({ ...f, reason: "" }));
      setNotice("Request sent. Your manager will review it.");
      loadTimeOff();
    } catch (e) {
      setError(errText(e));
    } finally {
      setSaving(false);
    }
  };

  const cancelRequest = async (r) => {
    try {
      await axios.post(apiEndpoints.staffingMyTimeOffCancel(r.id), {}, { headers });
      loadTimeOff();
    } catch (e) {
      setError(errText(e));
    }
  };

  if (loadingMe) {
    return <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>;
  }

  const days = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const selectedList = (byDate[selected] || []).slice().sort((a, b) => Number(b.staff === me?.id) - Number(a.staff === me?.id));

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {me ? `Hello ${me.full_name}.` : ""} This is your own schedule and time off.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }} onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mb: 1 }} onClose={() => setNotice("")}>{notice}</Alert>}

      <Tabs value={tab} onChange={(e, v) => onTabChange(v)} sx={{ mb: 1.5, minHeight: 40, borderBottom: 1, borderColor: "divider" }}>
        <Tab value="shifts" label="My Shifts" />
        <Tab value="calendar" label="Calendar" />
        <Tab value="timeoff" label="Time Off" />
      </Tabs>

      {tab === "shifts" && (
        <Box>
          {loadingShifts && upcoming.length === 0 && <CircularProgress size={22} />}
          {!loadingShifts && upcoming.length === 0 && (
            <Typography color="text.secondary">No upcoming shifts scheduled in the next 30 days.</Typography>
          )}
          {upcoming.map((g) => (
            <Box key={g.date} sx={{ mb: 1.5 }}>
              <Typography variant="subtitle2" sx={{ bgcolor: "action.hover", px: 1.5, py: 0.75, borderRadius: 1 }}>
                {format(parseISO(g.date), "EEEE, MMM d")}
              </Typography>
              {g.shifts.map((s) => {
                const coworkers = (byDate[s.date] || [])
                  .filter((o) => o.shift_type === s.shift_type && o.staff !== s.staff).map((o) => o.staff_name);
                return (
                  <Box key={s.id} sx={{ display: "flex", p: 1.5, borderBottom: 1, borderColor: "divider" }}>
                    <Box sx={{ width: 6, borderRadius: 3, bgcolor: SHIFT_COLORS[s.shift_type] || SHIFT_COLORS.custom, mr: 1.5 }} />
                    <Box sx={{ flex: 1 }}>
                      <Typography sx={{ fontWeight: 600, textTransform: "capitalize" }}>
                        {s.shift_type_display} · {shiftRange(s.start_time, s.end_time)}
                        {s.unit_name ? ` · ${s.unit_name}` : ""}
                      </Typography>
                      {coworkers.length > 0 && (
                        <Typography variant="body2" color="text.secondary">Also on: {coworkers.join(", ")}</Typography>
                      )}
                      {calledOut.has(s.id) ? (
                        <Typography variant="body2" sx={{ color: "error.main", fontWeight: 700, mt: 0.5 }}>Call-out reported</Typography>
                      ) : canCallOut(s) ? (
                        <Button size="small" color="error" variant="outlined" sx={{ mt: 0.75 }} onClick={() => setCallOutShift(s)}>
                          I can&apos;t make my shift
                        </Button>
                      ) : null}
                    </Box>
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
      )}

      {tab === "calendar" && (
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <IconButton size="small" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeftIcon /></IconButton>
            <Typography variant="subtitle1" sx={{ minWidth: 150, textAlign: "center", fontWeight: 700 }}>{format(month, "MMMM yyyy")}</Typography>
            <IconButton size="small" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRightIcon /></IconButton>
            <Button size="small" onClick={() => { setMonth(startOfMonth(new Date())); setSelected(ymd(new Date())); }}>Today</Button>
          </Box>
          <Box sx={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 0.5, maxWidth: 560 }}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <Typography key={d} variant="caption" align="center" color="text.secondary">{d}</Typography>
            ))}
            {days.map((d) => {
              const key = ymd(d);
              const mineToday = (byDate[key] || []).filter((s) => s.staff === me?.id);
              const types = [...new Set(mineToday.map((s) => s.shift_type))];
              const isSel = key === selected;
              return (
                <Paper
                  key={key}
                  variant="outlined"
                  onClick={() => setSelected(key)}
                  sx={{
                    cursor: "pointer", p: 0.75, minHeight: 54, opacity: isSameMonth(d, month) ? 1 : 0.45,
                    borderColor: isSel ? "primary.main" : "divider", borderWidth: isSel ? 2 : 1,
                  }}
                >
                  <Typography variant="body2" align="center">{format(d, "d")}</Typography>
                  <Box sx={{ display: "flex", justifyContent: "center", gap: 0.5, mt: 0.5 }}>
                    {types.map((t) => (
                      <Box key={t} sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: SHIFT_COLORS[t] || SHIFT_COLORS.custom }} />
                    ))}
                  </Box>
                </Paper>
              );
            })}
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5, mb: 0.5 }}>
            Dots mark your shifts. Everyone scheduled on {format(parseISO(selected), "EEE MMM d")}:
          </Typography>
          {selectedList.length === 0 && <Typography color="text.secondary">No one scheduled that day.</Typography>}
          {selectedList.map((s) => (
            <Box key={s.id} sx={{ display: "flex", p: 1.25, borderBottom: 1, borderColor: "divider", bgcolor: s.staff === me?.id ? "action.selected" : undefined }}>
              <Box sx={{ width: 6, borderRadius: 3, bgcolor: SHIFT_COLORS[s.shift_type] || SHIFT_COLORS.custom, mr: 1.5 }} />
              <Box>
                <Typography sx={{ fontWeight: 600 }}>{s.staff_name}{s.staff === me?.id ? " (you)" : ""}</Typography>
                <Typography variant="body2" color="text.secondary">
                  {s.profession} · {s.shift_type_display} · {shiftRange(s.start_time, s.end_time)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      )}

      {tab === "timeoff" && (
        <Box sx={{ maxWidth: 560 }}>
          <Typography variant="h6" sx={{ mb: 1 }}>Request time off</Typography>
          <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", mb: 1.5 }}>
            <TextField
              label="From" type="date" size="small" value={form.start} InputLabelProps={{ shrink: true }}
              onChange={(e) => setForm({ ...form, start: e.target.value })}
            />
            <TextField
              label="To" type="date" size="small" value={form.end} InputLabelProps={{ shrink: true }}
              onChange={(e) => setForm({ ...form, end: e.target.value })}
            />
          </Box>
          <TextField
            label="Reason (optional)" fullWidth size="small" multiline minRows={2} value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            helperText="Please don't enter patient information."
          />
          <Button variant="contained" sx={{ mt: 1.5 }} disabled={saving} onClick={submitRequest}>
            {saving ? "Sending…" : "Send request"}
          </Button>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
            Sick right now? Open My Shifts and use &quot;I can&apos;t make my shift&quot; on today&apos;s or tomorrow&apos;s shift.
          </Typography>

          <Typography variant="h6" sx={{ mt: 3, mb: 1 }}>My requests</Typography>
          {loadingOff && <CircularProgress size={22} />}
          {!loadingOff && timeOff.length === 0 && <Typography color="text.secondary">No requests yet.</Typography>}
          {timeOff.map((r) => (
            <Box key={r.id} sx={{ py: 1.25, borderTop: 1, borderColor: "divider" }}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                <Typography sx={{ fontWeight: 600 }}>{r.kind === "emergency" ? "Call-out · " : ""}{rangeLabel(r)}</Typography>
                <Chip size="small" label={r.status_display} sx={{ color: STATUS_COLOR[r.status] || "text.primary", fontWeight: 700 }} variant="outlined" />
              </Box>
              {r.reason && <Typography variant="body2" color="text.secondary">&ldquo;{r.reason}&rdquo;</Typography>}
              {r.admin_note && <Typography variant="caption" color="text.secondary">Manager note: {r.admin_note}</Typography>}
              {r.kind === "off_request" && r.status === "pending" && (
                <Box><Button size="small" color="error" onClick={() => cancelRequest(r)}>Cancel request</Button></Box>
              )}
            </Box>
          ))}
        </Box>
      )}

      <Dialog open={!!callOutShift} onClose={() => setCallOutShift(null)}>
        <DialogTitle>I can&apos;t make my shift</DialogTitle>
        <DialogContent>
          <DialogContentText>
            {callOutShift ? `${format(parseISO(callOutShift.date), "EEE MMM d")} · ${callOutShift.shift_type_display}` : ""}
            <br /><br />
            Your manager will be alerted right away so they can find cover.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCallOutShift(null)}>Never mind</Button>
          <Button color="error" onClick={reportCallOut}>Report call-out</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default StaffingStaffView;
