import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode";
import { Alert, Box, Button, CircularProgress, Container, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { toast } from "../components/SimpleToast";
import { authHeader } from "../components/patientHeader/headerApi";
import DynamicNoteForm from "../components/DynamicNoteForm";
import { DictationProvider, useDictationConfig } from "../components/dictation/DictationContext";
import DictationTextField from "../components/dictation/DictationTextField";
import DictateNoteBar, { describeValue } from "../components/dictation/DictateNoteBar";
import PatientSearch from "../components/dictation/PatientSearch";
import NoteTypeSearch, { rememberNoteType } from "../components/dictation/NoteTypeSearch";

const CLEANUP_ERRORS = {
  503: "AI cleanup is not available right now. Your dictation is still here.",
  429: "Too many requests. Try again in a minute.",
  403: "AI cleanup is not turned on for your account.",
};

const SOAP_FIELDS = ["Subjective", "Objective", "Assessment", "Plan"].map((label) => ({
  key: label.toLowerCase(),
  label,
  field_type: "textarea",
  options: [],
}));

// Same rule the server enforces: nurses write nursing assessments, doctors write doctor assessments,
// and admins may write either.
function authorNoteType() {
  try {
    return jwtDecode(localStorage.getItem("access_token")).role === "nurse" ? "nursing_assessment" : "doctor_assessment";
  } catch (e) {
    return "doctor_assessment";
  }
}

const isEmpty = (v) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

function visitLabel(v) {
  const when = v.appointment_datetime ? new Date(v.appointment_datetime).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "";
  return [v.title || "Visit", when, v.status].filter(Boolean).join(" · ");
}

function saveError(err) {
  const d = err?.response?.data;
  if (d?.detail) return String(d.detail);
  if (d && typeof d === "object") {
    const text = Object.values(d).flat().filter((x) => typeof x === "string").join(" ");
    if (text) return text;
  }
  return "Could not save the draft. Your dictation is still here.";
}

/** The stand-alone dictation tool. With no patient or note type it is a plain dictation box; with them it can start a draft note. */
function DictateBody() {
  const { enabled, cleanup } = useDictationConfig();
  const [text, setText] = useState("");
  const [cleaning, setCleaning] = useState(false);
  const [proposal, setProposal] = useState(null);
  const [error, setError] = useState("");

  const [patient, setPatient] = useState(null);
  const [visits, setVisits] = useState([]);
  const [visit, setVisit] = useState(null);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsFailed, setVisitsFailed] = useState(false);

  const [noteType, setNoteType] = useState(null);
  const [template, setTemplate] = useState(null);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [templateFailed, setTemplateFailed] = useState(false);
  const [values, setValues] = useState({});

  const [saving, setSaving] = useState(false);
  const [saveProblem, setSaveProblem] = useState("");
  const [saved, setSaved] = useState(null);

  // The patient's recent visits: a clinical note always belongs to one of them.
  useEffect(() => {
    setVisits([]);
    setVisit(null);
    setVisitsFailed(false);
    if (!patient) return undefined;
    let live = true;
    (async () => {
      setVisitsLoading(true);
      try {
        const { data } = await api.get(apiEndpoints.appointments, {
          params: { patient: patient.userId, limit: 10 },
          headers: await authHeader(),
        });
        const rows = Array.isArray(data) ? data : data?.results || [];
        if (live) {
          setVisits(rows);
          setVisit(rows[0] || null);
        }
      } catch (e) {
        if (live) setVisitsFailed(true);
      } finally {
        if (live) setVisitsLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [patient]);

  // A template note needs the template's fields.
  useEffect(() => {
    setTemplate(null);
    setTemplateFailed(false);
    if (!noteType || noteType.kind !== "template") return undefined;
    let live = true;
    (async () => {
      setTemplateLoading(true);
      try {
        const { data } = await api.get(apiEndpoints.noteTemplate(noteType.code), { headers: await authHeader() });
        if (live) setTemplate(data);
      } catch (e) {
        if (live) setTemplateFailed(true);
      } finally {
        if (live) setTemplateLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [noteType]);

  const fields =
    noteType?.kind === "soap"
      ? SOAP_FIELDS
      : (template?.fields || [])
          .filter((f) => f.field_type !== "calculated")
          .map((f) => ({ key: f.key, label: f.label, field_type: f.field_type, options: f.options || [] }));

  const anyValue = Object.values(values).some((v) => !isEmpty(v));
  const hasWork = !!text.trim() || anyValue;

  // The words live only in this browser tab until they are saved as a draft, so warn before they are lost.
  useEffect(() => {
    if (!hasWork || saved) return undefined;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasWork, saved]);

  if (!enabled) {
    return (
      <Alert severity="info">
        Dictation is not turned on for your account. An administrator can switch it on in Settings &gt; Dictation.
      </Alert>
    );
  }

  const chooseNoteType = (next) => {
    setNoteType(next);
    setValues({});
    setSaveProblem("");
    setProposal(null);
  };

  const setValue = (key, value) => setValues((v) => ({ ...v, [key]: value }));

  const runCleanup = async () => {
    setCleaning(true);
    setError("");
    setProposal(null);
    try {
      const { data } = await api.post(apiEndpoints.dictationCleanup, { transcript: text }, { headers: await authHeader() });
      setProposal(data);
    } catch (err) {
      setError(CLEANUP_ERRORS[err?.response?.status] || "AI cleanup could not finish. Your dictation is still here.");
    } finally {
      setCleaning(false);
    }
  };

  // What Copy and Download use: the free text, or the filled fields as "Label: value" lines.
  const plainText = noteType
    ? fields
        .filter((f) => !isEmpty(values[f.key]))
        .map((f) => `${f.label}: ${describeValue(f, values[f.key])}`)
        .join("\n")
    : text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(plainText);
      toast.success("Copied.");
    } catch (e) {
      toast.error("Could not copy. Select the text and copy it yourself.");
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([plainText], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "dictation.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const createDraft = async () => {
    setSaving(true);
    setSaveProblem("");
    try {
      const base = { appointment: visit.id, note_type: authorNoteType(), documentation_type: noteType.code };
      const body =
        noteType.kind === "soap"
          ? { ...base, subjective: values.subjective || "", objective: values.objective || "", assessment: values.assessment || "", plan: values.plan || "" }
          : { ...base, template: template.id, structured_data: values };
      await api.post(apiEndpoints.clinicalNotes, body, { headers: await authHeader() });
      rememberNoteType(noteType.code);
      setSaved({ patient: patient.name, type: noteType.name });
    } catch (err) {
      setSaveProblem(saveError(err));
    } finally {
      setSaving(false);
    }
  };

  const startAnother = () => {
    setSaved(null);
    setValues({});
    setText("");
    setProposal(null);
    setNoteType(null);
  };

  const missing = [];
  if (!patient) missing.push("a patient");
  else if (!visit) missing.push("a visit");
  if (!noteType) missing.push("a note type");
  if (noteType && !anyValue) missing.push("some dictated text");
  const canDraft = missing.length === 0 && !saving && (noteType?.kind === "soap" || !!template);
  const empty = !plainText.trim();

  if (saved) {
    return (
      <Alert
        severity="success"
        action={
          <Button color="inherit" size="small" onClick={startAnother}>
            Start another
          </Button>
        }
      >
        Saved as a draft {saved.type} for {saved.patient}. Open it from the patient's Clinical Notes to review and sign it. Nothing is signed yet.
      </Alert>
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
        <Box sx={{ flex: 1 }}>
          <PatientSearch value={patient} onChange={setPatient} disabled={saving} />
        </Box>
        <Box sx={{ flex: 1 }}>
          <NoteTypeSearch value={noteType} onChange={chooseNoteType} disabled={saving} />
        </Box>
      </Stack>

      {patient && (
        <Box>
          {visitsLoading && <CircularProgress size={20} aria-label="Loading visits" />}
          {visitsFailed && <Alert severity="warning">Could not load this patient's visits. You can still copy the text.</Alert>}
          {!visitsLoading && !visitsFailed && visits.length === 0 && (
            <Alert severity="info">This patient has no visits to attach a note to. You can still dictate and copy the text.</Alert>
          )}
          {visits.length > 0 && (
            <TextField select fullWidth size="small" label="Visit for this note" value={visit ? visit.id : ""} onChange={(e) => setVisit(visits.find((v) => v.id === e.target.value) || null)}>
              {visits.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {visitLabel(v)}
                </MenuItem>
              ))}
            </TextField>
          )}
        </Box>
      )}

      {!noteType && (
        <>
          <DictationTextField
            label="Dictation"
            multiline
            minRows={12}
            fullWidth
            value={text}
            onChange={(e) => setText(e.target.value)}
            helperText="Press the microphone and speak. Say “new paragraph” or “new line” for breaks, “stop dictation” to finish. You can also type and edit. Choose a note type above to fill note fields."
          />
          {cleanup && (
            <Box>
              <Button variant="contained" onClick={runCleanup} disabled={!text.trim() || cleaning}>
                {cleaning ? "Cleaning up..." : "Clean up"}
              </Button>
            </Box>
          )}
          {error && <Alert severity="error">{error}</Alert>}
          {proposal && (
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Cleaned-up version (review before using)
              </Typography>
              <Typography sx={{ whiteSpace: "pre-wrap" }}>{proposal.cleaned}</Typography>
              {proposal.uncertain && proposal.uncertain.length > 0 && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  Check these, the dictation was unclear or hedged: {proposal.uncertain.join("; ")}
                </Alert>
              )}
              <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
                <Button
                  variant="contained"
                  onClick={() => {
                    setText(proposal.cleaned);
                    setProposal(null);
                  }}
                >
                  Use cleaned text
                </Button>
                <Button onClick={() => setProposal(null)}>Keep my original</Button>
              </Stack>
            </Paper>
          )}
        </>
      )}

      {noteType && templateLoading && <CircularProgress size={20} aria-label="Loading note type" />}
      {noteType && templateFailed && <Alert severity="error">Could not load this note type. Pick it again or choose another.</Alert>}
      {noteType && fields.length > 0 && (
        <>
          <DictateNoteBar fields={fields} getValue={(key) => values[key]} onApply={(next) => setValues((v) => ({ ...v, ...next }))} disabled={saving} />
          {noteType.kind === "soap" ? (
            <Stack spacing={2}>
              {SOAP_FIELDS.map((f) => (
                <DictationTextField key={f.key} label={f.label} multiline minRows={3} fullWidth value={values[f.key] || ""} onChange={(e) => setValue(f.key, e.target.value)} />
              ))}
            </Stack>
          ) : (
            template && <DynamicNoteForm template={template} values={values} onChange={setValue} disabled={saving} />
          )}
        </>
      )}

      {saveProblem && <Alert severity="error">{saveProblem}</Alert>}

      <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap alignItems="center">
        {noteType && (
          <Button variant="contained" onClick={createDraft} disabled={!canDraft}>
            {saving ? "Saving..." : `Open as a draft ${noteType.name}`}
          </Button>
        )}
        <Button onClick={copy} disabled={empty}>
          {noteType ? "Copy text instead" : "Copy"}
        </Button>
        <Button onClick={download} disabled={empty}>
          Download .txt
        </Button>
      </Stack>
      {noteType && missing.length > 0 && (
        <Typography variant="body2" color="text.secondary">
          To save a draft you still need {missing.join(" and ")}.
        </Typography>
      )}
    </Stack>
  );
}

export default function DictatePage() {
  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Box sx={{ mb: 2 }}>
        <Typography variant="h5">POWER Dictate</Typography>
        <Typography variant="body2" color="text.secondary">
          Speak instead of typing. Nothing goes into a chart unless you save a draft note, and a draft is never signed for you.
        </Typography>
      </Box>
      <DictationProvider>
        <DictateBody />
      </DictationProvider>
    </Container>
  );
}
