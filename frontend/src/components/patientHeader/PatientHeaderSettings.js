import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Switch,
  IconButton,
  Tooltip,
  Button,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  FormControlLabel,
  Checkbox,
  CircularProgress,
  Alert,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "./headerApi";

// Gives each switch a spoken name ("Show MRN") without drawing any extra text.
const VISUALLY_HIDDEN = {
  position: "absolute",
  width: 1,
  height: 1,
  margin: -1,
  padding: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
  border: 0,
};

const TYPE_OPTIONS = [
  { value: "text", label: "Text (for example, Full code)" },
  { value: "yes_no", label: "Yes / No" },
  { value: "date", label: "Date" },
];

/**
 * Settings > Patient Header. An administrator chooses which items every chart
 * header in the clinic shows, puts them in order, and can add the clinic's own
 * items (code status, isolation, ...). Nothing changes until Save.
 */
function PatientHeaderSettings() {
  const [items, setItems] = useState(null);
  const [saved, setSaved] = useState("");
  const [canEdit, setCanEdit] = useState(false);
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const snapshot = (list) => JSON.stringify(list.map((i) => [i.key, i.visible]));

  const load = useCallback(async () => {
    try {
      const headers = await authHeader();
      const res = await api.get(apiEndpoints.patientHeaderConfig, { headers });
      setItems(res.data.items);
      setSaved(snapshot(res.data.items));
      setCanEdit(!!res.data.can_edit);
      setProblem("");
    } catch (err) {
      setProblem(errorText(err, "Could not load the patient header settings."));
      setItems([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (items === null) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  const dirty = snapshot(items) !== saved;
  const shownCount = items.filter((i) => i.visible).length;

  const toggle = (key) => setItems(items.map((i) => (i.key === key ? { ...i, visible: !i.visible } : i)));

  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    setItems(next);
  };

  const save = async () => {
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = await api.put(
        apiEndpoints.patientHeaderConfig,
        { items: items.map((i) => ({ key: i.key, visible: i.visible })) },
        { headers }
      );
      setItems(res.data.items);
      setSaved(snapshot(res.data.items));
      toast.success("Patient header saved.");
    } catch (err) {
      toast.error(errorText(err, "Could not save the patient header."));
    } finally {
      setBusy(false);
    }
  };

  const removeCustom = async (item) => {
    if (!window.confirm(`Delete "${item.label}"? Its values on every patient are deleted too.`)) return;
    setBusy(true);
    try {
      const headers = await authHeader();
      const fields = await api.get(apiEndpoints.patientHeaderFields, { headers });
      const field = (fields.data || []).find((f) => f.item_key === item.key);
      if (field) await api.delete(apiEndpoints.patientHeaderField(field.id), { headers });
      const next = items.filter((i) => i.key !== item.key);
      setItems(next);
      setSaved(snapshot(next)); // the server dropped it from the layout as well
      toast.success("Item deleted.");
    } catch (err) {
      toast.error(errorText(err, "Could not delete the item."));
    } finally {
      setBusy(false);
    }
  };

  const created = (field) => {
    // a new item joins the end of the list, switched on; Save makes it official
    const item = {
      key: field.item_key,
      label: field.label,
      description: "Added by your clinic",
      visible: true,
      kind: "custom",
      field_type: field.field_type,
      alert: field.alert,
    };
    setItems((current) => [...current, item]);
    setAdding(false);
  };

  return (
    <Box sx={{ p: 2, maxWidth: 760 }}>
      <Typography variant="h6">Patient header</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        The strip at the top of every patient chart. Switch items on or off and use the arrows to put them in order. The order here is the order on screen.
      </Typography>

      {problem && <Alert severity="warning" sx={{ mb: 2 }}>{problem}</Alert>}
      {!canEdit && !problem && <Alert severity="info" sx={{ mb: 2 }}>Only an administrator can change the patient header.</Alert>}

      <Paper variant="outlined" sx={{ mb: 2, p: 1.5, bgcolor: "#f7fbff" }} aria-label="Preview" data-testid="header-preview">
        <Typography variant="caption" color="text.secondary">
          Preview
        </Typography>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {items.filter((i) => i.visible).map((i) => i.label).join("  ·  ") || "Nothing is shown"}
        </Typography>
      </Paper>

      <Stack spacing={1}>
        {items.map((item, index) => (
          <Paper key={item.key} variant="outlined" sx={{ p: 1, display: "flex", alignItems: "center", gap: 1, opacity: item.visible ? 1 : 0.65 }} data-testid={`header-row-${item.key}`}>
            <FormControlLabel
              sx={{ m: 0 }}
              control={<Switch checked={item.visible} onChange={() => toggle(item.key)} disabled={!canEdit} />}
              label={<span style={VISUALLY_HIDDEN}>{`Show ${item.label}`}</span>}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {item.label}
              </Typography>
              {item.description && (
                <Typography variant="caption" color="text.secondary">
                  {item.description}
                </Typography>
              )}
            </Box>
            <Tooltip title="Move up">
              <span>
                <IconButton size="small" disabled={!canEdit || index === 0} onClick={() => move(index, -1)} aria-label={`Move ${item.label} up`}>
                  <ArrowUpwardIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <Tooltip title="Move down">
              <span>
                <IconButton size="small" disabled={!canEdit || index === items.length - 1} onClick={() => move(index, 1)} aria-label={`Move ${item.label} down`}>
                  <ArrowDownwardIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            {item.kind === "custom" && canEdit && (
              <Tooltip title="Delete this item">
                <IconButton size="small" color="error" disabled={busy} onClick={() => removeCustom(item)} aria-label={`Delete ${item.label}`}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
          </Paper>
        ))}
      </Stack>

      {canEdit && (
        <Stack direction="row" spacing={1} sx={{ mt: 2 }} alignItems="center">
          <Button startIcon={<AddIcon />} onClick={() => setAdding(true)} disabled={busy}>
            Add an item
          </Button>
          <Box sx={{ flex: 1 }} />
          {dirty && (
            <Typography variant="caption" color="text.secondary">
              Unsaved changes
            </Typography>
          )}
          <Button variant="contained" onClick={save} disabled={busy || !dirty || shownCount === 0}>
            Save
          </Button>
        </Stack>
      )}
      {canEdit && shownCount === 0 && (
        <Typography variant="caption" color="error">
          Show at least one item.
        </Typography>
      )}

      {adding && <AddItemDialog onClose={() => setAdding(false)} onCreated={created} />}
    </Box>
  );
}

function AddItemDialog({ onClose, onCreated }) {
  const [label, setLabel] = useState("");
  const [fieldType, setFieldType] = useState("text");
  const [alert, setAlert] = useState(false);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = await api.post(apiEndpoints.patientHeaderFields, { label, field_type: fieldType, alert }, { headers });
      onCreated(res.data);
    } catch (err) {
      toast.error(errorText(err, "Could not add the item."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Add a header item</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField autoFocus label="Name" value={label} onChange={(e) => setLabel(e.target.value)} inputProps={{ maxLength: 60 }} helperText="For example: Code status, Isolation, Fall risk" />
          <TextField select label="What is entered" value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
            {TYPE_OPTIONS.map((o) => (
              <MenuItem key={o.value} value={o.value}>
                {o.label}
              </MenuItem>
            ))}
          </TextField>
          <FormControlLabel control={<Checkbox checked={alert} onChange={(e) => setAlert(e.target.checked)} />} label="Show in red when filled in" />
          <Typography variant="caption" color="text.secondary">
            Staff fill this in for each patient from the pencil on the chart header.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" disabled={busy || !label.trim()} onClick={create}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default PatientHeaderSettings;
