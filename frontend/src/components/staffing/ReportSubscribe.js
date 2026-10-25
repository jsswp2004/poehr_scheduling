import { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBell, faEnvelope } from "@fortawesome/free-solid-svg-icons";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../../config/api";
import { getAccessToken } from "../../utils/tokenManager";

export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
export const COVERS = {
  today: "Today",
  yesterday: "Yesterday",
  tomorrow: "Tomorrow",
  previous_week: "The previous week (Mon - Sun)",
  this_week: "The current week (Mon - Sun)",
  next_week: "The coming week (Mon - Sun)",
  last_7_days: "The last 7 days",
  next_7_days: "The next 7 days",
  previous_month: "The previous month",
  this_month: "The current month",
  next_month: "The coming month",
};
const COVERS_BY_FREQUENCY = {
  daily: ["yesterday", "today", "tomorrow", "last_7_days", "next_7_days"],
  weekly: ["previous_week", "this_week", "next_week", "last_7_days", "next_7_days"],
  monthly: ["previous_month", "this_month", "next_month"],
};
const DEFAULT_COVERS = { daily: "yesterday", weekly: "previous_week", monthly: "previous_month" };
const SINGLE_DAY = ["today", "yesterday", "tomorrow"];
const PDF_ONLY = ["master_schedule", "daily_forms"];
const FORMS = [
  { value: "assignment", label: "Daily Staffing Assignment Sheet (by unit)", needsShift: true, needsUnit: true },
  { value: "shift-sheet", label: "Daily Staffing Sheet (11-7 / 7-3 / 3-11)", needsShift: true },
  { value: "hours", label: "Current Staffing Hours", needsShift: true },
  { value: "worksheet", label: "Nursing Staffing Worksheet (all shifts)" },
];
const SHIFTS = [
  { value: "day", label: "Days (7-3)" },
  { value: "evening", label: "Evenings (3-11)" },
  { value: "night", label: "Nights (11-7)" },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const hourLabel = (h) => `${h % 12 || 12}:00 ${h < 12 ? "AM" : "PM"}`;
const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch (e) {
    return "America/New_York";
  }
};
const zoneName = (tz) => {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).format(new Date()).split(", ").pop();
  } catch (e) {
    return tz;
  }
};

// When the next email goes out, worked out in the subscription's own time zone (mirrors the server).
export function nextSendText({ frequency, weekday, monthDay, hour, tz }) {
  let n;
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        year: "numeric",
        month: "numeric",
        day: "numeric",
        hour: "numeric",
        hourCycle: "h23",
      })
        .formatToParts(new Date())
        .map((p) => [p.type, Number(p.value)])
    );
    n = { y: parts.year, m: parts.month, d: parts.day, h: parts.hour };
  } catch (e) {
    return "";
  }
  const passed = n.h >= hour;
  let day = new Date(Date.UTC(n.y, n.m - 1, n.d));
  const addDays = (k) => new Date(day.getTime() + k * 86400000);
  if (frequency === "daily") {
    if (passed) day = addDays(1);
  } else if (frequency === "weekly") {
    const dow = (day.getUTCDay() + 6) % 7;
    const add = (weekday - dow + 7) % 7;
    day = addDays(add === 0 && passed ? 7 : add);
  } else {
    let y = n.y;
    let m = n.m - 1;
    for (let i = 0; i < 14; i += 1) {
      const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const wanted = Number(monthDay) === 0 ? last : Math.min(Number(monthDay), last);
      const cand = new Date(Date.UTC(y, m, wanted));
      if (cand > day || (cand.getTime() === day.getTime() && !passed)) {
        day = cand;
        break;
      }
      m += 1;
      if (m === 12) {
        y += 1;
        m = 0;
      }
    }
  }
  const text = day.toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" });
  return `${text} at ${hourLabel(hour)} (${zoneName(tz)})`;
}

const errorText = (err, fallback) => {
  const d = err?.response?.data;
  if (!d) return fallback;
  if (typeof d === "string") return d;
  if (d.error) return d.error;
  if (d.detail) return d.detail;
  const first = Object.values(d)[0];
  return Array.isArray(first) ? first[0] : String(first || fallback);
};

