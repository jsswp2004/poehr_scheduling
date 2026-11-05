import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";
import BayDialog from "./BayDialog";
import StatusChip from "./StatusChip";
import { ACTION_LABELS, CASE_TYPES, LATERALITY, MILESTONES, startValue, toInputValue, usDate } from "./surgeryUtils";

const emptyForm = (defaults) => ({
  patient: null,
  visit: "",
  room: defaults.room ? String(defaults.room) : "",
  date: defaults.date,
  time: defaults.time || "07:30",
  duration: 60,
  surgeon: "",
  service: "",
  case_type: "elective",
  anesthesia_type: "",
  comments: "",
  procedures: [{ name: "", laterality: "", cpt_code: "" }],
  times: {},
});

const formFromCase = (c) => ({
  patient: { id: c.patient.id, name: c.patient.name, mrn: c.patient.mrn },
  visit: c.visit ? String(c.visit.id) : "",
  room: c.room ? String(c.room.id) : "",
  date: c.date,
  time: c.time,
  duration: c.duration_minutes,
  surgeon: c.surgeon ? String(c.surgeon.id) : "",
  service: c.service,
  case_type: c.case_type,
  anesthesia_type: c.anesthesia_type,
  comments: c.comments,
  procedures: c.procedures.length ? c.procedures.map((p) => ({ name: p.name, laterality: p.laterality, cpt_code: p.cpt_code })) : [{ name: "", laterality: "", cpt_code: "" }],
  times: Object.fromEntries(MILESTONES.map((m) => [m.key, toInputValue(c.times[m.key])])),
});

