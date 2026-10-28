import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, List, ListItemButton, ListItemText, Paper, Stack, TextField, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { BuilderSplit, BuilderToolbar } from "../builders/BuilderShell";
import { authHeader, errorText } from "../patientHeader/headerApi";
import {
  FEVER_FIELDS, LEVELS, LEVEL_TITLES, addBand, ageFromText, bandStarts, feverFromDraft, feverToDraft, gapsFromDraft, gapsToDraft,
  removeLastBand, sourceLine, zoneFromDraft, zoneToDraft,
} from "./triageSettingsHelpers";

// One section of the settings. Every section stays mounted (so a half-typed draft survives switching sections);
// only the chosen one is shown, and its Save buttons are rendered into the pinned toolbar.
function Section({ title, note, status, children, actions, error, active }) {
  return (
    <Paper variant="outlined" sx={{ p: 2, display: active ? "block" : "none" }} data-testid={`section-${title}`}>
      <Typography sx={{ fontWeight: 700 }}>{title}</Typography>
      {note && <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>{note}</Typography>}
      {status && <Typography variant="caption" sx={{ display: "block", mb: 1, fontWeight: 600 }}>{status}</Typography>}
      {children}
      {error && <Alert severity="error" sx={{ mt: 1 }} data-testid="settings-error">{error}</Alert>}
      <BuilderToolbar>
        <Stack direction="row" spacing={1} sx={{ mt: { xs: 1.5, md: 0 }, flex: 1, justifyContent: "flex-end", display: active ? "flex" : "none" }}>{actions}</Stack>
      </BuilderToolbar>
    </Paper>
  );
}

const SECTION_TITLES = ["Recheck times", "Vital sign limits by age", "Fever limits for children", "Safety alerts", "Suicide screen"];

