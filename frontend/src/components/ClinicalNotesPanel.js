import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import { jwtDecode } from "jwt-decode";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { getValidToken } from "../utils/auth";
import { toast } from "./SimpleToast";
import DynamicNoteForm, {
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
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [notes, setNotes] = useState([]);
  // Vital Signs Flowsheet instances for this patient -- merged into the same
  // Note History table as clinical notes, per the requirement that every
  // flowsheet also shows up there alongside SOAP/template notes.
  const [flowsheets, setFlowsheets] = useState([]);
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

  // Note History: key of the row currently shown in the read-only preview
  // pane (e.g. "note-12" or "flowsheet-3"), and the history item (note or
  // flowsheet, if any) pending delete confirmation.
  const [selectedHistoryKey, setSelectedHistoryKey] = useState(null);
  const [deletingHistoryItem, setDeletingHistoryItem] = useState(null); // { kind: "note" | "flowsheet", raw }
  const [deleteSaving, setDeleteSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const headers = await authHeader();
      const [apptRes, notesRes, flowsheetsRes] = await Promise.all([
        api.get(`/api/appointments/?patient=${patientId}`, { headers }),
        api.get(`/api/clinical-notes/?patient=${patientId}`, { headers }),
        api.get(apiEndpoints.vitalSignsFlowsheets, {
          headers,
          params: { patient: patientId },
        }),
      ]);
      const apptList = Array.isArray(apptRes.data)
        ? apptRes.data
        : apptRes.data?.results || [];
      const noteList = Array.isArray(notesRes.data)
        ? notesRes.data
        : notesRes.data?.results || [];
      const flowsheetList = Array.isArray(flowsheetsRes.data)
        ? flowsheetsRes.data
        : flowsheetsRes.data?.results || [];
      setAppointments(apptList);
      setNotes(noteList);
      setFlowsheets(flowsheetList);
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

  // Note History: notes and flowsheets merged into one newest-first list,
  // each row tagged with a `kind` so the table and preview pane can render
  // either shape. Sorted by the note's created_at / the flowsheet's most
  // recent update, so an actively-charted flowsheet surfaces near the top
  // just like a freshly drafted note would.
  const historyRows = [
    ...notes.map((n) => ({
      key: `note-${n.id}`,
      kind: "note",
      sortTime: new Date(n.created_at).getTime(),
      raw: n,
    })),
    ...flowsheets.map((f) => ({
      key: `flowsheet-${f.id}`,
      kind: "flowsheet",
      sortTime: new Date(f.updated_at || f.created_at).getTime(),
      raw: f,
    })),
  ].sort((a, b) => b.sortTime - a.sortTime);

  // The row currently shown in the preview pane -- the selected row if it
  // still exists in the loaded history, otherwise the most recent item, so
  // the pane is never blank while there's anything to show.
  const selectedHistoryRow =
    historyRows.find((r) => r.key === selectedHistoryKey) || historyRows[0] || null;
  const selectedHistoryNote =
    selectedHistoryRow?.kind === "note" ? selectedHistoryRow.raw : null;
  const selectedHistoryFlowsheet =
    selectedHistoryRow?.kind === "flowsheet" ? selectedHistoryRow.raw : null;

  const buildFlowsheetPreviewSections = (flowsheet) => {
    const rowDefs = flowsheet.row_definitions || [];
    const sortedCols = [...(flowsheet.columns || [])].sort(
      (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
    );
    const latestCol = sortedCols[sortedCols.length - 1];
    return [
      {
        tabLabel: "",
        sections: rowDefs.map((section) => ({
          sectionLabel: section.section,
          entries: section.rows.map((row) => {
            const rawValue = latestCol
              ? flowsheet.data?.[row.key]?.[latestCol.id]
              : undefined;
            const display = rawValue ? `${rawValue}${row.unit ? ` ${row.unit}` : ""}` : "";
            return { label: row.label, display, empty: !display };
          }),
        })),
      },
    ];
  };

  const historyPreviewTitle = selectedHistoryNote
    ? selectedHistoryNote.documentation_type_display ||
      DOCUMENTATION_TYPES.find((dt) => dt.value === selectedHistoryNote.documentation_type)
        ?.label ||
      "Clinical Note"
    : selectedHistoryFlowsheet
    ? "Vital Sign Flowsheet"
    : "Clinical Note";

  const historyPreviewMeta = selectedHistoryNote
    ? [
        patientName ? `Patient: ${patientName}` : null,
        selectedHistoryNote.note_type_display,
        selectedHistoryNote.amends ? "Addendum" : null,
        selectedHistoryNote.status === "signed"
          ? `Signed by ${selectedHistoryNote.author_name} - ${new Date(
              selectedHistoryNote.signed_at || selectedHistoryNote.created_at
            ).toLocaleString()}`
          : `Drafted by ${selectedHistoryNote.author_name} - ${new Date(
              selectedHistoryNote.created_at
            ).toLocaleString()}`,
      ]
    : selectedHistoryFlowsheet
    ? (() => {
        const flowsheetAppointment = appointments.find(
          (a) => a.id === selectedHistoryFlowsheet.appointment
        );
        const timeCount = (selectedHistoryFlowsheet.columns || []).length;
        return [
          patientName ? `Patient: ${patientName}` : null,
          flowsheetAppointment
            ? `${flowsheetAppointment.title} - ${new Date(
                flowsheetAppointment.appointment_datetime
              ).toLocaleString()}`
            : null,
          `${timeCount} time point${timeCount === 1 ? "" : "s"} charted`,
          selectedHistoryFlowsheet.created_by_name
            ? `Started by ${selectedHistoryFlowsheet.created_by_name} - ${new Date(
                selectedHistoryFlowsheet.created_at
              ).toLocaleString()}`
            : null,
        ];
      })()
    : [];

  const historyPreviewSections = selectedHistoryNote
    ? selectedHistoryNote.template_detail
      ? buildNotePreviewSections(
          selectedHistoryNote.template_detail.fields,
          selectedHistoryNote.structured_data
        )
      : [
          {
            tabLabel: "",
            sections: [
              {
                sectionLabel: "",
                entries: [
                  {
                    label: "Subjective",
                    display: selectedHistoryNote.subjective || "",
                    empty: !selectedHistoryNote.subjective,
                  },
                  {
                    label: "Objective",
                    display: selectedHistoryNote.objective || "",
                    empty: !selectedHistoryNote.objective,
                  },
                  {
                    label: "Assessment",
                    display: selectedHistoryNote.assessment || "",
                    empty: !selectedHistoryNote.assessment,
                  },
                  {
                    label: "Plan",
                    display: selectedHistoryNote.plan || "",
                    empty: !selectedHistoryNote.plan,
                  },
                ],
              },
            ],
          },
        ]
    : selectedHistoryFlowsheet
    ? buildFlowsheetPreviewSections(selectedHistoryFlowsheet)
    : [];

  // Loads an existing DRAFT note back into the documentation form for
  // editing in place (PATCHes the same note on save, via the existing
  // draftId branch in saveDraft/signNote) -- distinct from startAddendum
  // below, which creates a brand-new note referencing an already-signed
  // one. Only ever wired to the Edit action for a draft row; signed notes
  // are immutable (see CanAccessClinicalNotes on the backend).
  const startEditDraft = (note) => {
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
      subjective: note.subjective || "",
      objective: note.objective || "",
      assessment: note.assessment || "",
      plan: note.plan || "",
      template: note.template || null,
      structured_data: note.structured_data || {},
    });
    setDraftId(note.id);
    setAmendsId(null);
    setActiveTab("documentation");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const confirmDeleteHistoryItem = async () => {
    if (!deletingHistoryItem) return;
    const { kind, raw } = deletingHistoryItem;
    setDeleteSaving(true);
    try {
      const headers = await authHeader();
      if (kind === "flowsheet") {
        await api.delete(apiEndpoints.vitalSignsFlowsheet(raw.id), { headers });
        toast.success("Flowsheet deleted.");
        if (selectedHistoryKey === `flowsheet-${raw.id}`) setSelectedHistoryKey(null);
      } else {
        await api.delete(apiEndpoints.clinicalNote(raw.id), { headers });
        toast.success("Draft note deleted.");
        if (draftId === raw.id) resetForm();
        if (selectedHistoryKey === `note-${raw.id}`) setSelectedHistoryKey(null);
      }
      setDeletingHistoryItem(null);
      await loadData();
    } catch (err) {
      console.error("Failed to delete history item:", err);
      const detail =
        err?.response?.data?.detail ||
        JSON.stringify(err?.response?.data) ||
        `Failed to delete ${kind === "flowsheet" ? "flowsheet" : "note"}.`;
      toast.error(detail);
    } finally {
      setDeleteSaving(false);
    }
  };

  // Edit action for a flowsheet row: deep-links into the standalone
  // Flowsheets page for this patient with the owning visit preselected,
  // mirroring startEditDraft's role for note rows (which edits in place,
  // since Clinical Notes' documentation form lives on this same page).
  const editFlowsheet = (flowsheet) => {
    navigate(`/patients/${patientId}/flowsheet?appointment=${flowsheet.appointment}`);
  };

  const handleStructuredFieldChange = (key, value) => {
    setForm((f) => ({
      ...f,
      structured_data: { ...f.structured_data, [key]: value },
    }));
  };

  if (!canAuthor && !loading && notes.length === 0 && flowsheets.length === 0) {
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
          ) : historyRows.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No clinical notes yet for this patient.
            </Typography>
          ) : (
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 7 }}>
                <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Type</TableCell>
                        <TableCell>Document</TableCell>
                        <TableCell>Status</TableCell>
                        <TableCell>Date Created</TableCell>
                        <TableCell>Created By</TableCell>
                        {canAuthor && <TableCell align="right">Actions</TableCell>}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {historyRows.map((row) => {
                        const isSelected = selectedHistoryRow?.key === row.key;

                        if (row.kind === "flowsheet") {
                          const flowsheet = row.raw;
                          const timeCount = (flowsheet.columns || []).length;
                          return (
                            <TableRow
                              key={row.key}
                              hover
                              selected={isSelected}
                              onClick={() => setSelectedHistoryKey(row.key)}
                              sx={{ cursor: "pointer" }}
                            >
                              <TableCell>
                                <Chip label="Flowsheet" size="small" color="info" />
                              </TableCell>
                              <TableCell>
                                Vital Sign Flowsheet
                                <Chip
                                  label={`${timeCount} pt${timeCount === 1 ? "" : "s"}`}
                                  size="small"
                                  sx={{ ml: 1 }}
                                />
                              </TableCell>
                              <TableCell>
                                <Chip label="Active" size="small" color="default" />
                              </TableCell>
                              <TableCell>
                                {new Date(flowsheet.created_at).toLocaleDateString()}
                              </TableCell>
                              <TableCell>{flowsheet.created_by_name}</TableCell>
                              {canAuthor && (
                                <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                  <Tooltip title="Edit this flowsheet">
                                    <IconButton
                                      size="small"
                                      onClick={() => editFlowsheet(flowsheet)}
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title="Delete this flowsheet">
                                    <IconButton
                                      size="small"
                                      onClick={() =>
                                        setDeletingHistoryItem({ kind: "flowsheet", raw: flowsheet })
                                      }
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        }

                        const note = row.raw;
                        const isDraft = note.status !== "signed";
                        const documentLabel =
                          note.documentation_type_display ||
                          DOCUMENTATION_TYPES.find((dt) => dt.value === note.documentation_type)
                            ?.label ||
                          "Clinical Note";
                        return (
                          <TableRow
                            key={row.key}
                            hover
                            selected={isSelected}
                            onClick={() => setSelectedHistoryKey(row.key)}
                            sx={{ cursor: "pointer" }}
                          >
                            <TableCell>
                              <Chip
                                label={
                                  note.note_type_display || NOTE_TYPE_LABELS[note.note_type]
                                }
                                size="small"
                                color={
                                  note.note_type === "doctor_assessment" ? "primary" : "secondary"
                                }
                              />
                            </TableCell>
                            <TableCell>
                              {documentLabel}
                              {note.amends && (
                                <Chip label="Addendum" size="small" sx={{ ml: 1 }} />
                              )}
                            </TableCell>
                            <TableCell>
                              <Chip
                                label={note.status === "signed" ? "Signed" : "Draft"}
                                size="small"
                                color={note.status === "signed" ? "success" : "default"}
                              />
                            </TableCell>
                            <TableCell>
                              {new Date(note.created_at).toLocaleDateString()}
                            </TableCell>
                            <TableCell>{note.author_name}</TableCell>
                            {canAuthor && (
                              <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                                <Tooltip
                                  title={
                                    isDraft
                                      ? "Edit this draft"
                                      : "Signed notes are locked and can't be edited"
                                  }
                                >
                                  <span>
                                    <IconButton
                                      size="small"
                                      disabled={!isDraft}
                                      onClick={() => startEditDraft(note)}
                                    >
                                      <EditIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                                <Tooltip
                                  title={
                                    isDraft
                                      ? "Delete this draft"
                                      : "Signed notes are locked and can't be deleted"
                                  }
                                >
                                  <span>
                                    <IconButton
                                      size="small"
                                      disabled={!isDraft}
                                      onClick={() =>
                                        setDeletingHistoryItem({ kind: "note", raw: note })
                                      }
                                    >
                                      <DeleteIcon fontSize="small" />
                                    </IconButton>
                                  </span>
                                </Tooltip>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Grid>

              <Grid size={{ xs: 12, md: 5 }}>
                <NotePreviewPane
                  title={historyPreviewTitle}
                  meta={historyPreviewMeta}
                  sections={historyPreviewSections}
                />
                {canAuthor && selectedHistoryNote && selectedHistoryNote.status === "signed" && (
                  <Button
                    size="small"
                    sx={{ mt: 1 }}
                    onClick={() => startAddendum(selectedHistoryNote)}
                  >
                    Add Addendum
                  </Button>
                )}
              </Grid>
            </Grid>
          )}
        </Box>
      )}

      <Dialog
        open={!!deletingHistoryItem}
        onClose={() => (deleteSaving ? null : setDeletingHistoryItem(null))}
      >
        <DialogTitle>
          {deletingHistoryItem?.kind === "flowsheet"
            ? "Delete this flowsheet?"
            : "Delete this draft note?"}
        </DialogTitle>
        <DialogContent>
          <DialogContentText>
            {deletingHistoryItem?.kind === "flowsheet" ? (
              <>
                This permanently deletes this Vital Sign Flowsheet
                {` (created ${new Date(
                  deletingHistoryItem.raw.created_at
                ).toLocaleDateString()}, ${(deletingHistoryItem.raw.columns || []).length} time point${
                  (deletingHistoryItem.raw.columns || []).length === 1 ? "" : "s"
                } charted)`}
                . This cannot be undone.
              </>
            ) : (
              <>
                This permanently deletes this draft
                {deletingHistoryItem
                  ? ` (${
                      deletingHistoryItem.raw.documentation_type_display ||
                      DOCUMENTATION_TYPES.find(
                        (dt) => dt.value === deletingHistoryItem.raw.documentation_type
                      )?.label ||
                      "clinical note"
                    } created ${new Date(
                      deletingHistoryItem.raw.created_at
                    ).toLocaleDateString()})`
                  : ""}
                . This cannot be undone.
              </>
            )}
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeletingHistoryItem(null)} disabled={deleteSaving}>
            Cancel
          </Button>
          <Button
            color="error"
            variant="contained"
            onClick={confirmDeleteHistoryItem}
            disabled={deleteSaving}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Paper>
  );
}

export default ClinicalNotesPanel;