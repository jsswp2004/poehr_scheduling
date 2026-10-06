import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Stack,
  Chip,
  Divider,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "./headerApi";

const SEVERITIES = [
  { value: "", label: "Not stated" },
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
];

const VALUE_STYLE = {
  strong: { fontWeight: 700, fontSize: "1.15rem" },
  alert: { color: "error.main", fontWeight: 700 },
  warn: { color: "warning.dark", fontWeight: 600 },
  none: {},
};

/**
 * The banner at the top of a patient's chart. Which items it shows, and in what
 * order, is each clinic's choice (Settings > Patient Header); the server sends the
 * finished text for every visible item, so this just draws what it is given.
 * Allergies are red when there are any, and a patient with nothing recorded reads
 * "Not documented" (different from "No known allergies").
 */
function PatientChartHeader({ patientId, refreshKey = 0, visitId = null }) {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);

  const load = useCallback(async () => {
    if (!patientId) return;
    try {
      const headers = await authHeader();
      const res = await api.get(apiEndpoints.patientHeader(patientId), { headers, params: visitId ? { visit: visitId } : {} });
      setData(res.data);
      setFailed(false);
    } catch (err) {
      setFailed(true);
    }
  }, [patientId, visitId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // No access (or the server is unreachable): show nothing rather than a broken banner.
  if (failed && !data) return null;
  if (!data) return <Box sx={{ minHeight: 56 }} aria-busy="true" />;

  const [first, ...rest] = data.items;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Patient header"
      data-testid="patient-chart-header"
      sx={{ p: 1.5, mb: 2, borderLeft: "6px solid", borderLeftColor: "primary.main", bgcolor: "#f7fbff" }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={2}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {first && (
            <Typography component="div" sx={{ ...VALUE_STYLE[first.emphasis], mb: rest.length ? 0.5 : 0 }}>
              {first.key !== "name" && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ mr: 0.75 }}>
                  {first.label}:
                </Typography>
              )}
              {first.value || "—"}
            </Typography>
          )}
          {rest.length > 0 && (
            <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 3, rowGap: 0.5 }}>
              {rest.map((item) => (
                <Typography key={item.key} component="div" variant="body2" data-testid={`header-item-${item.key}`}>
                  <Typography component="span" variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                    {item.label}:
                  </Typography>
                  <Typography component="span" variant="body2" sx={{ fontWeight: 600, ...VALUE_STYLE[item.emphasis] }}>
                    {item.value || "—"}
                  </Typography>
                </Typography>
              ))}
            </Box>
          )}
        </Box>
        <Tooltip title="Update allergies and header details">
          <IconButton size="small" onClick={() => setEditing(true)} aria-label="Update allergies and header details">
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Stack>

      {editing && (
        <HeaderEditDialog
          patientId={patientId}
          data={data}
          onChanged={load}
          onClose={() => setEditing(false)}
        />
      )}
    </Paper>
  );
}

