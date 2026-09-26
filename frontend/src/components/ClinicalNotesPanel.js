import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Grid,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
  Stack,
  Tabs,
  Tab,
} from "@mui/material";
import { jwtDecode } from "jwt-decode";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { getValidToken } from "../utils/auth";
import { toast } from "./SimpleToast";
import DynamicNoteForm, {
  DynamicNoteSummary,
  isFieldVisible,
  buildNotePreviewSections,
} from "./DynamicNoteForm";
import NotePreviewPane from "./NotePreviewPane";

const NOTE_TYPE_BY_ROLE = {
  doctor: "doctor_assessment",
  nurse: "nursing_assessment",
};

const NOTE_TYPE_LABELS = {
  doctor_assessment: "Doctor Assessment",
  nursing_assessment: "Nursing Assessment",
};

// Dictionary of documentation types available to the physician when
// authoring a note. This is separate from note_type (which tracks the
// author's clinical role -- doctor vs. nurse) -- it's a further
// classification of the note itself. More types can be added here as
// they're defined; only two exist for now.
const DOCUMENTATION_TYPES = [
  { value: "initial_assessment", label: "Initial Assessment" },
  { value: "progress_note", label: "Progress Note" },
  { value: "admission_note", label: "Admission Note" },
];

// documentation_type values that are rendered from a configurable
// NoteTemplate (DynamicNoteForm) instead of the fixed SOAP fields below.
// This is the only place a new structured note type needs to be listed on
// the frontend -- its actual fields live entirely in the NoteTemplate /
// NoteFieldDefinition rows on the backend.
const TEMPLATE_DRIVEN_TYPES = new Set(["admission_note"]);

const EMPTY_FORM = {
  appointment: "",
  note_type: "",
  documentation_type: DOCUMENTATION_TYPES[0].value,
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
  template: null,
  structured_data: {},
};

