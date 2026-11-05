import { useState, useEffect, useCallback, useRef } from "react";
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
  Avatar,
  Menu,
} from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import EditIcon from "@mui/icons-material/Edit";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "./headerApi";
import AllergyAddForm from "./AllergyAddForm";
import GrowthChartButton from "../growth/GrowthChartModal";

/** The two letters shown when a patient has no photo: first letter of the first and last names. */
function initialsOf(name) {
  const text = String(name || "").trim();
  if (!text) return "";
  const parts = text.includes(",") ? text.split(",").map((x) => x.trim()).reverse() : text.split(/\s+/);
  return ((parts[0] || "")[0] || "").concat((parts[parts.length - 1] || "")[0] || "").toUpperCase();
}

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
function PatientChartHeader({ patientId, refreshKey = 0, visitId = null, persistent = false, onLoaded = null, nav = null }) {
  // Lets the page know which visit this banner is showing (its id, number and chart record).
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [jumpAnchor, setJumpAnchor] = useState(null);

  const load = useCallback(async () => {
    if (!patientId) return;
    try {
      const headers = await authHeader();
      const res = await api.get(apiEndpoints.patientHeader(patientId), { headers, params: visitId ? { visit: visitId } : {} });
      setData(res.data);
      setFailed(false);
      if (loadedRef.current) loadedRef.current(res.data);
    } catch (err) {
      setFailed(true);
    }
  }, [patientId, visitId]);

  // A different patient was chosen: drop the old banner so it never shows someone else's details.
  useEffect(() => {
    setData(null);
    setFailed(false);
    setEditing(false);
    if (loadedRef.current) loadedRef.current(null);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  // The always-visible banner on the Patients page: say so when no patient is chosen or it cannot load.
  if (persistent && (!patientId || (failed && !data))) {
    return (
      <Paper
        variant="outlined"
        component="section"
        aria-label="Patient header"
        data-testid="patient-chart-header-empty"
        sx={{ p: 1.5, mb: 1, borderLeft: "6px solid", borderLeftColor: "grey.400", bgcolor: "#eff6ff", flexShrink: 0 }}
      >
        <Typography variant="body2" color="text.secondary">
          {!patientId ? "No patient selected. Select a patient from the list." : "Patient header could not be loaded."}
        </Typography>
      </Paper>
    );
  }

  // No access (or the server is unreachable): show nothing rather than a broken banner.
  if (!patientId) return null;
  if (failed && !data) return null;
  if (!data) return <Box sx={{ minHeight: 56, mb: persistent ? 1 : 0, flexShrink: 0 }} aria-busy="true" />;

  const [first, ...rest] = data.items;

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-label="Patient header"
      data-testid="patient-chart-header"
      sx={{ p: 1.5, mb: persistent ? 1 : 2, flexShrink: 0, borderLeft: "6px solid", borderLeftColor: "primary.main", bgcolor: "#eff6ff" }}
    >
      <Stack direction="row" alignItems="flex-start" spacing={2}>
        <Avatar
          src={data.photo_url || undefined}
          alt=""
          data-testid="header-photo"
          sx={{ width: 56, height: 56, bgcolor: "primary.light", color: "primary.contrastText", fontWeight: 600, flexShrink: 0 }}
        >
          {initialsOf(first?.value)}
        </Avatar>
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
        <Stack alignItems="flex-end" spacing={0.5} sx={{ flexShrink: 0 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            {data.can_growth_chart && <GrowthChartButton patientId={patientId} ageMonths={data.age_months} size="small" />}
            <Tooltip title="Update allergies and header details">
              <IconButton size="small" onClick={() => setEditing(true)} aria-label="Update allergies and header details">
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Stack>
          {nav && (
            <Stack alignItems="flex-end" data-testid="patient-nav">
              <Stack direction="row" spacing={0.5}>
                <Tooltip placement="top" title={nav.prev ? `Previous: ${nav.prev.full_name}` : ""}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={nav.onPrev}
                      disabled={!nav.prev}
                      aria-label={nav.prev ? `Previous patient: ${nav.prev.full_name}` : "No previous patient"}
                      data-testid="patient-nav-prev"
                      sx={{ border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "background.paper" }}
                    >
                      <ChevronLeftIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip placement="top" title={nav.next ? `Next: ${nav.next.full_name}` : ""}>
                  <span>
                    <IconButton
                      size="small"
                      onClick={nav.onNext}
                      disabled={!nav.next}
                      aria-label={nav.next ? `Next patient: ${nav.next.full_name}` : "No next patient"}
                      data-testid="patient-nav-next"
                      sx={{ border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "background.paper" }}
                    >
                      <ChevronRightIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Stack>
              <Button
                size="small"
                color="inherit"
                onClick={(e) => setJumpAnchor(e.currentTarget)}
                aria-haspopup="menu"
                data-testid="patient-nav-count"
                sx={{ minWidth: 0, py: 0, px: 0.5, fontSize: "0.75rem", color: "text.secondary", textTransform: "none" }}
              >
                {nav.index + 1} of {nav.total}
              </Button>
              <Menu anchorEl={jumpAnchor} open={!!jumpAnchor} onClose={() => setJumpAnchor(null)} slotProps={{ paper: { sx: { maxHeight: 360 } } }}>
                <Typography variant="caption" color="text.secondary" sx={{ px: 2, py: 0.5, display: "block" }}>
                  {nav.label}
                </Typography>
                {nav.patients.map((p, i) => (
                  <MenuItem
                    key={p.user_id}
                    selected={i === nav.index}
                    onClick={() => {
                      setJumpAnchor(null);
                      if (i !== nav.index) nav.onJump(i);
                    }}
                  >
                    {i + 1}. {p.full_name}
                  </MenuItem>
                ))}
              </Menu>
            </Stack>
          )}
        </Stack>
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

  const addAllergy = (payload) =>
    run((headers) => api.post(apiEndpoints.patientAllergies(patientId), payload, { headers }), "Could not add the allergy.");

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
              {[a.reaction_type === "intolerance" ? "Intolerance" : null, a.reaction, a.severity].filter(Boolean).join(", ")}
              {a.code ? (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  {a.code_system === "rxnorm" ? "RxNorm" : "SNOMED"} {a.code}
                </Typography>
              ) : null}
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

        <AllergyAddForm busy={busy} onAdd={addAllergy} />

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