/** The Subscribe dialog: create a subscription for `report`, or edit `subscription`. */
export function SubscribeDialog({ open, onClose, report, reportLabel, params = {}, people = [], units = [], subscription, onSaved }) {
  const editing = !!subscription;
  const initial = subscription || {};
  const isForms = report === "daily_forms";
  const [frequency, setFrequency] = useState(initial.frequency || (isForms ? "daily" : "weekly"));
  const [weekday, setWeekday] = useState(initial.weekday ?? 0);
  const [monthDay, setMonthDay] = useState(initial.month_day ?? 1);
  const [hour, setHour] = useState(initial.send_hour ?? 7);
  const [covers, setCovers] = useState(
    initial.covers || (isForms ? "today" : DEFAULT_COVERS[initial.frequency || "weekly"])
  );
  const [pdf, setPdf] = useState(initial.formats ? initial.formats.includes("pdf") : true);
  const [csv, setCsv] = useState(initial.formats ? initial.formats.includes("csv") : false);
  const [recipients, setRecipients] = useState(initial.recipients || []);
  const [form, setForm] = useState(initial.params?.form || "assignment");
  const [shift, setShift] = useState(initial.params?.shift || "day");
  const [unit, setUnit] = useState(initial.params?.unit || "all");
  const [tz] = useState(initial.timezone || browserZone());
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const pdfOnly = PDF_ONLY.includes(report);
  const dailyForms = report === "daily_forms";
  const formDef = FORMS.find((f) => f.value === form) || FORMS[0];

  const coverOptions = useMemo(
    () => (dailyForms ? SINGLE_DAY : COVERS_BY_FREQUENCY[frequency]),
    [dailyForms, frequency]
  );
  const changeFrequency = (next) => {
    if (!next) return;
    setFrequency(next);
    const options = dailyForms ? SINGLE_DAY : COVERS_BY_FREQUENCY[next];
    if (!options.includes(covers)) setCovers(dailyForms ? "today" : DEFAULT_COVERS[next]);
  };

  const byEmail = useMemo(() => {
    const m = {};
    people.forEach((p) => {
      if (p.email) m[p.email.toLowerCase()] = p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim();
    });
    return m;
  }, [people]);
  const options = useMemo(() => Object.keys(byEmail).sort((a, b) => (byEmail[a] || a).localeCompare(byEmail[b] || b)), [byEmail]);

  const payload = () => {
    const carried = { ...params };
    if (dailyForms) {
      carried.form = form;
      if (formDef.needsShift) carried.shift = shift;
      if (formDef.needsUnit) carried.unit = unit;
    }
    return {
      report,
      params: Object.fromEntries(Object.entries(carried).filter(([, v]) => v !== "" && v != null)),
      frequency,
      weekday,
      month_day: monthDay,
      send_hour: hour,
      timezone: tz,
      covers,
      formats: [pdf && "pdf", csv && !pdfOnly && "csv"].filter(Boolean),
      recipients,
      is_active: editing ? initial.is_active : true,
    };
  };

  const problem = () => {
    if (!pdf && !(csv && !pdfOnly)) return "Choose a file type to send.";
    if (!recipients.length) return "Add at least one recipient.";
    const bad = recipients.find((r) => !EMAIL_RE.test(r));
    if (bad) return `'${bad}' is not a valid email address.`;
    return "";
  };

  const headers = { headers: getAuthHeaders(getAccessToken()) };
  const save = async () => {
    const p = problem();
    if (p) return setError(p);
    setSaving(true);
    setError("");
    try {
      const res = editing
        ? await axios.patch(apiEndpoints.staffingReportSubscription(initial.id), payload(), headers)
        : await axios.post(apiEndpoints.staffingReportSubscriptions, payload(), headers);
      onSaved(res.data, editing);
      onClose();
    } catch (err) {
      setError(errorText(err, "Could not save the subscription."));
    } finally {
      setSaving(false);
    }
  };
  const sendTest = async () => {
    setTesting(true);
    setError("");
    setNotice("");
    try {
      const body = { ...payload(), recipients: recipients.length ? recipients : undefined };
      const res = await axios.post(apiEndpoints.staffingReportSubscriptionTest, body, headers);
      setNotice(`A test was sent to ${res.data.sent_to}.`);
    } catch (err) {
      setError(errorText(err, "Could not send the test."));
    } finally {
      setTesting(false);
    }
  };

  const nextText = nextSendText({ frequency, weekday, monthDay, hour, tz });

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ fontWeight: 600 }}>
        {editing ? "Edit subscription" : `Subscribe to ${reportLabel}`}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.25} sx={{ pt: 0.5 }}>
          <TextField size="small" label="Report" value={reportLabel} disabled />

          <Box>
            <Typography variant="overline" color="text.secondary">When</Typography>
            <ToggleButtonGroup fullWidth size="small" exclusive value={frequency} onChange={(e, v) => changeFrequency(v)} aria-label="How often">
              <ToggleButton value="daily">Daily</ToggleButton>
              <ToggleButton value="weekly">Weekly</ToggleButton>
              <ToggleButton value="monthly">Monthly</ToggleButton>
            </ToggleButtonGroup>
          </Box>
          <Stack direction="row" spacing={1.5}>
            {frequency === "weekly" && (
              <TextField select size="small" fullWidth label="Day" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>
                {WEEKDAYS.map((d, i) => (
                  <MenuItem key={d} value={i}>{d}</MenuItem>
                ))}
              </TextField>
            )}
            {frequency === "monthly" && (
              <TextField select size="small" fullWidth label="Date" value={monthDay} onChange={(e) => setMonthDay(Number(e.target.value))}>
                {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                  <MenuItem key={d} value={d}>{`Day ${d}`}</MenuItem>
                ))}
                <MenuItem value={0}>Last day of the month</MenuItem>
              </TextField>
            )}
            <TextField select size="small" fullWidth label="Time" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <MenuItem key={h} value={h}>{hourLabel(h)}</MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField select size="small" label="Covers" value={covers} onChange={(e) => setCovers(e.target.value)}>
            {coverOptions.map((c) => (
              <MenuItem key={c} value={c}>{COVERS[c]}</MenuItem>
            ))}
          </TextField>
          <Typography variant="body2" color="text.secondary" sx={{ mt: "-8px !important" }}>
            {nextText ? `Next email: ${nextText}. ` : ""}
            Emails go out on the hour, and always cover the period you pick, so each one is for the latest numbers.
          </Typography>

          {dailyForms && (
            <>
              <TextField select size="small" label="Form" value={form} onChange={(e) => setForm(e.target.value)}>
                {FORMS.map((f) => (
                  <MenuItem key={f.value} value={f.value}>{f.label}</MenuItem>
                ))}
              </TextField>
              {(formDef.needsShift || formDef.needsUnit) && (
                <Stack direction="row" spacing={1.5}>
                  {formDef.needsShift && (
                    <TextField select size="small" fullWidth label="Shift" value={shift} onChange={(e) => setShift(e.target.value)}>
                      {SHIFTS.map((s) => (
                        <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                      ))}
                    </TextField>
                  )}
                  {formDef.needsUnit && (
                    <TextField select size="small" fullWidth label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                      <MenuItem value="all">All units (a page each)</MenuItem>
                      {units.map((u) => (
                        <MenuItem key={u.id} value={String(u.id)}>{u.name}</MenuItem>
                      ))}
                    </TextField>
                  )}
                </Stack>
              )}
            </>
          )}

          <Box>
            <Typography variant="overline" color="text.secondary">What to send</Typography>
            <Box>
              <FormControlLabel control={<Checkbox checked={pdf} onChange={(e) => setPdf(e.target.checked)} />} label="PDF" />
              <FormControlLabel
                control={<Checkbox checked={csv && !pdfOnly} disabled={pdfOnly} onChange={(e) => setCsv(e.target.checked)} />}
                label={pdfOnly ? "CSV (not available for this report)" : "CSV"}
              />
            </Box>
          </Box>

          <Box>
            <Typography variant="overline" color="text.secondary">Who gets it</Typography>
            <Autocomplete
              multiple
              freeSolo
              autoSelect
              options={options}
              value={recipients}
              filterSelectedOptions
              getOptionLabel={(o) => (byEmail[o] ? `${byEmail[o]} (${o})` : o)}
              onChange={(e, v) => setRecipients([...new Set(v.map((x) => String(x).trim().toLowerCase()).filter(Boolean))])}
              renderTags={(value, getTagProps) =>
                value.map((email, index) => {
                  const { key, ...tagProps } = getTagProps({ index });
                  return (
                    <Chip
                      key={key}
                      size="small"
                      color={EMAIL_RE.test(email) ? "primary" : "error"}
                      variant="outlined"
                      label={byEmail[email] || email}
                      {...tagProps}
                    />
                  );
                })
              }
              renderInput={(p) => <TextField {...p} size="small" placeholder="Add a person or type an email address" />}
            />
            <Typography variant="caption" color="text.secondary">
              Pick staff by name, or type any email address and press Enter.
            </Typography>
          </Box>

          {error && <Alert severity="error">{error}</Alert>}
          {notice && <Alert severity="success">{notice}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5, justifyContent: "space-between" }}>
        <Button
          startIcon={testing ? <CircularProgress size={14} /> : <FontAwesomeIcon icon={faEnvelope} />}
          onClick={sendTest}
          disabled={testing || saving}
        >
          Send me a test now
        </Button>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button color="inherit" onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={save} disabled={saving}>
            {saving ? "Saving..." : editing ? "Save" : "Subscribe"}
          </Button>
        </Box>
      </DialogActions>
    </Dialog>
  );
}

/** The Subscribe button for a report's title row. Opens the dialog with the report's filters carried in. */
export function SubscribeButton({ report, reportLabel, params, people, units, onSaved, disabled }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outlined"
        color="inherit"
        startIcon={<FontAwesomeIcon icon={faBell} />}
        onClick={() => setOpen(true)}
        disabled={disabled}
        sx={{ minHeight: 44 }}
      >
        Subscribe
      </Button>
      {open && (
        <SubscribeDialog
          open
          onClose={() => setOpen(false)}
          report={report}
          reportLabel={reportLabel}
          params={params}
          people={people}
          units={units}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
