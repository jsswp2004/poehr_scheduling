import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, Paper, Radio, RadioGroup, Stack, TextField, Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "../prescriptions/rxShared";
import DynamicNoteForm from "../DynamicNoteForm";
import { LEVEL_NAMES, answersFromValues, checklist, filterTemplate, fmtVital, suicideAction } from "./triageHelpers";

const FLAG = { bg: "#FEF7E0", border: "#F0C36D", fg: "#7A2E0E" };
const OK = "#054F31";

function VitalCard({ label, value, status, text }) {
  const flagged = status && status !== "ok";
  return (
    <Box data-testid={`tv-${label}`} sx={{ border: `1px solid ${flagged ? FLAG.border : "#D8DEE5"}`, bgcolor: flagged ? FLAG.bg : "transparent", borderRadius: 1, p: 1.25 }}>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography sx={{ fontWeight: 700, fontSize: "1.2rem" }}>{value}</Typography>
      {text && <Typography variant="caption" sx={{ fontWeight: 600, color: flagged ? FLAG.fg : OK }}>{text}</Typography>}
    </Box>
  );
}

function VitalsBlock({ ctx, onRefresh, refreshing }) {
  const v = ctx.vitals || {};
  const f = ctx.vital_flags || {};
  const none = !["hr", "rr", "spo2", "temp_f", "sbp"].some((k) => v[k] !== undefined);
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="triage-vitals">
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography sx={{ fontWeight: 700 }}>Vital signs</Typography>
        <Typography variant="caption" color="text.secondary" sx={{ flexGrow: 1 }}>
          {ctx.band ? `Compared with the range for ${ctx.band.label.toLowerCase()}. ` : ""}From the Vital Signs flowsheet.
        </Typography>
        <Button size="small" variant="outlined" onClick={onRefresh} disabled={refreshing}>Refresh</Button>
      </Stack>
      {none ? (
        <Alert severity="warning" data-testid="triage-no-vitals">No vital signs yet. Enter them in the Vital Signs flowsheet, then refresh.</Alert>
      ) : (
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 1 }}>
          {v.sbp !== undefined && <VitalCard label="Blood pressure" value={`${Math.round(v.sbp)}/${v.dbp !== undefined ? Math.round(v.dbp) : "?"}`} />}
          {v.hr !== undefined && <VitalCard label="Heart rate" value={fmtVital("hr", v.hr)} status={f.hr?.status} text={f.hr?.text} />}
          {v.rr !== undefined && <VitalCard label="Respiratory rate" value={fmtVital("rr", v.rr)} status={f.rr?.status} text={f.rr?.text} />}
          {v.spo2 !== undefined && <VitalCard label="Oxygen saturation" value={fmtVital("spo2", v.spo2)} status={f.spo2?.status} text={f.spo2?.text} />}
          {v.temp_f !== undefined && <VitalCard label="Temperature" value={fmtVital("temp_f", v.temp_f)} status={f.temp?.status} text={f.temp?.text} />}
          {v.weight_kg !== undefined && <VitalCard label="Weight" value={fmtVital("weight_kg", v.weight_kg)} />}
          {v.pain !== undefined && <VitalCard label="Pain" value={`${Math.round(v.pain)} / 10`} />}
        </Box>
      )}
    </Paper>
  );
}

function HistoryBlock({ ctx }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="triage-history">
      <Typography sx={{ fontWeight: 700, mb: 1 }}>Allergies and current medicines</Typography>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Allergies</Typography>
          <Typography data-testid="triage-allergies" sx={{ fontWeight: 600, color: ctx.allergies.emphasis === "alert" ? "#B42318" : "inherit" }}>{ctx.allergies.text}</Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography variant="caption" color="text.secondary">Current medicines ({ctx.medicines.length})</Typography>
          {ctx.medicines.length === 0 && <Typography>None on file</Typography>}
          {ctx.medicines.map((m, i) => (
            <Typography key={i} variant="body2">{[m.name, m.strength, m.dose, m.frequency].filter(Boolean).join(" ")}</Typography>
          ))}
        </Box>
      </Stack>
    </Paper>
  );
}

