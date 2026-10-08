import { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import IcdCodePicker, { dxLabel } from "../IcdCodePicker";
import { authHeader, errorText } from "./referralShared";

const BLANK = {
  destination: null,
  destination_name: "",
  specialty: "",
  urgency: "routine",
  reason: "",
  clinical_question: "",
  referring_provider: "",
  dx: [],
};

const fromReferral = (ref) => ({
  destination: ref.destination ? { id: ref.destination, name: ref.destination_name, specialty: ref.specialty } : null,
  destination_name: ref.destination ? "" : ref.destination_name || "",
  specialty: ref.specialty || "",
  urgency: ref.urgency || "routine",
  reason: ref.reason || "",
  clinical_question: ref.clinical_question || "",
  referring_provider: ref.referring_provider || "",
  dx: ref.diagnosis_code ? [{ code: ref.diagnosis_code, description: ref.diagnosis_text || "" }] : [],
});

/**
 * Write or edit a draft referral. The destination comes from the clinic's directory, or is typed
 * for an outside practice that isn't listed yet (which is then added to the directory so the next
 * referral can pick it). Nothing is sent from here: the physician signs it from the referral.
 */
export default function ReferralFormDialog({ open, onClose, onSaved, patient, referral = null, meta, me }) {
  const [form, setForm] = useState(BLANK);
  const [directory, setDirectory] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const editing = !!referral;
  const isDoctor = me?.role === "doctor";

  useEffect(() => {
    if (!open) return undefined;
    setError("");
    setForm(referral ? fromReferral(referral) : { ...BLANK, referring_provider: isDoctor ? me.id : "" });
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(apiEndpoints.referralDestinations, { headers: await authHeader() });
        if (!cancelled) setDirectory(Array.isArray(res.data) ? res.data : []);
      } catch (err) {
        if (!cancelled) setDirectory([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, referral, isDoctor, me]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setError("");
    if (!form.reason.trim()) return setError("Say why the patient is being referred.");
    if (!form.destination && !form.destination_name.trim()) return setError("Choose who the referral is going to.");
    if (!form.specialty.trim()) return setError("Choose the specialty.");
    if (!editing && !form.referring_provider) return setError("Choose the referring physician.");
    setBusy(true);
    try {
      const headers = await authHeader();
      let destination = form.destination;
      let destinationName = form.destination_name.trim();
      // an outside practice that is typed in is added to the directory for next time
      if (!destination && destinationName) {
        try {
          const made = await api.post(
            apiEndpoints.referralDestinations,
            { name: destinationName, specialty: form.specialty, kind: "external" },
            { headers }
          );
          destination = made.data;
        } catch (err) {
          destination = null; // already listed or not allowed: keep the typed name on the referral
        }
      }
      const dx = form.dx[0];
      const body = {
        destination: destination ? destination.id : null,
        destination_name: destination ? destination.name : destinationName,
        specialty: form.specialty,
        urgency: form.urgency,
        reason: form.reason,
        clinical_question: form.clinical_question,
        diagnosis_code: dx ? dx.code : "",
        diagnosis_text: dx ? dx.description || "" : "",
      };
      if (form.referring_provider) body.referring_provider = form.referring_provider;
      let res;
      if (editing) {
        res = await api.patch(apiEndpoints.referral(referral.id), body, { headers });
      } else {
        res = await api.post(apiEndpoints.referrals, { ...body, patient: patient.id }, { headers });
      }
      toast.success(editing ? "Draft saved." : "Draft created. Review it, then sign and send.");
      onSaved(res.data);
    } catch (err) {
      setError(errorText(err, "Could not save the referral."));
    } finally {
      setBusy(false);
    }
  };

  const specialties = meta?.specialties || [];
  const doctors = meta?.doctors || [];

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md" data-testid="referral-form">
      <DialogTitle>
        {editing ? "Edit draft referral" : "New referral"}
        {patient?.name ? ` — ${patient.name}` : editing ? ` — ${referral.patient_name}` : ""}
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          {error && <Alert severity="error" data-testid="referral-form-error">{error}</Alert>}
          <Autocomplete
            options={directory}
            value={form.destination}
            getOptionLabel={(o) => (o.specialty ? `${o.name} — ${o.specialty}` : o.name)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            onChange={(_, v) =>
              setForm((f) => ({ ...f, destination: v, destination_name: "", specialty: v?.specialty || f.specialty }))
            }
            renderInput={(params) => (
              <TextField {...params} size="small" label="Send to (directory)" inputProps={{ ...params.inputProps, "data-testid": "referral-destination" }} />
            )}
          />
          {!form.destination && (
            <TextField
              size="small"
              label="Or type an outside practice or specialist"
              value={form.destination_name}
              onChange={set("destination_name")}
              inputProps={{ "data-testid": "referral-destination-name" }}
              helperText="It is added to the directory so you can pick it next time."
            />
          )}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              select
              size="small"
              fullWidth
              label="Specialty"
              value={form.specialty}
              onChange={set("specialty")}
              SelectProps={{ native: false }}
              inputProps={{ "data-testid": "referral-specialty" }}
            >
              {form.specialty && !specialties.includes(form.specialty) && <MenuItem value={form.specialty}>{form.specialty}</MenuItem>}
              {specialties.map((s) => (
                <MenuItem key={s} value={s}>
                  {s}
                </MenuItem>
              ))}
            </TextField>
            <TextField select size="small" fullWidth label="Urgency" value={form.urgency} onChange={set("urgency")} inputProps={{ "data-testid": "referral-urgency" }}>
              {(meta?.urgencies || [{ value: "routine", label: "Routine" }, { value: "urgent", label: "Urgent" }, { value: "emergent", label: "Emergent" }]).map((u) => (
                <MenuItem key={u.value} value={u.value}>
                  {u.label}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              select
              size="small"
              fullWidth
              label="Referring physician"
              value={form.referring_provider}
              onChange={set("referring_provider")}
              disabled={isDoctor && !editing}
              inputProps={{ "data-testid": "referral-provider" }}
            >
              {doctors.map((d) => (
                <MenuItem key={d.id} value={d.id}>
                  {d.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <TextField
            size="small"
            multiline
            minRows={3}
            label="Reason for referral"
            value={form.reason}
            onChange={set("reason")}
            inputProps={{ "data-testid": "referral-reason" }}
          />
          <TextField
            size="small"
            multiline
            minRows={2}
            label="Question for the specialist (optional)"
            value={form.clinical_question}
            onChange={set("clinical_question")}
            inputProps={{ "data-testid": "referral-question" }}
          />
          <Box>
            <IcdCodePicker
              value={form.dx}
              onChange={(list) => setForm((f) => ({ ...f, dx: list.slice(-1) }))}
              label="Primary diagnosis (ICD-10)"
            />
            {form.dx[0] && (
              <Typography variant="caption" color="text.secondary">
                {dxLabel(form.dx[0])}
              </Typography>
            )}
          </Box>
          <Typography variant="caption" color="text.secondary">
            The patient's current allergies are attached automatically when the physician signs and sends.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="contained" onClick={save} disabled={busy} data-testid="referral-form-save">
          {busy ? <CircularProgress size={18} /> : editing ? "Save draft" : "Create draft"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
