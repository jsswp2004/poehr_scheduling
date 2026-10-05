import { useState, useEffect, useCallback } from "react";
import {
  Box,
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
  Divider,
} from "@mui/material";
import { jwtDecode } from "jwt-decode";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { getValidToken } from "../utils/auth";
import { toast } from "./SimpleToast";

const NOTE_TYPE_BY_ROLE = {
  doctor: "doctor_assessment",
  nurse: "nursing_assessment",
};

const NOTE_TYPE_LABELS = {
  doctor_assessment: "Doctor Assessment",
  nursing_assessment: "Nursing Assessment",
};

const EMPTY_FORM = {
  appointment: "",
  note_type: "",
  subjective: "",
  objective: "",
  assessment: "",
  plan: "",
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

  const loadData = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const [apptRes, notesRes] = await Promise.all([
        api.get(`/api/appointments/?patient=${patientId}`),
        api.get(`/api/clinical-notes/?patient=${patientId}`),
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

  const canAuthor = ["doctor", "nurse", "admin", "system_admin"].includes(
    userRole
  );

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

  const startAddendum = (note) => {
    setForm({
      appointment: note.appointment,
      note_type: note.note_type,
      subjective: "",
      objective: "",
      assessment: "",
      plan: "",
    });
    setDraftId(null);
    setAmendsId(note.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveDraft = async () => {
    if (!form.appointment) {
      toast.error("Please select an appointment/registration for this note.");
      return;
    }
    setSaving(true);
    try {
      if (amendsId) {
        const res = await api.post(apiEndpoints.clinicalNoteAddend(amendsId), form);
        setDraftId(res.data.id);
        toast.success("Addendum draft saved.");
      } else if (draftId) {
        const res = await api.patch(apiEndpoints.clinicalNote(draftId), form);
        setDraftId(res.data.id);
        toast.success("Draft updated.");
      } else {
        const res = await api.post(apiEndpoints.clinicalNotes, form);
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
    setSaving(true);
    try {
      let id = draftId;
      if (!id) {
        // No draft saved yet -- create it first, then sign immediately.
        if (!form.appointment) {
          toast.error("Please select an appointment/registration for this note.");
          setSaving(false);
          return;
        }
        const createRes = amendsId
          ? await api.post(apiEndpoints.clinicalNoteAddend(amendsId), form)
          : await api.post(apiEndpoints.clinicalNotes, form);
        id = createRes.data.id;
      }
      await api.post(apiEndpoints.clinicalNoteSign(id));
      toast.success("Note signed and locked.");
      resetForm();
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

  return (
    <Paper elevation={2} sx={{ p: 3, borderRadius: 2, mt: 3 }}>
      <Typography variant="h6" sx={{ mb: 2 }}>
        Clinical Documentation{patientName ? ` - ${patientName}` : ""}
      </Typography>

      {canAuthor && (
        <Box sx={{ mb: 3 }}>
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
            <FormControl fullWidth size="small">
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
        </Box>
      )}

      <Divider sx={{ my: 2 }} />

      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Note History
      </Typography>

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
    </Paper>
  );
}

export default ClinicalNotesPanel;