function SuicideScreen({ ctx, values, onChange, disabled }) {
  const screener = ctx.screener;
  const v = values;
  const set = (key, value) => {
    onChange(key, value);
    if (key === "cssrs_2" && value !== "yes") ["cssrs_3", "cssrs_4", "cssrs_5"].forEach((k) => v[k] && onChange(k, ""));
    if (key === "cssrs_6" && value !== "yes" && v.cssrs_6_recent) onChange("cssrs_6_recent", "");
  };
  const action = suicideAction(v);
  const asked = (q) => !q.ask_if || String(v[q.ask_if] || "") === "yes";
  const yesNo = (key, label) => (
    <RadioGroup row value={v[key] || ""} onChange={(e) => set(key, e.target.value)} aria-label={label}>
      <FormControlLabel value="yes" control={<Radio disabled={disabled} />} label="Yes" />
      <FormControlLabel value="no" control={<Radio disabled={disabled} />} label="No" />
    </RadioGroup>
  );
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="triage-suicide">
      <Typography sx={{ fontWeight: 700 }}>Suicide risk screen</Typography>
      <Typography variant="caption" color="text.secondary">{screener.name}</Typography>
      {!screener.verified && (
        <Alert severity="warning" sx={{ my: 1 }} data-testid="triage-screener-unverified">
          The question wording matches the official Columbia form, but the actions below still need sign-off from your clinical lead. Ask before using it with patients.
        </Alert>
      )}
      {screener.questions.filter(asked).map((q) => (
        <Box key={q.key} sx={{ py: 0.5, borderTop: "1px solid #EEF1F4" }}>
          <Typography variant="body2">{q.number}. {q.text}{q.timeframe ? ` (${q.timeframe})` : ""}</Typography>
          {q.example && <Typography variant="caption" color="text.secondary" sx={{ display: "block", pl: 1 }}>{q.example}</Typography>}
          {yesNo(q.key, `Question ${q.number}`)}
          {q.follow_up && String(v[q.key] || "") === "yes" && (
            <Box sx={{ pl: 2 }}>
              <Typography variant="body2">{q.follow_up.text}</Typography>
              {yesNo(q.follow_up.key, q.follow_up.text)}
            </Box>
          )}
        </Box>
      ))}
      {screener.copyright && <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>{screener.copyright}</Typography>}
      {action === "immediate" && (
        <Alert severity="error" sx={{ mt: 1 }} data-testid="triage-suicide-immediate">{screener.actions.immediate} Signing this note sends a safety alert to the people your clinic chose.</Alert>
      )}
      {action === "referral" && (
        <Alert severity="warning" sx={{ mt: 1 }} data-testid="triage-suicide-referral">{screener.actions.referral}</Alert>
      )}
    </Paper>
  );
}