/** The clinic's triage numbers: recheck times, the age table for vital signs, fever limits, and when the suicide screen starts. */
export default function TriageSettings({ canEdit = true }) {
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [gaps, setGaps] = useState(gapsToDraft({}));
  const [zone, setZone] = useState(zoneToDraft(null));
  const [fever, setFever] = useState(feverToDraft(null));
  const [age, setAge] = useState("");
  const [alertIds, setAlertIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState({});
  const [activeSection, setActiveSection] = useState(SECTION_TITLES[0]);

  const apply = useCallback((s) => {
    setSettings(s);
    setGaps(gapsToDraft(s.reassess_minutes));
    setZone(zoneToDraft(s.danger_zone));
    setFever(feverToDraft(s.fever));
    setAlertIds(s.alert_user_ids || []);
    setAge(s.clinic?.suicide_screen_min_age_years === null || s.clinic?.suicide_screen_min_age_years === undefined ? "" : String(s.clinic.suicide_screen_min_age_years));
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const res = await api.get(apiEndpoints.triageSettings, { headers: await authHeader() });
        if (live) apply(res.data);
      } catch (e) {
        if (live) setLoadError(errorText(e, "Could not load the triage settings."));
      }
    })();
    return () => { live = false; };
  }, [apply]);

  const save = async (section, body, done) => {
    setBusy(true);
    setErrors((e) => ({ ...e, [section]: "" }));
    try {
      const res = await api.put(apiEndpoints.triageSettings, body, { headers: await authHeader() });
      apply(res.data);
      toast.success(done);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [section]: errorText(e, "That did not save.") }));
    } finally {
      setBusy(false);
    }
  };
  const check = (section, result, body, done) => {
    if (result.problem) { setErrors((e) => ({ ...e, [section]: result.problem })); return; }
    save(section, body(result.value), done);
  };

  if (loadError) return <Alert severity="error" data-testid="settings-load-error">{loadError}</Alert>;
  if (!settings) return <CircularProgress size={22} aria-label="Loading triage settings" />;

  const clinic = settings.clinic || {};
  const starts = bandStarts(zone);
  const setBand = (i, key) => (e) => setZone((z) => ({ ...z, bands: z.bands.map((b, j) => (j === i ? { ...b, [key]: e.target.value } : b)) }));
  const off = busy || !canEdit;

  return (
    <Box data-testid="triage-settings">
      {!canEdit && <Alert severity="info" sx={{ mb: 2 }}>Only an administrator can change these numbers.</Alert>}
      <BuilderSplit
        list={
          <List dense aria-label="Settings sections" disablePadding>
            {SECTION_TITLES.map((t) => (
              <ListItemButton key={t} selected={activeSection === t} onClick={() => setActiveSection(t)} data-testid={`section-link-${t}`}>
                <ListItemText primary={t} />
              </ListItemButton>
            ))}
          </List>
        }
      >

      <Section title="Recheck times" active={activeSection === "Recheck times"} error={errors.gaps}
        note="How many minutes a waiting patient can go before the next recheck, for each triage level. Leave a level blank to show no due time for it."
        actions={<Button size="small" variant="contained" disabled={off} onClick={() => check("gaps", gapsFromDraft(gaps), (v) => ({ reassess_minutes: v }), "Recheck times saved.")}>Save recheck times</Button>}>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 1.5 }}>
          {LEVELS.map((n) => (
            <TextField key={n} size="small" label={`ESI ${n}: ${LEVEL_TITLES[n]}`} value={gaps[n]} disabled={off} helperText="minutes"
              onChange={(e) => setGaps((g) => ({ ...g, [n]: e.target.value }))} inputProps={{ inputMode: "numeric", "data-testid": `gap-${n}` }} />
          ))}
        </Box>
      </Section>

      <Section title="Vital sign limits by age" active={activeSection === "Vital sign limits by age"} error={errors.zone} status={sourceLine(clinic.danger_zone, clinic)}
        note={`A patient whose heart rate or breathing rate is over the limit for their age, or whose oxygen is under the limit, is flagged. ${settings.sources?.danger_zone || ""}`}
        actions={
          <>
            <Button size="small" variant="contained" disabled={off} onClick={() => check("zone", zoneFromDraft(zone), (v) => ({ danger_zone: v }), "Age table saved.")}>Save age table</Button>
            <Button size="small" disabled={off || !clinic.danger_zone} onClick={() => save("zone", { danger_zone: null }, "Went back to the built-in age table.")}>Use the built-in table</Button>
          </>
        }>
        <table style={{ borderCollapse: "collapse", fontSize: 14 }} data-testid="zone-table">
          <thead>
            <tr style={{ textAlign: "left", color: "#3E4C59", fontSize: 12 }}>
              {["From (months)", "Up to (months)", "Heart rate over", "Breathing rate over"].map((h) => <th key={h} style={{ padding: "4px 8px" }}>{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {zone.bands.map((b, i) => {
              const last = i === zone.bands.length - 1;
              return (
                <tr key={i} data-testid="zone-band">
                  <td style={{ padding: "4px 8px" }}>{Number.isFinite(starts[i]) ? starts[i] : "?"}</td>
                  <td style={{ padding: "4px 8px" }}>
                    {last ? "and older" : <TextField size="small" value={b.max} disabled={off} onChange={setBand(i, "max")} inputProps={{ inputMode: "decimal", "data-testid": `band-max-${i}`, style: { width: 70 } }} />}
                  </td>
                  <td style={{ padding: "4px 8px" }}><TextField size="small" value={b.hr} disabled={off} onChange={setBand(i, "hr")} inputProps={{ inputMode: "numeric", "data-testid": `band-hr-${i}`, style: { width: 70 } }} /></td>
                  <td style={{ padding: "4px 8px" }}><TextField size="small" value={b.rr} disabled={off} onChange={setBand(i, "rr")} inputProps={{ inputMode: "numeric", "data-testid": `band-rr-${i}`, style: { width: 70 } }} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
          <Button size="small" variant="outlined" disabled={off} onClick={() => setZone(addBand)}>Add an age band</Button>
          <Button size="small" variant="outlined" disabled={off || zone.bands.length <= 1} onClick={() => setZone(removeLastBand)}>Remove the last band</Button>
        </Stack>
        <TextField size="small" label="Oxygen saturation under" value={zone.spo2} disabled={off} sx={{ mt: 1.5, width: 200 }} helperText="percent"
          onChange={(e) => setZone((z) => ({ ...z, spo2: e.target.value }))} inputProps={{ inputMode: "numeric", "data-testid": "zone-spo2" }} />
      </Section>

      <Section title="Fever limits for children" active={activeSection === "Fever limits for children"} error={errors.fever} status={sourceLine(clinic.fever, clinic)}
        note={`Fever rules apply to patients under 18 only. ${settings.sources?.fever || ""}`}
        actions={
          <>
            <Button size="small" variant="contained" disabled={off} onClick={() => check("fever", feverFromDraft(fever), (v) => ({ fever: v }), "Fever limits saved.")}>Save fever limits</Button>
            <Button size="small" disabled={off || !clinic.fever} onClick={() => save("fever", { fever: null }, "Went back to the built-in fever limits.")}>Use the built-in limits</Button>
          </>
        }>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 1.5 }}>
          {FEVER_FIELDS.map((f) => (
            <TextField key={f.key} size="small" label={f.label} value={fever[f.key]} disabled={off}
              onChange={(e) => setFever((v) => ({ ...v, [f.key]: e.target.value }))} inputProps={{ inputMode: "decimal", "data-testid": `fever-${f.key}` }} />
          ))}
        </Box>
      </Section>

      <Section title="Safety alerts" active={activeSection === "Safety alerts"} error={errors.alerts}
        note="Who is told at once when a signed triage note has a positive suicide screen (intent or a plan, or recent behavior) or a patient who feels unsafe at home. They are added to the patient's care-team conversation and sent an urgent message. The patient's own doctor and nurse are told too."
        status={alertIds.length === 0 ? "Nobody chosen yet. The nurse who signs is told to phone the charge nurse." : `${alertIds.length} chosen.`}
        actions={<Button size="small" variant="contained" disabled={off} onClick={() => save("alerts", { alert_user_ids: alertIds }, "Safety alert people saved.")}>Save safety alert people</Button>}>
        {(settings.people || []).length === 0 && <Typography variant="body2" color="text.secondary">No doctors, nurses or admins who use secure messaging were found.</Typography>}
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 0.5 }} data-testid="alert-people">
          {(settings.people || []).map((p) => (
            <FormControlLabel key={p.id} label={`${p.name} (${p.role})`}
              control={<Checkbox size="small" checked={alertIds.includes(p.id)} disabled={off}
                onChange={(e) => setAlertIds((ids) => (e.target.checked ? [...ids, p.id] : ids.filter((i) => i !== p.id)))} inputProps={{ "data-testid": `alert-person-${p.id}` }} />} />
          ))}
        </Box>
      </Section>

      <Section title="Suicide screen" active={activeSection === "Suicide screen"} error={errors.age}
        note="The youngest age, in years, at which the suicide risk questions are asked at triage. Leave blank to start at 18."
        actions={<Button size="small" variant="contained" disabled={off} onClick={() => check("age", ageFromText(age), (v) => ({ suicide_screen_min_age_years: v }), "Suicide screen age saved.")}>Save starting age</Button>}>
        <TextField size="small" label="Starting age (years)" value={age} disabled={off} sx={{ width: 200 }} onChange={(e) => setAge(e.target.value)} inputProps={{ inputMode: "numeric", "data-testid": "screen-age" }} />
      </Section>
      </BuilderSplit>
    </Box>
  );
}