function HeaderEditDialog({ patientId, data, onChanged, onClose }) {
  const [substance, setSubstance] = useState("");
  const [reaction, setReaction] = useState("");
  const [severity, setSeverity] = useState("");
  const [values, setValues] = useState(() => Object.fromEntries(data.custom_fields.map((f) => [f.key, f.value])));
  const [busy, setBusy] = useState(false);

  const records = data.allergies.records;
  const active = records.filter((a) => a.status === "active");
  const inactive = records.filter((a) => a.status !== "active");

  const run = async (action, failure) => {
    setBusy(true);
    try {
      const headers = await authHeader();
      await action(headers);
      await onChanged();
      return true;
    } catch (err) {
      toast.error(errorText(err, failure));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addAllergy = async () => {
    const ok = await run(
      (headers) => api.post(apiEndpoints.patientAllergies(patientId), { substance, reaction, severity }, { headers }),
      "Could not add the allergy."
    );
    if (ok) {
      setSubstance("");
      setReaction("");
      setSeverity("");
    }
  };

  const setStatus = (a, status) =>
    run((headers) => api.patch(apiEndpoints.patientAllergy(patientId, a.id), { status }, { headers }), "Could not change the allergy.");

  const remove = (a) =>
    run((headers) => api.delete(apiEndpoints.patientAllergy(patientId, a.id), { headers }), "Could not remove the allergy.");

  const markNone = () =>
    run(
      (headers) => api.put(apiEndpoints.patientAllergyStatus(patientId), { no_known_allergies: true }, { headers }),
      "Could not record that."
    );

  const saveValues = async () => {
    const ok = await run(
      (headers) => api.put(apiEndpoints.patientHeaderValues(patientId), { values }, { headers }),
      "Could not save the details."
    );
    if (ok) toast.success("Saved.");
  };

  const dirty = data.custom_fields.some((f) => (values[f.key] || "") !== (f.value || ""));

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Allergies and header details</DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
          Allergies
        </Typography>

        {active.length === 0 && (
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
            <Typography variant="body2" color={data.allergies.no_known_allergies ? "text.primary" : "warning.dark"}>
              {data.allergies.no_known_allergies ? "No known allergies" : "Not documented yet"}
            </Typography>
            {!data.allergies.no_known_allergies && (
              <Button size="small" variant="outlined" disabled={busy} onClick={markNone}>
                Patient has no known allergies
              </Button>
            )}
          </Stack>
        )}

        {active.map((a) => (
          <Stack key={a.id} direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }} data-testid={`allergy-${a.id}`}>
            <Chip color="error" size="small" label={a.substance} />
            <Typography variant="body2" sx={{ flex: 1 }}>
              {[a.reaction, a.severity].filter(Boolean).join(", ")}
            </Typography>
            <Button size="small" disabled={busy} onClick={() => setStatus(a, "inactive")}>
              Mark inactive
            </Button>
            <Button size="small" color="error" disabled={busy} onClick={() => remove(a)}>
              Entered in error
            </Button>
          </Stack>
        ))}

        {inactive.length > 0 && (
          <Box sx={{ mt: 1 }}>
            <Typography variant="caption" color="text.secondary">
              No longer active
            </Typography>
            {inactive.map((a) => (
              <Stack key={a.id} direction="row" alignItems="center" spacing={1}>
                <Typography variant="body2" sx={{ flex: 1, textDecoration: "line-through" }}>
                  {a.substance}
                </Typography>
                <Button size="small" disabled={busy} onClick={() => setStatus(a, "active")}>
                  Make active
                </Button>
              </Stack>
            ))}
          </Box>
        )}

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 2 }}>
          <TextField size="small" label="Allergic to" value={substance} onChange={(e) => setSubstance(e.target.value)} sx={{ flex: 2 }} />
          <TextField size="small" label="Reaction" value={reaction} onChange={(e) => setReaction(e.target.value)} sx={{ flex: 2 }} />
          <TextField size="small" select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)} sx={{ flex: 1, minWidth: 120 }}>
            {SEVERITIES.map((s) => (
              <MenuItem key={s.value} value={s.value}>
                {s.label}
              </MenuItem>
            ))}
          </TextField>
          <Button variant="contained" disabled={busy || !substance.trim()} onClick={addAllergy}>
            Add
          </Button>
        </Stack>

        {data.custom_fields.length > 0 && (
          <>
            <Divider sx={{ my: 2 }} />
            <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
              Other details
            </Typography>
            <Stack spacing={1.5}>
              {data.custom_fields.map((f) => (
                <TextField
                  key={f.key}
                  size="small"
                  label={f.label}
                  value={values[f.key] || ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  select={f.field_type === "yes_no"}
                  type={f.field_type === "date" ? "date" : "text"}
                  InputLabelProps={f.field_type === "date" ? { shrink: true } : undefined}
                  inputProps={{ maxLength: 300 }}
                >
                  {f.field_type === "yes_no" &&
                    [
                      { value: "", label: "Not recorded" },
                      { value: "yes", label: "Yes" },
                      { value: "no", label: "No" },
                    ].map((o) => (
                      <MenuItem key={o.value} value={o.value}>
                        {o.label}
                      </MenuItem>
                    ))}
                </TextField>
              ))}
            </Stack>
          </>
        )}
      </DialogContent>
      <DialogActions>
        {data.custom_fields.length > 0 && (
          <Button variant="contained" disabled={busy || !dirty} onClick={saveValues}>
            Save details
          </Button>
        )}
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}

export default PatientChartHeader;