function EsiHelper({ values, onChange, suggestion, suggesting, disabled }) {
  const v = values;
  const a = v.esi_a_life_saving === "yes";
  const bAny = !!(v.esi_b_high_risk || v.esi_b_confused || v.esi_b_severe_pain);
  const decided = a || bAny;
  const level = Number(v.esi_level) || null;
  const differs = suggestion?.level && level && level !== suggestion.level;
  const resourceButton = (value, label) => (
    <Button key={label} size="small" variant={String(v.esi_resources) === String(value) ? "contained" : "outlined"} disabled={disabled || decided}
      onClick={() => onChange("esi_resources", value)} sx={{ minHeight: 44, flex: 1 }} aria-pressed={String(v.esi_resources) === String(value)}>
      {label}
    </Button>
  );
  return (
    <Stack spacing={1.5} data-testid="triage-esi">
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography sx={{ fontWeight: 700 }}>Triage level (ESI)</Typography>
        <Typography variant="caption" color="text.secondary">Answer in order. The helper suggests a level; you choose.</Typography>

        <Typography variant="overline" sx={{ display: "block", mt: 1 }}>A. Dying?</Typography>
        <Typography variant="body2">Needs a life-saving intervention right now (airway, breathing, circulation)?</Typography>
        <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>
          <Button variant={v.esi_a_life_saving === "yes" ? "contained" : "outlined"} sx={{ minHeight: 44, flex: 1 }} disabled={disabled}
            onClick={() => onChange("esi_a_life_saving", "yes")} aria-pressed={v.esi_a_life_saving === "yes"}>Yes</Button>
          <Button variant={v.esi_a_life_saving === "no" ? "contained" : "outlined"} sx={{ minHeight: 44, flex: 1 }} disabled={disabled}
            onClick={() => onChange("esi_a_life_saving", "no")} aria-pressed={v.esi_a_life_saving === "no"}>No</Button>
        </Stack>

        <Typography variant="overline" sx={{ display: "block", mt: 1 }}>B. Should wait?</Typography>
        <Typography variant="body2">Any of these makes it level 2:</Typography>
        <FormControlLabel control={<Checkbox checked={!!v.esi_b_high_risk} disabled={disabled} onChange={(e) => onChange("esi_b_high_risk", e.target.checked)} />} label="High-risk situation" />
        <FormControlLabel control={<Checkbox checked={!!v.esi_b_confused} disabled={disabled} onChange={(e) => onChange("esi_b_confused", e.target.checked)} />} label="New confusion, lethargy or disorientation" />
        <FormControlLabel control={<Checkbox checked={!!v.esi_b_severe_pain} disabled={disabled} onChange={(e) => onChange("esi_b_severe_pain", e.target.checked)} />} label="Severe pain or distress" />

        <Typography variant="overline" sx={{ display: "block", mt: 1 }}>C. Resources</Typography>
        {decided ? (
          <Typography variant="body2" color="text.secondary">Not needed. Question {a ? "A" : "B"} already decided the level.</Typography>
        ) : (
          <>
            <Typography variant="body2">How many resources before a decision (tests, imaging, IV fluids or medicine, consults, procedures)?</Typography>
            <Stack direction="row" spacing={1} sx={{ mt: 0.5 }}>{resourceButton(0, "None")}{resourceButton(1, "One")}{resourceButton(2, "Two or more")}</Stack>
          </>
        )}

        <Typography variant="overline" sx={{ display: "block", mt: 1 }}>D. Danger-zone vitals</Typography>
        <Typography variant="body2" color={suggestion?.steps?.D?.answer === "yes" ? "inherit" : "text.secondary"} data-testid="triage-step-d">
          {suggestion?.steps?.D?.text || "Only checked for a level 3."}
        </Typography>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "#FEF0C7", borderColor: FLAG.border }} data-testid="triage-suggestion">
        <Typography variant="caption" sx={{ color: "#5C2209", fontWeight: 600 }}>Suggested level</Typography>
        {suggesting && !suggestion ? <CircularProgress size={18} aria-label="Working out the suggestion" /> : null}
        {suggestion?.label ? (
          <>
            <Typography sx={{ fontWeight: 700, fontSize: "1.3rem", color: FLAG.fg }} data-testid="triage-suggested-label">{suggestion.label}{suggestion.name && !suggestion.consider ? "" : ""}</Typography>
            {suggestion.reasons.length > 0 && <Typography variant="body2" sx={{ color: "#5C2209" }}>Because: {suggestion.reasons.join("; ")}.</Typography>}
          </>
        ) : (
          <Typography variant="body2" data-testid="triage-needs">{suggestion?.needs?.[0] || "Answer the questions above."}</Typography>
        )}
        {(suggestion?.prompts || []).map((p, i) => <Alert key={i} severity="warning" sx={{ mt: 1 }} data-testid="triage-prompt">{p}</Alert>)}

        <Typography variant="caption" sx={{ display: "block", mt: 1.5, fontWeight: 600 }}>Your level</Typography>
        <Stack direction="row" spacing={1} data-testid="triage-level-buttons">
          {[1, 2, 3, 4, 5].map((n) => (
            <Button key={n} variant={level === n ? "contained" : "outlined"} disabled={disabled} onClick={() => onChange("esi_level", n)}
              aria-pressed={level === n} aria-label={`ESI ${n}: ${LEVEL_NAMES[n]}`} sx={{ minHeight: 48, minWidth: 0, flex: 1, fontWeight: 700 }}>{n}</Button>
          ))}
        </Stack>
        {suggestion?.level && !level && (
          <Button size="small" sx={{ mt: 0.5 }} onClick={() => onChange("esi_level", suggestion.level)}>Use ESI {suggestion.level}</Button>
        )}
        {level && <Typography variant="body2" sx={{ mt: 0.5 }}>ESI {level}: {LEVEL_NAMES[level]}</Typography>}
        {differs && (
          <TextField label="Reason, because this differs from the suggestion" size="small" fullWidth multiline minRows={2} sx={{ mt: 1, bgcolor: "#fff" }}
            value={v.esi_override_reason || ""} onChange={(e) => onChange("esi_override_reason", e.target.value)} disabled={disabled} inputProps={{ "data-testid": "triage-reason" }} />
        )}
        <Typography variant="caption" sx={{ display: "block", mt: 1, color: "#5C2209" }}>Signing saves this level to the visit and shows it on the ED board.</Typography>
      </Paper>
    </Stack>
  );
}