// The shared `api` axios instance (frontend/src/api/client.js) has no
// request interceptor of its own -- Authorization headers must be attached
// explicitly per-call, matching the convention used by usePatientData,
// useDoctorsData, and useOrganizationsData. Without this, every request
// from this panel returns 401 even with a valid, freshly-issued token.
const authHeader = async () => {
  const token = await getValidToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token.access_token || token}` };
};

/**
 * Clinical documentation panel for a single patient: SOAP-structured
 * nursing/doctor assessments tied to a specific appointment.
 *
 * Only rendered for doctor/nurse/admin/system_admin roles -- the parent
 * page is responsible for that gate, but this component also checks the
 * role itself as a second line of defense.
 */
function ClinicalNotesPanel({ patientId, patientName }) {
  const [userRole, setUserRole] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState(EMPTY_FORM);
  const [draftId, setDraftId] = useState(null); // id of the note being drafted/edited
  const [amendsId, setAmendsId] = useState(null); // set when writing an addendum
  const [activeTab, setActiveTab] = useState("documentation");

  // NoteTemplate definitions for template-driven documentation types
  // (see TEMPLATE_DRIVEN_TYPES), keyed by code and cached across selections
  // so switching back and forth doesn't re-fetch.
  const [templatesByCode, setTemplatesByCode] = useState({});
  const [templateLoading, setTemplateLoading] = useState(false);

  const loadData = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const headers = await authHeader();
      const [apptRes, notesRes] = await Promise.all([
        api.get(`/api/appointments/?patient=${patientId}`, { headers }),
        api.get(`/api/clinical-notes/?patient=${patientId}`, { headers }),
      ]);
      const apptList = Array.isArray(apptRes.data)
        ? apptRes.data
        : apptRes.data?.results || [];
      const noteList = Array.isArray(notesRes.data)
        ? notesRes.data
        : notesRes.data?.results || [];
      setAppointments(apptList);
      setNotes(noteList);
    } catch (err) {
      console.error("Failed to load clinical notes data:", err);
      toast.error("Could not load clinical notes.");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    const init = async () => {
      const token = await getValidToken();
      if (!token) return;
      try {
        const decoded = jwtDecode(token.access_token || token);
        setUserRole(decoded.role || null);
        const defaultType = NOTE_TYPE_BY_ROLE[decoded.role];
        if (defaultType) {
          setForm((f) => ({ ...f, note_type: defaultType }));
        }
      } catch (err) {
        console.error("Failed to decode token:", err);
      }
    };
    init();
    loadData();
  }, [loadData]);

  // Whenever the selected documentation type is template-driven, fetch its
  // NoteTemplate definition (fields + dictionary options) so DynamicNoteForm
  // can render it, and record the template's id on the form so the backend
  // can snapshot its current version at creation time. Cached by code so
  // switching between types repeatedly doesn't keep re-fetching.
  useEffect(() => {
    const code = form.documentation_type;
    if (!TEMPLATE_DRIVEN_TYPES.has(code)) {
      if (form.template !== null) {
        setForm((f) => ({ ...f, template: null }));
      }
      return;
    }
    if (templatesByCode[code]) {
      if (form.template !== templatesByCode[code].id) {
        setForm((f) => ({ ...f, template: templatesByCode[code].id }));
      }
      return;
    }

    let cancelled = false;
    const fetchTemplate = async () => {
      setTemplateLoading(true);
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.noteTemplate(code), { headers });
        if (cancelled) return;
        setTemplatesByCode((prev) => ({ ...prev, [code]: res.data }));
        setForm((f) => (f.documentation_type === code ? { ...f, template: res.data.id } : f));
      } catch (err) {
        console.error(`Failed to load note template "${code}":`, err);
        toast.error("Could not load the form for this documentation type.");
      } finally {
        if (!cancelled) setTemplateLoading(false);
      }
    };
    fetchTemplate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.documentation_type]);

  const canAuthor = ["doctor", "nurse", "admin", "system_admin"].includes(
    userRole
  );

  const isTemplateDriven = TEMPLATE_DRIVEN_TYPES.has(form.documentation_type);
  const currentTemplate = templatesByCode[form.documentation_type] || null;

  // Feeds the live preview pane (and its Print button) alongside the form --
  // built fresh on every render from whatever's currently in `form`, so it
  // always mirrors exactly what the author has typed so far.
  const selectedAppointment = appointments.find((a) => a.id === form.appointment);
  const previewTitle =
    DOCUMENTATION_TYPES.find((dt) => dt.value === form.documentation_type)?.label ||
    "Clinical Note";
  const previewMeta = [
    patientName ? `Patient: ${patientName}` : null,
    selectedAppointment
      ? `${selectedAppointment.title} - ${new Date(
          selectedAppointment.appointment_datetime
        ).toLocaleString()}`
      : null,
    form.note_type ? NOTE_TYPE_LABELS[form.note_type] : null,
  ];
  const previewSections = isTemplateDriven
    ? currentTemplate
      ? buildNotePreviewSections(currentTemplate.fields, form.structured_data)
      : []
    : [
        {
          tabLabel: "",
          sections: [
            {
              sectionLabel: "",
              entries: [
                { label: "Subjective", display: form.subjective || "", empty: !form.subjective },
                { label: "Objective", display: form.objective || "", empty: !form.objective },
                { label: "Assessment", display: form.assessment || "", empty: !form.assessment },
                { label: "Plan", display: form.plan || "", empty: !form.plan },
              ],
            },
          ],
        },
      ];

  const handleStructuredFieldChange = (key, value) => {
    setForm((f) => ({
      ...f,
      structured_data: { ...f.structured_data, [key]: value },
    }));
  };

  if (!canAuthor && !loading && notes.length === 0) {
    // Not a clinical role and nothing to show -- render nothing at all.
    return null;
  }

  const handleFieldChange = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
  };

  const resetForm = () => {
    const defaultType = NOTE_TYPE_BY_ROLE[userRole] || "";
    setForm({ ...EMPTY_FORM, note_type: defaultType });
    setDraftId(null);
    setAmendsId(null);
  };

  const validateTemplateRequiredFields = () => {
    if (!isTemplateDriven || !currentTemplate) return true;
    const missing = (currentTemplate.fields || []).filter(
      (f) =>
        f.required &&
        isFieldVisible(f, form.structured_data) &&
        !form.structured_data[f.key] &&
        form.structured_data[f.key] !== false
    );
    if (missing.length > 0) {
      toast.error(`Please complete: ${missing.map((f) => f.label).join(", ")}`);
      return false;
    }
    return true;
  };

  const startAddendum = (note) => {
    // Seed the template cache from the note's own snapshot so the form
    // renders immediately without waiting on a fetch, if this documentation
    // type hasn't been loaded yet in this session.
    if (note.template_detail && !templatesByCode[note.documentation_type]) {
      setTemplatesByCode((prev) => ({
        ...prev,
        [note.documentation_type]: note.template_detail,
      }));
    }
    setForm({
      appointment: note.appointment,
      note_type: note.note_type,
      documentation_type: note.documentation_type || DOCUMENTATION_TYPES[0].value,
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
      template: note.template || null,
      structured_data: {},
    });
    setDraftId(null);
    setAmendsId(note.id);
    setActiveTab("documentation");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveDraft = async () => {
    if (!form.appointment) {
      toast.error("Please select an appointment/registration for this note.");
      return;
    }
    setSaving(true);
    try {
      const headers = await authHeader();
      if (amendsId) {
        const res = await api.post(apiEndpoints.clinicalNoteAddend(amendsId), form, { headers });
        setDraftId(res.data.id);
        toast.success("Addendum draft saved.");
      } else if (draftId) {
        const res = await api.patch(apiEndpoints.clinicalNote(draftId), form, { headers });
        setDraftId(res.data.id);
        toast.success("Draft updated.");
      } else {
        const res = await api.post(apiEndpoints.clinicalNotes, form, { headers });
        setDraftId(res.data.id);
        toast.success("Draft saved.");
      }
      await loadData();
    } catch (err) {
      console.error("Failed to save clinical note draft:", err);
      const detail =
        err?.response?.data?.detail ||
        JSON.stringify(err?.response?.data) ||
        "Failed to save draft.";
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const signNote = async () => {
    if (!validateTemplateRequiredFields()) return;
    setSaving(true);
    try {
      const headers = await authHeader();
      let id = draftId;
      if (!id) {
        // No draft saved yet -- create it first, then sign immediately.
        if (!form.appointment) {
          toast.error("Please select an appointment/registration for this note.");
          setSaving(false);
          return;
        }
        const createRes = amendsId
          ? await api.post(apiEndpoints.clinicalNoteAddend(amendsId), form, { headers })
          : await api.post(apiEndpoints.clinicalNotes, form, { headers });
        id = createRes.data.id;
      }
      await api.post(apiEndpoints.clinicalNoteSign(id), null, { headers });
      toast.success("Note signed and locked.");
      resetForm();
      setActiveTab("history");
      await loadData();
    } catch (err) {
      console.error("Failed to sign clinical note:", err);
      const detail =
        err?.response?.data?.detail ||
        JSON.stringify(err?.response?.data) ||
        "Failed to sign note.";
      toast.error(detail);
    } finally {
      setSaving(false);
    }
  };

  const showTabs = canAuthor; // viewers with no authoring rights just see history
  const currentTab = showTabs ? activeTab : "history";

  return (
    <Paper elevation={2} sx={{ p: 3, borderRadius: 2, mt: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Clinical Documentation{patientName ? ` - ${patientName}` : ""}
      </Typography>

      {showTabs && (
        <Tabs
          value={currentTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          <Tab label="Documentation" value="documentation" />
          <Tab label="Note History" value="history" />
        </Tabs>
      )}

      {currentTab === "documentation" && canAuthor && (
        <Grid container spacing={3} sx={{ mb: 1 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          {amendsId && (
            <Chip
              label="Writing an addendum to a signed note"
              color="warning"
              size="small"
              onDelete={resetForm}
              sx={{ mb: 2 }}
            />
          )}
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              <FormControl size="small" sx={{ width: "50%" }}>
                <InputLabel id="appt-select-label">Appointment / Registration</InputLabel>
                <Select
                  labelId="appt-select-label"
                  label="Appointment / Registration"
                  value={form.appointment}
                  onChange={handleFieldChange("appointment")}
                  disabled={!!amendsId}
                >
                  {appointments.map((a) => (
                    <MenuItem key={a.id} value={a.id}>
                      {a.title} -{" "}
                      {new Date(a.appointment_datetime).toLocaleString()}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ width: "50%" }}>
                <InputLabel id="doc-type-select-label">Documentation Type</InputLabel>
                <Select
                  labelId="doc-type-select-label"
                  label="Documentation Type"
                  value={form.documentation_type}
                  onChange={handleFieldChange("documentation_type")}
                >
                  {DOCUMENTATION_TYPES.map((dt) => (
                    <MenuItem key={dt.value} value={dt.value}>
                      {dt.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>

            {(userRole === "admin" || userRole === "system_admin") && !amendsId ? (
              <FormControl fullWidth size="small">
                <InputLabel id="note-type-label">Note Type</InputLabel>
                <Select
                  labelId="note-type-label"
                  label="Note Type"
                  value={form.note_type}
                  onChange={handleFieldChange("note_type")}
                >
                  <MenuItem value="doctor_assessment">Doctor Assessment</MenuItem>
                  <MenuItem value="nursing_assessment">Nursing Assessment</MenuItem>
                </Select>
              </FormControl>
            ) : (
              <Chip
                label={NOTE_TYPE_LABELS[form.note_type] || "Select an appointment"}
                sx={{ alignSelf: "flex-start" }}
              />
            )}

            {isTemplateDriven ? (
              templateLoading && !currentTemplate ? (
                <Typography variant="body2" color="text.secondary">
                  Loading {DOCUMENTATION_TYPES.find((dt) => dt.value === form.documentation_type)?.label} form...
                </Typography>
              ) : (
                <DynamicNoteForm
                  template={currentTemplate}
                  values={form.structured_data}
                  onChange={handleStructuredFieldChange}
                  disabled={saving}
                />
              )
            ) : (
              <>
                <TextField
                  label="Subjective"
                  multiline
                  minRows={2}
                  fullWidth
                  value={form.subjective}
                  onChange={handleFieldChange("subjective")}
                  placeholder="What the patient reports (symptoms, concerns, history)"
                />
                <TextField
                  label="Objective"
                  multiline
                  minRows={2}
                  fullWidth
                  value={form.objective}
                  onChange={handleFieldChange("objective")}
                  placeholder="Observable/measurable findings (vitals, exam findings)"
                />
                <TextField
                  label="Assessment"
                  multiline
                  minRows={2}
                  fullWidth
                  value={form.assessment}
                  onChange={handleFieldChange("assessment")}
                  placeholder="Clinical impression / diagnosis"
                />
                <TextField
                  label="Plan"
                  multiline
                  minRows={2}
                  fullWidth
                  value={form.plan}
                  onChange={handleFieldChange("plan")}
                  placeholder="Next steps, orders, follow-up"
                />
              </>
            )}

            <Stack direction="row" spacing={2}>
              <Button
                variant="outlined"
                onClick={saveDraft}
                disabled={saving}
              >
                Save Draft
              </Button>
              <Button
                variant="contained"
                color="success"
                onClick={signNote}
                disabled={saving}
              >
                Sign &amp; Lock
              </Button>
              {(draftId || amendsId) && (
                <Button variant="text" onClick={resetForm} disabled={saving}>
                  Cancel
                </Button>
              )}
            </Stack>
          </Stack>
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <NotePreviewPane title={previewTitle} meta={previewMeta} sections={previewSections} />
        </Grid>
        </Grid>
      )}

      {currentTab === "history" && (
        <Box>
          {!showTabs && (
            <Typography variant="subtitle1" sx={{ mb: 1 }}>
              Note History
            </Typography>
          )}

          {loading ? (
            <Typography variant="body2" color="text.secondary">
              Loading notes...
            </Typography>
          ) : notes.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No clinical notes yet for this patient.
            </Typography>
          ) : (
            <Stack spacing={2}>
              {notes.map((note) => (
                <Paper
                  key={note.id}
                  variant="outlined"
                  sx={{ p: 2, borderRadius: 2 }}
                >
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    sx={{ mb: 1 }}
                  >
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Chip
                        label={note.note_type_display || NOTE_TYPE_LABELS[note.note_type]}
                        size="small"
                        color={note.note_type === "doctor_assessment" ? "primary" : "secondary"}
                      />
                      {note.documentation_type && (
                        <Chip
                          label={
                            note.documentation_type_display ||
                            DOCUMENTATION_TYPES.find((dt) => dt.value === note.documentation_type)
                              ?.label
                          }
                          size="small"
                          variant="outlined"
                        />
                      )}
                      <Chip
                        label={note.status === "signed" ? "Signed" : "Draft"}
                        size="small"
                        color={note.status === "signed" ? "success" : "default"}
                      />
                      {note.amends && <Chip label="Addendum" size="small" />}
                    </Stack>
                    <Typography variant="caption" color="text.secondary">
                      {note.author_name} -{" "}
                      {new Date(note.signed_at || note.created_at).toLocaleString()}
                    </Typography>
                  </Stack>

                  {note.template_detail ? (
                    // Structured note: render strictly against the field
                    // definitions the note was signed against
                    // (note.template_detail), never the live/current
                    // template -- see ClinicalNote.template_version.
                    <DynamicNoteSummary
                      templateDetail={note.template_detail}
                      structuredData={note.structured_data}
                    />
                  ) : (
                    <Box sx={{ display: "grid", gap: 0.5 }}>
                      {note.subjective && (
                        <Typography variant="body2">
                          <strong>S:</strong> {note.subjective}
                        </Typography>
                      )}
                      {note.objective && (
                        <Typography variant="body2">
                          <strong>O:</strong> {note.objective}
                        </Typography>
                      )}
                      {note.assessment && (
                        <Typography variant="body2">
                          <strong>A:</strong> {note.assessment}
                        </Typography>
                      )}
                      {note.plan && (
                        <Typography variant="body2">
                          <strong>P:</strong> {note.plan}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {canAuthor && note.status === "signed" && (
                    <Button
                      size="small"
                      sx={{ mt: 1 }}
                      onClick={() => startAddendum(note)}
                    >
                      Add Addendum
                    </Button>
                  )}
                </Paper>
              ))}
            </Stack>
          )}
        </Box>
      )}
    </Paper>
  );
}

export default ClinicalNotesPanel;