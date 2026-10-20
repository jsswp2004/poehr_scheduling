import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, FormControl,
  FormControlLabel, FormLabel, Link, MenuItem, Paper, Radio, RadioGroup, Stack, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Tabs, TextField, Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText, fmtDay } from "../prescriptions/rxShared";

// Status is always written out, never colour alone.
const STATUS_STYLE = {
  overdue: { bg: "#FDE2E1", fg: "#7A1212" },
  due: { bg: "#FEF0C7", fg: "#7A2E0E" },
  near_due: { bg: "#D9EAFF", fg: "#194185" },
  review: { bg: "#EBE3FF", fg: "#44239B" },
  future: { bg: "#EEF1F4", fg: "#364152" },
  done: { bg: "#D5F2E3", fg: "#054F31" },
  not_done: { bg: "#EEF1F4", fg: "#364152" },
  aged_out: { bg: "#EEF1F4", fg: "#52606D" },
};
const ROUTES = ["Intramuscular", "Subcutaneous", "Oral", "Intranasal"];
const SITES = ["Left deltoid", "Right deltoid", "Left thigh", "Right thigh"];
const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const nowTime = () => new Date().toTimeString().slice(0, 5);

export function StatusPill({ status, label }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.future;
  return (
    <Box component="span" data-testid={`status-${status}`}
      sx={{ display: "inline-block", px: 1.25, py: 0.25, borderRadius: 999, fontSize: 12, fontWeight: 600, bgcolor: s.bg, color: s.fg }}>
      {label}
    </Box>
  );
}

/** One box per dose of a series: given (filled), due now (solid outline), later (dashed). Numbers and the legend keep it readable without colour. */
export function DosePips({ doses }) {
  if (!doses || doses.length < 2) return null;
  const look = {
    given: { bgcolor: "#054F31", color: "#fff", border: "2px solid #054F31" },
    due: { bgcolor: "#FEF0C7", color: "#7A2E0E", border: "2px solid #B54708" },
    later: { bgcolor: "#fff", color: "#364152", border: "2px dashed #7B8794" },
  };
  return (
    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap" data-testid="dose-pips">
      {doses.map((d, i) => (
        <Box key={i} component="span" title={`Dose ${i + 1}: ${d === "given" ? "given" : d === "due" ? "due now" : "later"}`}
          sx={{ width: 24, height: 24, lineHeight: "20px", textAlign: "center", borderRadius: "6px", fontWeight: 700, fontSize: 13, ...look[d] }}>
          {i + 1}
        </Box>
      ))}
    </Stack>
  );
}

const blankDose = (item = "") => ({
  item, product: "", manufacturer: "", lot_number: "", expiration_date: "", dose_amount: "0.5 mL",
  route: "Intramuscular", site: "Left deltoid", vis_given: true, screening_reviewed: false, notes: "",
});

