import { useState, useEffect, useCallback, useMemo } from "react";
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

// Built-in documentation types available when authoring a note. This is
// separate from note_type (which tracks the author's clinical role --
// doctor vs. nurse) -- it's a further classification of the note itself.
//
// Every ACTIVE NoteTemplate (built or uploaded in the Note Builder) is added
// to the dropdown automatically from /api/note-templates/ -- nothing needs
// to be listed here for a new template. This constant is the fallback used
// until (or if) that list can't be loaded, so the dropdown is never empty.
const DOCUMENTATION_TYPES = [
  { value: "initial_assessment", label: "Initial Assessment" },
  { value: "progress_note", label: "Progress Note" },
  { value: "admission_note", label: "Admission Note" },
];

// documentation_type values that are ALWAYS rendered from a configurable
// NoteTemplate (DynamicNoteForm) instead of the fixed SOAP fields below,
// even before the template list has loaded. Any other active template code
// is detected from the loaded list (see isTemplateType in the component).
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
  // Active NoteTemplates ({ code, name }) that feed the Documentation Type
  // dropdown; null until /api/note-templates/ has loaded.
  const [activeTemplates, setActiveTemplates] = useState(null);

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
      let role = null;
      try {
        const decoded = jwtDecode(token.access_token || token);
        role = decoded.role || null;
        setUserRole(role);
        const defaultType = NOTE_TYPE_BY_ROLE[role];
        if (defaultType) {
          setForm((f) => ({ ...f, note_type: defaultType }));
        }
      } catch (err) {
        console.error("Failed to decode token:", err);
      }
      // Clinical notes and flowsheets are both gated server-side to
      // doctor/nurse/admin/system_admin -- any other role (e.g. registrar)
      // would just get a 403 from every endpoint this panel touches. Rather
      // than firing those requests and surfacing a "Could not load..." toast
      // for a role that was never going to see this panel anyway (it
      // renders nothing further down once loading finishes), skip the fetch
      // entirely and let the empty-state gate below hide the panel quietly.
      if (["doctor", "nurse", "admin", "system_admin"].includes(role)) {
        loadData();
      } else {
        setLoading(false);
      }
    };
    init();
  }, [loadData]);

  // Load the active note templates so every one of them (not just the
  // built-ins) shows up in the Documentation Type dropdown. Only the code and
  // name are kept here -- a template's full definition is fetched on demand
  // when it's selected (see the effect below).
  useEffect(() => {
    if (!["doctor", "nurse", "admin", "system_admin"].includes(userRole)) return undefined;
    let cancelled = false;
    const loadTemplateList = async () => {
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.noteTemplates, { headers });
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : res.data?.results || [];
        setActiveTemplates(list.map((t) => ({ code: t.code, name: t.name })));
      } catch (err) {
        // Keep the built-in types; the dropdown just won't list extra templates.
        console.error("Failed to load note templates:", err);
      }
    };
    loadTemplateList();
    return () => {
      cancelled = true;
    };
  }, [userRole]);

  // True when `code` is rendered from a NoteTemplate rather than the SOAP form.
  const isTemplateType = (code) =>
    TEMPLATE_DRIVEN_TYPES.has(code) ||
    !!templatesByCode[code] ||
    (activeTemplates || []).some((t) => t.code === code);

  // Dropdown options: the non-template built-ins plus every active template.
  // The currently selected value is always present (e.g. a draft whose
  // template was deactivated since) so the Select never shows a blank.
  const documentationTypeOptions = useMemo(() => {
    let options;
    if (activeTemplates === null) {
      options = [...DOCUMENTATION_TYPES];
    } else {
      options = [
        ...DOCUMENTATION_TYPES.filter((dt) => !TEMPLATE_DRIVEN_TYPES.has(dt.value)),
        ...activeTemplates.map((t) => ({ value: t.code, label: t.name })),
      ];
    }
    const current = form.documentation_type;
    if (current && !options.some((o) => o.value === current)) {
      options.push({
        value: current,
        label:
          templatesByCode[current]?.name ||
          DOCUMENTATION_TYPES.find((dt) => dt.value === current)?.label ||
          current,
      });
    }
    return options;
  }, [activeTemplates, templatesByCode, form.documentation_type]);

  const documentationTypeLabel = (code) =>
    documentationTypeOptions.find((o) => o.value === code)?.label || "";

  // Whenever the selected documentation type is template-driven, fetch its
  // NoteTemplate definition (fields + dictionary options) so DynamicNoteForm
  // can render it, and record the template's id on the form so the backend
  // can snapshot its current version at creation time. Cached by code so
  // switching between types repeatedly doesn't keep re-fetching.
  useEffect(() => {
    const code = form.documentation_type;
    if (!isTemplateType(code)) {
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

  const isTemplateDriven = isTemplateType(form.documentation_type);
  const currentTemplate = templatesByCode[form.documentation_type] || null;

  // Feeds the live preview pane (and its Print button) alongside the form --
  // built fresh on every render from whatever's currently in `form`, so it
  // always mirrors exactly what the author has typed so far.
  const selectedAppointment = appointments.find((a) => a.id === form.appointment);
  const previewTitle = documentationTypeLabel(form.documentation_type) || "Clinical Note";
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
    ? selectedHistoryFlowsheet.template_name || "Flowsheet"
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
    // Pass the template id too -- with multiple flowsheet types possible
    // per visit, the appointment alone no longer identifies which one to
    // open (the panel would otherwise default to the first active type).
    const templateParam = flowsheet.template ? `&template=${flowsheet.template}` : "";
    navigate(`/patients/${patientId}/flowsheet?appointment=${flowsheet.appointment}${templateParam}`);
  };

  const handleStructuredFieldChange = (key, value) => {
    setForm((f) => ({
      ...f,
      structured_data: { ...f.structured_data, [key]: value },
    }));
  };

  if (userRole !== null && !canAuthor) {
    // Clinical notes/flowsheets are gated server-side to
    // doctor/nurse/admin/system_admin -- tell a role outside that list
    // plainly why nothing loads here, instead of silently rendering
    // nothing (which used to also fire the fetches anyway and surface a
    // confusing "Could not load..." toast).
    return (
      <Paper elevation={2} sx={{ p: 3, borderRadius: 2, mt: 3 }}>
        <Typography variant="body1" color="text.secondary">
          You are not allowed to view this page.
        </Typography>
      </Paper>
    );
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
                  {documentationTypeOptions.map((dt) => (
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
                  Loading {documentationTypeLabel(form.documentation_type)} form...
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
                                {flowsheet.template_name || "Flowsheet"}
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
                This permanently deletes this {deletingHistoryItem.raw.template_name || "Flowsheet"}
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