/** Book a new case, or open one to edit its details, set its times and move it along the status flow. */
export default function CaseDialog({ open, caseId, defaults, facilityId, rooms, canEdit, onClose, onSaved }) {
  const isNew = !caseId;
  const [form, setForm] = useState(() => emptyForm(defaults));
  const [row, setRow] = useState(null);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [patientOptions, setPatientOptions] = useState([]);
  const [patientText, setPatientText] = useState("");
  const [visits, setVisits] = useState([]);
  const [history, setHistory] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [bayFor, setBayFor] = useState(null); // PreOp or PACU waiting for a bed to be chosen
  const [reason, setReason] = useState("");

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const closed = !isNew && row && row.next_statuses.length === 0;
  const locked = !canEdit || closed; // everything but comments
  const commentsLocked = !canEdit;

  const loadCase = useCallback(async () => {
    const c = await surgeryApi.getCase(caseId);
    setRow(c);
    setForm(formFromCase(c));
    return c;
  }, [caseId]);

  useEffect(() => {
    if (!open) return;
    setProblem("");
    setHistory(null);
    setCancelling(false);
    setReason("");
    setRow(null);
    if (isNew) {
      setForm(emptyForm(defaults));
    } else {
      loadCase().catch((err) => setProblem(errorText(err, "Could not open this case.")));
    }
    surgeryApi.doctors().then(setDoctors).catch(() => setDoctors([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, caseId]);

  // patient search (new cases only), a little after the person stops typing
  useEffect(() => {
    if (!open || !isNew || patientText.trim().length < 2) return undefined;
    const timer = setTimeout(() => {
      surgeryApi.searchPatients(patientText.trim()).then(setPatientOptions).catch(() => setPatientOptions([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [patientText, open, isNew]);

  // the picked patient's open visits, for the visit link
  const patientId = form.patient?.id;
  useEffect(() => {
    if (!open || !patientId) {
      setVisits([]);
      return;
    }
    surgeryApi.openVisits(patientId).then(setVisits).catch(() => setVisits([]));
  }, [open, patientId]);

  const payload = () => {
    if (locked) return { comments: form.comments };
    const body = {
      visit: form.visit ? Number(form.visit) : null,
      room: form.room ? Number(form.room) : null,
      scheduled_start: startValue(form.date, form.time),
      duration_minutes: Number(form.duration) || 60,
      surgeon: form.surgeon ? Number(form.surgeon) : null,
      service: form.service,
      case_type: form.case_type,
      anesthesia_type: form.anesthesia_type,
      comments: form.comments,
      procedures: form.procedures.filter((p) => p.name.trim()).map((p) => ({ name: p.name.trim(), laterality: p.laterality, cpt_code: p.cpt_code })),
    };
    if (isNew) {
      body.patient = form.patient?.id;
      body.facility = facilityId;
    } else {
      body.times = undefined;
      MILESTONES.forEach((m) => {
        body[m.key] = form.times[m.key] ? form.times[m.key] : null;
      });
      delete body.times;
    }
    return body;
  };

  const save = async () => {
    if (isNew && !form.patient) {
      setProblem("Pick a patient.");
      return;
    }
    setBusy(true);
    setProblem("");
    try {
      const saved = isNew ? await surgeryApi.createCase(payload()) : await surgeryApi.updateCase(caseId, payload());
      (saved.warnings || []).forEach((w) => toast.warning(w));
      toast.success(isNew ? `Case ${saved.case_number} booked` : "Case saved");
      onSaved(saved);
      onClose();
    } catch (err) {
      setProblem(errorText(err, "The case was not saved."));
    } finally {
      setBusy(false);
    }
  };

  const move = async (status, bed) => {
    if (status === "cancelled" && !cancelling) {
      setCancelling(true);
      return;
    }
    if ((status === "preop" || status === "pacu") && bed === undefined) {
      setBayFor(status);
      return;
    }
    setBayFor(null);
    setBusy(true);
    setProblem("");
    try {
      const updated = bed === undefined ? await surgeryApi.setStatus(caseId, status, reason) : await surgeryApi.setStatus(caseId, status, reason, bed);
      setRow(updated);
      setForm(formFromCase(updated));
      setCancelling(false);
      setReason("");
      toast.success(`Case ${updated.case_number}: ${updated.status_label}`);
      onSaved(updated);
    } catch (err) {
      setProblem(errorText(err, "That status change did not work."));
    } finally {
      setBusy(false);
    }
  };

  const showHistory = async () => {
    try {
      setHistory(await surgeryApi.history(caseId));
    } catch (err) {
      setProblem(errorText(err, "Could not load the history."));
    }
  };

  const setProcedure = (i, key, value) =>
    setForm((f) => ({ ...f, procedures: f.procedures.map((p, idx) => (idx === i ? { ...p, [key]: value } : p)) }));

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <span>{isNew ? "New Surgery Case" : row ? `Case ${row.case_number}` : "Case"}</span>
          {row && <StatusChip status={row.status} label={row.status_label} />}
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        {problem && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {problem}
          </Alert>
        )}
        {closed && (
          <Alert severity="info" sx={{ mb: 2 }}>
            This case is {row.status_label.toLowerCase()}, so only the comments can change.
          </Alert>
        )}

        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, gap: 2 }}>
          {isNew ? (
            <Autocomplete
              options={patientOptions}
              value={form.patient}
              onChange={(_, v) => setForm((f) => ({ ...f, patient: v, visit: "" }))}
              onInputChange={(_, v) => setPatientText(v)}
              filterOptions={(x) => x}
              getOptionLabel={(p) => (p.name ? `${p.name} (${p.mrn})` : `${p.last_name}, ${p.first_name} (${p.mrn})`)}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText={patientText.trim().length < 2 ? "Type a name or MRN" : "No patients found"}
              renderInput={(params) => <TextField {...params} label="Patient" required size="small" />}
            />
          ) : (
            <TextField size="small" label="Patient" value={row ? `${row.patient.name} (${row.patient.mrn})` : ""} disabled />
          )}
          <TextField size="small" select label="Visit" value={form.visit} onChange={set("visit")} disabled={locked || !form.patient} helperText={form.patient && visits.length === 0 ? "No open visits for this patient" : " "}>
            <MenuItem value="">None</MenuItem>
            {visits.map((v) => (
              <MenuItem key={v.id} value={String(v.id)}>
                {v.visit_number}
                {v.reason_for_visit ? ` - ${v.reason_for_visit}` : ""}
              </MenuItem>
            ))}
            {row?.visit && !visits.some((v) => v.id === row.visit.id) && (
              <MenuItem value={String(row.visit.id)}>{row.visit.visit_number}</MenuItem>
            )}
          </TextField>

          <TextField size="small" type="date" label="Date" value={form.date} onChange={set("date")} disabled={locked} InputLabelProps={{ shrink: true }} />
          <Stack direction="row" spacing={2}>
            <TextField size="small" type="time" label="Start" value={form.time} onChange={set("time")} disabled={locked} InputLabelProps={{ shrink: true }} sx={{ flex: 1 }} />
            <TextField size="small" type="number" label="Minutes" value={form.duration} onChange={set("duration")} disabled={locked} inputProps={{ min: 5, max: 1440 }} sx={{ flex: 1 }} />
          </Stack>

          <TextField size="small" select label="Room" value={form.room} onChange={set("room")} disabled={locked}>
            <MenuItem value="">Unassigned</MenuItem>
            {rooms.map((r) => (
              <MenuItem key={r.id} value={String(r.id)}>
                {r.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" select label="Case Provider" value={form.surgeon} onChange={set("surgeon")} disabled={locked}>
            <MenuItem value="">None</MenuItem>
            {doctors.map((d) => (
              <MenuItem key={d.id} value={String(d.id)}>
                {d.last_name}, {d.first_name}
              </MenuItem>
            ))}
          </TextField>

          <TextField size="small" label="Service" value={form.service} onChange={set("service")} disabled={locked} />
          <TextField size="small" select label="Type" value={form.case_type} onChange={set("case_type")} disabled={locked}>
            {CASE_TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Anesthesia" value={form.anesthesia_type} onChange={set("anesthesia_type")} disabled={locked} />
        </Box>

        <Typography variant="subtitle2" sx={{ mt: 2.5, mb: 1 }}>
          Procedures
        </Typography>
        <Stack spacing={1}>
          {form.procedures.map((p, i) => (
            <Stack key={i} direction="row" spacing={1} alignItems="center">
              <TextField size="small" label="Procedure" value={p.name} onChange={(e) => setProcedure(i, "name", e.target.value)} disabled={locked} sx={{ flex: 3 }} />
              <TextField size="small" select label="Laterality" value={p.laterality} onChange={(e) => setProcedure(i, "laterality", e.target.value)} disabled={locked} sx={{ flex: 1.2 }}>
                {LATERALITY.map((l) => (
                  <MenuItem key={l.value} value={l.value}>
                    {l.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField size="small" label="CPT" value={p.cpt_code} onChange={(e) => setProcedure(i, "cpt_code", e.target.value)} disabled={locked} sx={{ flex: 0.8 }} inputProps={{ maxLength: 10 }} />
              <IconButton aria-label="Remove procedure" size="small" disabled={locked || form.procedures.length === 1} onClick={() => setForm((f) => ({ ...f, procedures: f.procedures.filter((_, idx) => idx !== i) }))}>
                <DeleteOutlineIcon fontSize="small" />
              </IconButton>
            </Stack>
          ))}
          <Box>
            <Button size="small" startIcon={<AddIcon />} disabled={locked} onClick={() => setForm((f) => ({ ...f, procedures: [...f.procedures, { name: "", laterality: "", cpt_code: "" }] }))}>
              Add procedure
            </Button>
          </Box>
        </Stack>

        <TextField size="small" label="Booking comments" value={form.comments} onChange={set("comments")} disabled={commentsLocked} multiline minRows={2} fullWidth sx={{ mt: 2 }} />

        {!isNew && row && (
          <>
            <Typography variant="subtitle2" sx={{ mt: 2.5, mb: 1 }}>
              Times
            </Typography>
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr 1fr" }, gap: 2 }}>
              {MILESTONES.map((m) => (
                <TextField
                  key={m.key}
                  size="small"
                  type="datetime-local"
                  label={m.label}
                  value={form.times[m.key] || ""}
                  onChange={(e) => setForm((f) => ({ ...f, times: { ...f.times, [m.key]: e.target.value } }))}
                  disabled={locked}
                  InputLabelProps={{ shrink: true }}
                />
              ))}
            </Box>

            {cancelling && (
              <TextField size="small" label="Reason for cancelling" required value={reason} onChange={(e) => setReason(e.target.value)} fullWidth autoFocus sx={{ mt: 2 }} inputProps={{ maxLength: 200 }} />
            )}

            <Box sx={{ mt: 2 }}>
              <Button size="small" onClick={showHistory}>
                {history ? "Refresh Modification History" : "Show Modification History"}
              </Button>
              {history && (
                <Box sx={{ mt: 1, maxHeight: 220, overflow: "auto", border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1 }}>
                  {history.length === 0 && <Typography variant="body2">No changes recorded.</Typography>}
                  {history.map((h) => (
                    <Box key={h.id} sx={{ mb: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 700 }}>
                        {usDate(h.at)} {h.at.slice(11, 16)} · {h.user || "system"} · {h.action}
                      </Typography>
                      {h.changes.map((c) => (
                        <Typography key={c.field} variant="body2" sx={{ pl: 1 }}>
                          {c.field.replace(/_id$/, "").replace(/_/g, " ")}: {c.previous || "(blank)"} → {c.new || "(blank)"}
                        </Typography>
                      ))}
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 1, px: 3, py: 1.5 }}>
        {!isNew &&
          canEdit &&
          row?.next_statuses.map((next) => (
            <Button
              key={next}
              variant="outlined"
              color={next === "cancelled" ? "error" : "primary"}
              disabled={busy || (next === "cancelled" && cancelling && !reason.trim())}
              onClick={() => move(next)}
            >
              {next === "cancelled" && cancelling ? "Confirm Cancel" : ACTION_LABELS[next]}
            </Button>
          ))}
        <Box sx={{ flex: 1 }} />
        <Button onClick={onClose}>Close</Button>
        {canEdit && (
          <Button variant="contained" onClick={save} disabled={busy}>
            {isNew ? "Book Case" : "Save"}
          </Button>
        )}
      </DialogActions>
      <BayDialog open={Boolean(bayFor)} caseId={caseId} status={bayFor} busy={busy} onClose={() => setBayFor(null)} onConfirm={(bed) => move(bayFor, bed)} />
    </Dialog>
  );
}
