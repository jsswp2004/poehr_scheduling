import { useCallback, useEffect, useState } from "react";
import SettingsToolbarPortal from "../settings/SettingsToolbarSlot";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "../patientHeader/headerApi";
import { announceDictationChange } from "./DictationContext";

export const SPECIALTIES = [
  { value: "PRIMARYCARE", label: "Primary care" },
  { value: "CARDIOLOGY", label: "Cardiology" },
  { value: "NEUROLOGY", label: "Neurology" },
  { value: "ONCOLOGY", label: "Oncology" },
  { value: "RADIOLOGY", label: "Radiology" },
  { value: "UROLOGY", label: "Urology" },
];
export const ACCESS = [
  { value: "authors", label: "Anyone who can author notes" },
  { value: "doctors", label: "Doctors only" },
];

const FIELDS = ["dictation_enabled", "dictation_cleanup_enabled", "dictation_specialty", "dictation_access"];

/** Settings > Dictation: the organization's on/off switch for voice dictation and its options. */
export default function DictationSettings() {
  const [orgId, setOrgId] = useState(null);
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(apiEndpoints.organizations, { headers: await authHeader() });
      const org = (res.data.results || res.data || [])[0];
      if (!org) throw new Error("no organization");
      const values = Object.fromEntries(FIELDS.map((k) => [k, org[k]]));
      setOrgId(org.id);
      setSaved(values);
      setForm(values);
    } catch (err) {
      setError("Could not load the dictation settings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <CircularProgress size={24} aria-label="Loading dictation settings" />;
  if (!form) return <Alert severity="error">{error || "Could not load the dictation settings."}</Alert>;

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const dirty = FIELDS.some((k) => form[k] !== saved[k]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await api.patch(apiEndpoints.organizationDetail(orgId), form, { headers: await authHeader() });
      const values = Object.fromEntries(FIELDS.map((k) => [k, res.data[k]]));
      setSaved(values);
      setForm(values);
      announceDictationChange();
      toast.success(values.dictation_enabled ? "Dictation is on." : "Dictation is off.");
    } catch (err) {
      setError(errorText(err, "Could not save. You may not have permission to change organization settings."));
    } finally {
      setSaving(false);
    }
  };

  const off = !form.dictation_enabled;

  return (
    <Stack spacing={3} sx={{ maxWidth: 720 }}>
      <Box>
        <Typography variant="body2" color="text.secondary">
          Let providers speak into clinical note fields instead of typing. Applies to everyone in your organization who can author notes.
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <FormControlLabel
        control={<Switch checked={!!form.dictation_enabled} onChange={(e) => set("dictation_enabled", e.target.checked)} />}
        label={
          <Box>
            <Typography variant="subtitle1">Enable dictation</Typography>
            <Typography variant="body2" color="text.secondary">
              Shows a microphone button on note fields. Audio is streamed to AWS Transcribe Medical and is not stored by POWER.
            </Typography>
          </Box>
        }
        sx={{ alignItems: "flex-start", m: 0 }}
      />

      <Stack spacing={3} sx={{ opacity: off ? 0.5 : 1 }}>
        <FormControlLabel
          control={
            <Switch
              checked={!!form.dictation_cleanup_enabled}
              disabled={off}
              onChange={(e) => set("dictation_cleanup_enabled", e.target.checked)}
            />
          }
          label={
            <Box>
              <Typography variant="subtitle2">AI cleanup</Typography>
              <Typography variant="body2" color="text.secondary">
                Offer "Clean up &amp; structure" to tidy a dictation and propose values for note fields. The provider reviews every change before it is applied.
              </Typography>
            </Box>
          }
          sx={{ alignItems: "flex-start", m: 0 }}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
          <TextField
            select
            fullWidth
            size="small"
            label="Medical specialty"
            value={form.dictation_specialty}
            disabled={off}
            onChange={(e) => set("dictation_specialty", e.target.value)}
          >
            {SPECIALTIES.map((s) => (
              <MenuItem key={s.value} value={s.value}>
                {s.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            fullWidth
            size="small"
            label="Who can dictate"
            value={form.dictation_access}
            disabled={off}
            onChange={(e) => set("dictation_access", e.target.value)}
          >
            {ACCESS.map((a) => (
              <MenuItem key={a.value} value={a.value}>
                {a.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Alert severity="info" icon={false}>
          Engine: <strong>AWS Transcribe Medical</strong> (HIPAA-eligible under your AWS agreement). Each dictation is logged with who, when and how long; the words are not logged.
        </Alert>
      </Stack>

      <SettingsToolbarPortal>
        <Box sx={{ flex: 1 }} />
        {dirty && <Chip size="small" color="warning" label="Unsaved changes" />}
        <Button size="small" onClick={() => setForm(saved)} disabled={!dirty || saving}>
          Cancel
        </Button>
        <Button size="small" variant="contained" onClick={save} disabled={!dirty || saving}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </SettingsToolbarPortal>
    </Stack>
  );
}