function Checklist({ items }) {
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }} data-testid="triage-checklist">
      <Typography sx={{ fontWeight: 700, mb: 0.5 }}>Before you sign</Typography>
      {items.map((it) => (
        <Typography key={it.label} variant="body2" data-testid={`check-${it.done ? "done" : it.blocking ? "missing" : "optional"}`}>
          <strong style={{ color: it.done ? OK : it.blocking ? FLAG.fg : "#52606D" }}>{it.done ? "Done" : it.blocking ? "Missing" : "Not yet"}</strong> {it.label}
        </Typography>
      ))}
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>Signing locks the note. Changes afterwards are added as an addendum.</Typography>
    </Paper>
  );
}

/** The triage note: the generic form for most fields, with the ESI helper, vitals, history and screening beside it. */
export default function TriageNoteForm({ template, values, onChange, disabled, patientId, visitId }) {
  const [ctx, setCtx] = useState(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [suggesting, setSuggesting] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const loadContext = useCallback(async () => {
    setError("");
    setRefreshing(true);
    try {
      const res = await api.get(apiEndpoints.triageContext(patientId, visitId), { headers: await authHeader() });
      setCtx(res.data);
    } catch (e) {
      setError(errorText(e, "Could not load the triage details."));
    } finally {
      setRefreshing(false);
    }
  }, [patientId, visitId]);
  useEffect(() => { loadContext(); }, [loadContext]);

  // A child's weight from the flowsheet fills the field the first time, so it is not typed twice.
  useEffect(() => {
    if (ctx?.patient?.is_child && ctx.vitals?.weight_kg && !values.child_weight_kg) onChangeRef.current("child_weight_kg", ctx.vitals.weight_kg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const answerKey = JSON.stringify(answersFromValues(values));
  useEffect(() => {
    if (!ctx || ctx.problem) return undefined;
    let cancelled = false;
    setSuggesting(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.post(apiEndpoints.triageSuggest(patientId), JSON.parse(answerKey), { headers: await authHeader() });
        if (!cancelled) setSuggestion(res.data);
      } catch (e) {
        if (!cancelled) setError(errorText(e, "Could not work out the suggested level."));
      } finally {
        if (!cancelled) setSuggesting(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [ctx, answerKey, patientId]);

  const filtered = useMemo(() => filterTemplate(template, ctx), [template, ctx]);

  if (error && !ctx) return <Alert severity="error" data-testid="triage-error">{error}</Alert>;
  if (!ctx) return <Box sx={{ p: 2 }}><CircularProgress size={22} aria-label="Loading triage details" /></Box>;
  if (ctx.problem) return <Alert severity="warning" data-testid="triage-problem">{ctx.problem_text}</Alert>;

  return (
    <Box data-testid="triage-note-form" sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "flex-start" }}>
      {error && <Alert severity="error" sx={{ width: "100%" }} onClose={() => setError("")}>{error}</Alert>}
      <Stack spacing={2} sx={{ flex: "1 1 520px", minWidth: 0 }}>
        {ctx.patient.is_child && (
          <Alert severity="info" data-testid="triage-child-note">Child version of the form ({ctx.band.label.toLowerCase()}). Weight in kg is required.</Alert>
        )}
        <VitalsBlock ctx={ctx} onRefresh={loadContext} refreshing={refreshing} />
        <HistoryBlock ctx={ctx} />
        <DynamicNoteForm template={filtered} values={values} onChange={onChange} disabled={disabled} />
        {String(values.screen_unsafe_home || "").toLowerCase() === "yes" && (
          <Alert severity="warning" data-testid="triage-unsafe-home">
            The patient feels unsafe at home or was hurt by someone else. Ask privately. Signing this note sends a safety alert to the people your clinic chose.
          </Alert>
        )}
        {ctx.patient.show_suicide_screen && <SuicideScreen ctx={ctx} values={values} onChange={onChange} disabled={disabled} />}
      </Stack>
      <Stack spacing={2} sx={{ flex: "0 0 340px", maxWidth: "100%", position: "sticky", top: 8 }}>
        <EsiHelper values={values} onChange={onChange} suggestion={suggestion} suggesting={suggesting} disabled={disabled} />
        <Checklist items={checklist(values, ctx, suggestion)} />
      </Stack>
    </Box>
  );
}