function RecordDoseDialog({ patient, catalog, firstItems, onClose, onSaved }) {
  const [date, setDate] = useState(todayIso());
  const [time, setTime] = useState(nowTime());
  const [doses, setDoses] = useState(() => (firstItems.length ? firstItems : [""]).map((c) => blankDose(c)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const vaccines = catalog.items.filter((i) => i.kind === "vaccine");
  const makers = catalog.lookups.manufacturer || [];
  const set = (i, patch) => setDoses((d) => d.map((x, n) => (n === i ? { ...x, ...patch } : x)));

  const save = async () => {
    setError("");
    if (doses.some((d) => !d.item)) return setError("Choose the vaccine for each dose.");
    if (!date) return setError("Enter the date given.");
    setBusy(true);
    try {
      const body = { doses: doses.map((d) => ({ ...d, given_on: date, given_time: time, manufacturer: d.manufacturer || null })) };
      const res = await api.post(apiEndpoints.vaccinePatientDoses(patient.id), body, { headers: await authHeader() });
      onSaved(res.data);
    } catch (e) {
      setError(errorText(e, "Could not save the dose."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open fullWidth maxWidth="sm" onClose={busy ? undefined : onClose} aria-labelledby="vm-record-title">
      <DialogTitle id="vm-record-title">Mark as done<Typography variant="body2" color="text.secondary">{patient.name}</Typography></DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error" data-testid="vm-record-error">{error}</Alert>}
          <Stack direction="row" spacing={2}>
            <TextField label="Date given" type="date" size="small" value={date} onChange={(e) => setDate(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
            <TextField label="Time given" type="time" size="small" value={time} onChange={(e) => setTime(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
          </Stack>
          {doses.map((d, i) => {
            const item = vaccines.find((v) => v.code === d.item);
            return (
              <Paper key={i} variant="outlined" sx={{ p: 1.5 }} data-testid={`vm-dose-${i}`}>
                <Stack spacing={1.5}>
                  <TextField select label="Vaccine" size="small" value={d.item} onChange={(e) => set(i, { item: e.target.value, product: "" })} fullWidth>
                    {vaccines.map((v) => <MenuItem key={v.code} value={v.code}>{v.name}</MenuItem>)}
                  </TextField>
                  <Stack direction="row" spacing={2}>
                    <TextField select label="Product (CVX)" size="small" value={d.product} onChange={(e) => set(i, { product: e.target.value })} fullWidth disabled={!item}>
                      <MenuItem value="">Not specified</MenuItem>
                      {(item?.products || []).map((p) => <MenuItem key={p.cvx} value={p.cvx}>{p.name} (CVX {p.cvx})</MenuItem>)}
                    </TextField>
                    <TextField select label="Manufacturer" size="small" value={d.manufacturer} onChange={(e) => set(i, { manufacturer: e.target.value })} fullWidth>
                      <MenuItem value="">Select manufacturer</MenuItem>
                      {makers.map((m) => <MenuItem key={m.id} value={m.id}>{m.name}</MenuItem>)}
                    </TextField>
                  </Stack>
                  <Stack direction="row" spacing={2}>
                    <TextField label="Lot number" size="small" value={d.lot_number} onChange={(e) => set(i, { lot_number: e.target.value })} placeholder="From the vial or syringe" fullWidth />
                    <TextField label="Expiration date" type="date" size="small" value={d.expiration_date} onChange={(e) => set(i, { expiration_date: e.target.value })} InputLabelProps={{ shrink: true }} fullWidth />
                  </Stack>
                  <Stack direction="row" spacing={2}>
                    <TextField label="Dose amount" size="small" value={d.dose_amount} onChange={(e) => set(i, { dose_amount: e.target.value })} fullWidth />
                    <TextField select label="Route" size="small" value={d.route} onChange={(e) => set(i, { route: e.target.value })} fullWidth>
                      {ROUTES.map((r) => <MenuItem key={r} value={r}>{r}</MenuItem>)}
                    </TextField>
                    <TextField select label="Site" size="small" value={d.site} onChange={(e) => set(i, { site: e.target.value })} fullWidth>
                      {SITES.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                    </TextField>
                  </Stack>
                  <FormControlLabel control={<Checkbox checked={d.vis_given} onChange={(e) => set(i, { vis_given: e.target.checked })} />} label="Vaccine information statement given to the patient" />
                  <FormControlLabel control={<Checkbox checked={d.screening_reviewed} onChange={(e) => set(i, { screening_reviewed: e.target.checked })} />} label="Screening questions reviewed (allergies, illness, pregnancy)" />
                  <TextField label="Notes" size="small" multiline minRows={2} value={d.notes} onChange={(e) => set(i, { notes: e.target.value })} />
                  {doses.length > 1 && <Link component="button" type="button" underline="hover" sx={{ alignSelf: "flex-start" }} onClick={() => setDoses((x) => x.filter((_, n) => n !== i))}>Remove this vaccine</Link>}
                </Stack>
              </Paper>
            );
          })}
          <Link component="button" type="button" underline="hover" sx={{ alignSelf: "flex-start", fontWeight: 600 }} onClick={() => setDoses((d) => [...d, blankDose()])} data-testid="vm-add-another">
            Add another vaccine to this visit
          </Link>
          <Typography variant="caption" color="text.secondary">The dose is recorded as given by you, on your login.</Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy} data-testid="vm-save-dose">{busy ? "Saving..." : "Save dose"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function NotDoneDialog({ patient, rec, catalog, onClose, onSaved }) {
  const [reason, setReason] = useState("declined");
  const [again, setAgain] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post(apiEndpoints.vaccinePatientNotDone(patient.id), { item: rec.item, reason, offer_again_on: again || null, notes }, { headers: await authHeader() });
      onSaved(res.data);
    } catch (e) {
      setError(errorText(e, "Could not save."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open fullWidth maxWidth="xs" onClose={busy ? undefined : onClose} aria-labelledby="vm-nd-title">
      <DialogTitle id="vm-nd-title">Mark as not done<Typography variant="body2" color="text.secondary">{patient.name}</Typography></DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Box sx={{ p: 1.5, bgcolor: "#FEF0C7", borderRadius: 2, color: "#5C2209" }}>
            <Typography sx={{ fontWeight: 700 }}>{rec.name}</Typography>
            {rec.dose_number ? <Typography variant="body2">Dose {rec.dose_number} of {rec.dose_count}</Typography> : null}
          </Box>
          <FormControl>
            <FormLabel>Reason</FormLabel>
            <RadioGroup value={reason} onChange={(e) => setReason(e.target.value)}>
              {catalog.reasons.map((r) => <FormControlLabel key={r.value} value={r.value} control={<Radio />} label={r.label} />)}
            </RadioGroup>
          </FormControl>
          <TextField label="Offer again on" type="date" size="small" value={again} onChange={(e) => setAgain(e.target.value)} InputLabelProps={{ shrink: true }}
            helperText="Optional. The item returns to the list on this date. A refusal can be offered again at any later visit." />
          <TextField label="Notes" size="small" multiline minRows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy} data-testid="vm-save-notdone">{busy ? "Saving..." : "Save as not done"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function VoidDialog({ rec, onClose, onSaved }) {
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.post(apiEndpoints.vaccineVoid(rec.id), { reason: why }, { headers: await authHeader() });
      onSaved(res.data);
    } catch (e) {
      setError(errorText(e, "Could not save."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open fullWidth maxWidth="xs" onClose={busy ? undefined : onClose}>
      <DialogTitle>Mark entered in error</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography variant="body2">{rec.item_name}, {rec.status === "done" ? `given ${fmtDay(rec.given_on)}` : "not done"}. The record stays on the chart, marked as an error.</Typography>
          <TextField label="Why was this entered in error?" size="small" value={why} onChange={(e) => setWhy(e.target.value)} multiline minRows={2} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color="error" onClick={save} disabled={busy || !why.trim()} data-testid="vm-save-void">Mark in error</Button>
      </DialogActions>
    </Dialog>
  );
}

function DetailDialog({ rec, history, canRecord, onClose, onDone, onNotDone }) {
  const mine = history.filter((h) => h.item === rec.item && h.status !== "entered_in_error");
  return (
    <Dialog open fullWidth maxWidth="sm" onClose={onClose}>
      <DialogTitle>{rec.name} <StatusPill status={rec.status} label={rec.status_label} /></DialogTitle>
      <DialogContent dividers>
        <Stack spacing={1.5}>
          <Typography variant="body2" data-testid="vm-detail-why">{rec.why}</Typography>
          <DosePips doses={rec.doses} />
          <Typography variant="body2">Last done: {rec.last_done ? fmtDay(rec.last_done) : "never recorded"}. Next due: {rec.next_due ? fmtDay(rec.next_due) : "not set"}.</Typography>
          {mine.length > 0 && (
            <Box>
              <Typography variant="subtitle2">History</Typography>
              {mine.map((h) => (
                <Typography variant="body2" key={h.id}>
                  {h.status === "done" ? `Dose ${h.dose_number} given ${fmtDay(h.given_on)}${h.product ? `, ${h.product}` : ""}` : `Not done: ${h.not_done_reason_label}`}
                </Typography>
              ))}
            </Box>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
        {canRecord && <Button onClick={onNotDone}>Not done</Button>}
        {canRecord && <Button variant="contained" onClick={onDone}>Mark done</Button>}
      </DialogActions>
    </Dialog>
  );
}

export default function VaccineManager({ patient }) {
  const [data, setData] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [error, setError] = useState("");
  const [kind, setKind] = useState("all");
  const [showAged, setShowAged] = useState(false);
  const [dialog, setDialog] = useState(null); // {type, ...}
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const headers = await authHeader();
      const [p, c] = await Promise.all([
        api.get(apiEndpoints.vaccinePatient(patient.id), { headers }),
        api.get(apiEndpoints.vaccineCatalog, { headers }),
      ]);
      setData(p.data);
      setCatalog(c.data);
    } catch (e) {
      setError(errorText(e, "Could not load vaccines and screenings."));
    }
  }, [patient.id]);

  useEffect(() => {
    load();
  }, [load]);

  const afterSave = (body, message) => {
    setData(body);
    setDialog(null);
    setNotice(message);
  };

  const risk = async (fn) => {
    setError("");
    try {
      const res = await fn(await authHeader());
      setData(res.data);
    } catch (e) {
      setError(errorText(e, "Could not change the risk schedule."));
    }
  };

  const rows = useMemo(() => {
    if (!data) return [];
    return data.recommendations.filter((r) => (kind === "all" || r.kind === kind) && (showAged || r.status !== "aged_out"));
  }, [data, kind, showAged]);

  if (error && !data) return <Alert severity="error" data-testid="vm-error">{error}</Alert>;
  if (!data || !catalog) return <Box sx={{ p: 3 }}><CircularProgress size={22} aria-label="Loading vaccines" /></Box>;

  const dueRecs = data.recommendations.filter((r) => r.status === "due" || r.status === "overdue");
  const canRecord = data.can_record;
  const hasScreenings = data.recommendations.some((r) => r.kind === "screening");
  const agedCount = data.recommendations.filter((r) => r.status === "aged_out").length;

  return (
    <Box data-testid="vaccine-manager" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
          <Box>
            <Typography sx={{ fontWeight: 700, fontSize: "1.05rem" }}>{data.patient.name}</Typography>
            <Typography variant="body2" color="text.secondary">Vaccines and screenings</Typography>
          </Box>
          <Box><Typography variant="caption" color="text.secondary">Age / DOB</Typography>
            <Typography sx={{ fontWeight: 600 }}>{data.patient.date_of_birth ? `${fmtAge(data.patient.age_months)} (${fmtDay(data.patient.date_of_birth)})` : "Not on file"}</Typography></Box>
          <Box><Typography variant="caption" color="text.secondary">Sex</Typography>
            <Typography sx={{ fontWeight: 600 }}>{data.patient.sex ? data.patient.sex[0].toUpperCase() + data.patient.sex.slice(1) : "Not recorded"}</Typography></Box>
          {data.schedule && <Chip color="primary" variant="outlined" label={`Schedule: ${data.schedule.name} (${data.schedule.edition})`} title={data.schedule.source} data-testid="vm-schedule" />}
          {data.risk_schedules.map((r) => (
            <Chip key={r.id} label={r.name} onDelete={canRecord ? () => risk((h) => api.post(apiEndpoints.vaccineRiskDetail(patient.id, r.id), { action: "end" }, { headers: h })) : undefined}
              deleteIcon={<span style={{ fontSize: 12, paddingRight: 8 }}>End</span>} data-testid="vm-risk-chip" />
          ))}
        </Stack>
      </Paper>

      {error && <Alert severity="error" onClose={() => setError("")}>{error}</Alert>}
      {notice && <Alert severity="success" onClose={() => setNotice("")}>{notice}</Alert>}
      {data.problem && <Alert severity="warning" data-testid="vm-problem">{data.problem_text}{data.clash.length ? ` (${data.clash.map((c) => c.name).join(", ")})` : ""}</Alert>}

      {data.suggestions.map((s) => (
        <Alert key={s.schedule} severity="info" data-testid="vm-suggestion"
          action={canRecord ? (
            <Stack direction="row" spacing={1}>
              <Button size="small" onClick={() => risk((h) => api.post(apiEndpoints.vaccinePatientRisk(patient.id), { schedule: s.schedule, problem: s.problem_id }, { headers: h }))}>Add schedule</Button>
              <Button size="small" onClick={() => risk((h) => api.post(apiEndpoints.vaccineRiskDismiss(patient.id), { schedule: s.schedule, reason: `Not applicable (${s.problem})` }, { headers: h }))}>Not now</Button>
            </Stack>
          ) : null}>
          The problem list has {s.problem}{s.problem_code ? ` (${s.problem_code})` : ""}. Add the risk schedule "{s.name}"? A clinician must confirm it.
        </Alert>
      ))}

      {dueRecs.length > 0 && (
        <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "#FEF0C7", borderColor: "#F0C36D" }} data-testid="vm-banner">
          <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" alignItems="center">
            <Typography sx={{ fontWeight: 700, color: "#7A2E0E" }}>
              {dueRecs.length} {dueRecs.length === 1 ? "vaccine is" : "vaccines are"} due at this visit
            </Typography>
            <Typography variant="body2" sx={{ color: "#5C2209" }}>Check each one, then record the doses given. The record form can take several vaccines at once.</Typography>
            {canRecord && (
              <Button variant="contained" sx={{ ml: "auto" }} data-testid="vm-record-due"
                onClick={() => setDialog({ type: "record", items: dueRecs.filter((r) => r.kind === "vaccine").map((r) => r.item) })}>
                Record due vaccines
              </Button>
            )}
          </Stack>
        </Paper>
      )}

      <Paper variant="outlined">
        <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ px: 1, borderBottom: 1, borderColor: "divider" }}>
          {hasScreenings ? (
            <Tabs value={kind} onChange={(_, v) => setKind(v)} aria-label="Show">
              <Tab value="all" label="All" /><Tab value="vaccine" label="Vaccines" /><Tab value="screening" label="Screenings" />
            </Tabs>
          ) : <Box />}
          {agedCount > 0 && (
            <FormControlLabel control={<Checkbox size="small" checked={showAged} onChange={(e) => setShowAged(e.target.checked)} />} label={`Show aged out (${agedCount})`} />
          )}
        </Stack>
        <Stack direction="row" spacing={2} useFlexGap flexWrap="wrap" sx={{ px: 2, py: 1, borderBottom: 1, borderColor: "divider", fontSize: 13 }} aria-label="Dose key">
          <Typography variant="caption" sx={{ fontWeight: 600 }}>Dose key</Typography>
          <Typography variant="caption">Filled box: given</Typography>
          <Typography variant="caption">Orange outline: due now</Typography>
          <Typography variant="caption">Dashed: later</Typography>
        </Stack>
        <Box sx={{ overflowX: "auto" }}>
          <Table size="small" aria-label="Vaccines and screenings">
            <TableHead>
              <TableRow><TableCell>Item</TableCell><TableCell>Doses</TableCell><TableCell>Status</TableCell><TableCell>Why, and next step</TableCell><TableCell>Last done</TableCell><TableCell>Next due</TableCell><TableCell>Actions</TableCell></TableRow>
            </TableHead>
            <TableBody>
              {rows.length === 0 && <TableRow><TableCell colSpan={7}><Typography variant="body2" color="text.secondary">Nothing to show for this patient.</Typography></TableCell></TableRow>}
              {rows.map((r) => (
                <TableRow key={r.item} hover data-testid={`vm-row-${r.item}`}>
                  <TableCell><Typography sx={{ fontWeight: 600 }}>{r.name}</Typography></TableCell>
                  <TableCell>{r.dose_count > 1 ? <><DosePips doses={r.doses} /><Typography variant="caption" color="text.secondary">{r.dose_number ? `Dose ${r.dose_number} of ${r.dose_count}` : `${r.dose_count} doses`}</Typography></> : <Typography variant="caption" color="text.secondary">1 dose</Typography>}</TableCell>
                  <TableCell><StatusPill status={r.status} label={r.status_label} /></TableCell>
                  <TableCell sx={{ maxWidth: 360 }}><Typography variant="body2">{r.why}</Typography></TableCell>
                  <TableCell>{r.last_done ? fmtDay(r.last_done) : ""}</TableCell>
                  <TableCell>{r.next_due && !["done", "not_done", "aged_out"].includes(r.status) ? fmtDay(r.next_due) : ""}</TableCell>
                  <TableCell>
                    <Stack direction="row" spacing={0.5} useFlexGap flexWrap="wrap">
                      {canRecord && r.kind === "vaccine" && ["due", "overdue", "near_due", "future"].includes(r.status) && (
                        <Button size="small" variant="outlined" onClick={() => setDialog({ type: "record", items: [r.item] })}>Mark done</Button>
                      )}
                      {canRecord && ["due", "overdue", "near_due"].includes(r.status) && (
                        <Button size="small" onClick={() => setDialog({ type: "notdone", rec: r })}>Not done</Button>
                      )}
                      {r.status === "review" && <Button size="small" variant="outlined" color="secondary" onClick={() => setDialog({ type: "detail", rec: r })}>Review</Button>}
                      {["done", "not_done", "aged_out"].includes(r.status) && <Button size="small" onClick={() => setDialog({ type: "detail", rec: r })}>View</Button>}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="vm-history">
        <Typography component="h3" sx={{ fontSize: "0.95rem", fontWeight: 600, mb: 0.75 }}>History</Typography>
        {data.history.length === 0 ? <Typography variant="body2" color="text.secondary">Nothing recorded yet.</Typography> : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Recorded history">
              <TableHead><TableRow><TableCell>Date</TableCell><TableCell>Item</TableCell><TableCell>What happened</TableCell><TableCell>Product / lot</TableCell><TableCell>By</TableCell><TableCell /></TableRow></TableHead>
              <TableBody>
                {data.history.map((h) => (
                  <TableRow key={h.id} sx={h.status === "entered_in_error" ? { opacity: 0.6, textDecoration: "line-through" } : undefined}>
                    <TableCell>{h.given_on ? fmtDay(h.given_on) : fmtDay(h.created_at)}</TableCell>
                    <TableCell>{h.item_name}</TableCell>
                    <TableCell>{h.status === "done" ? `Dose ${h.dose_number} given` : h.status === "not_done" ? `Not done: ${h.not_done_reason_label}${h.offer_again_on ? `, offer again ${fmtDay(h.offer_again_on)}` : ""}` : "Entered in error"}</TableCell>
                    <TableCell>{[h.product, h.lot_number && `lot ${h.lot_number}`].filter(Boolean).join(", ")}</TableCell>
                    <TableCell>{h.given_by || h.entered_by}</TableCell>
                    <TableCell>{canRecord && h.status !== "entered_in_error" && <Button size="small" onClick={() => setDialog({ type: "void", rec: h })}>Entered in error</Button>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>

      {dialog?.type === "record" && (
        <RecordDoseDialog patient={data.patient} catalog={catalog} firstItems={dialog.items} onClose={() => setDialog(null)}
          onSaved={(b) => afterSave(b, `Recorded ${b.saved.length} ${b.saved.length === 1 ? "dose" : "doses"}.`)} />
      )}
      {dialog?.type === "notdone" && (
        <NotDoneDialog patient={data.patient} rec={dialog.rec} catalog={catalog} onClose={() => setDialog(null)} onSaved={(b) => afterSave(b, "Saved as not done.")} />
      )}
      {dialog?.type === "void" && <VoidDialog rec={dialog.rec} onClose={() => setDialog(null)} onSaved={(b) => afterSave(b, "Marked entered in error.")} />}
      {dialog?.type === "detail" && (
        <DetailDialog rec={dialog.rec} history={data.history} canRecord={canRecord} onClose={() => setDialog(null)}
          onDone={() => setDialog({ type: "record", items: [dialog.rec.item] })} onNotDone={() => setDialog({ type: "notdone", rec: dialog.rec })} />
      )}
    </Box>
  );
}

function fmtAge(months) {
  if (months == null) return "";
  if (months < 24) return `${months} month${months === 1 ? "" : "s"}`;
  return `${Math.floor(months / 12)} years`;
}
