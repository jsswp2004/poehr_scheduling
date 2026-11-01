import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Alert, Box, Button, Checkbox, FormControl, FormControlLabel, IconButton, InputLabel, List, ListItemButton, ListItemText, MenuItem, Select, Stack, Switch, TextField, Typography } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

const ROLES = [
  { value: "doctor", label: "Doctors" },
  { value: "nurse", label: "Nurses" },
  { value: "registrar", label: "Registrars" },
  { value: "admin", label: "Administrators" },
];
const TYPES = [
  { value: "yes_no", label: "Yes / No" },
  { value: "dictionary", label: "Choice list" },
  { value: "text", label: "Text" },
  { value: "date", label: "Date" },
  { value: "number", label: "Number" },
];

const authConfig = async (extra = {}) => {
  const token = await getValidToken();
  return { headers: { Authorization: `Bearer ${token}` }, ...extra };
};
const messageFrom = (err, fallback) => err?.response?.data?.detail || fallback;

let uidCounter = 0;
const newUid = () => {
  uidCounter += 1;
  return `new-${uidCounter}`;
};

const blankItem = () => ({ uid: newUid(), label: "", item_type: "yes_no", optionsText: "", required: false, showWhen: "", showValue: "" });

/** Server form to the editable shape: each question is known by a uid, so its dependency survives moving it. */
export const editableFrom = (form) => ({
  id: form.id,
  name: form.name,
  used_as: form.used_as,
  roles: form.roles || [],
  active: form.active,
  items: form.items.map((it) => ({
    uid: it.id,
    id: it.id,
    label: it.label,
    item_type: it.item_type,
    optionsText: (it.options || []).join(", "),
    required: !!it.required,
    showWhen: it.show_when === null || it.show_when === undefined ? "" : form.items[it.show_when].id,
    showValue: it.show_when_value || "",
  })),
});

/** The form as the server wants it; a dependency becomes the position of the question it depends on. */
export const payloadFrom = (form) => ({
  id: form.id,
  name: form.name.trim(),
  used_as: form.used_as,
  roles: form.roles,
  active: form.active,
  items: form.items.map((it) => {
    const at = it.showWhen === "" ? -1 : form.items.findIndex((x) => x.uid === it.showWhen);
    return {
      id: it.id,
      label: it.label.trim(),
      item_type: it.item_type,
      options: it.item_type === "dictionary" ? it.optionsText.split(",").map((o) => o.trim()).filter(Boolean) : [],
      required: it.required,
      show_when: at >= 0 ? at : null,
      show_when_value: at >= 0 ? it.showValue.trim() : "",
    };
  }),
});

/** Why this form cannot be saved, or "". Mirrors the server's rules. */
export const problemWithForm = (form) => {
  if (!form.name.trim()) return "Give the form a name.";
  if (!form.items.length) return "Add at least one question.";
  for (let i = 0; i < form.items.length; i += 1) {
    const it = form.items[i];
    if (!it.label.trim()) return `Question ${i + 1} needs a label.`;
    if (it.item_type === "dictionary" && !it.optionsText.split(",").some((o) => o.trim())) return `'${it.label}' needs at least one choice.`;
    if (it.showWhen !== "") {
      const at = form.items.findIndex((x) => x.uid === it.showWhen);
      if (at < 0 || at >= i) return `'${it.label}' can only depend on a question above it.`;
      if (!it.showValue.trim()) return `'${it.label}' needs the answer that shows it.`;
    }
  }
  return "";
};

/**
 * Registration Configuration > Forms: the clinic's own questions, kept on the patient or on the visit.
 * A question can show only when an earlier one has a given answer. Administrators only.
 */
export default function CustomFormsBuilder() {
  const [forms, setForms] = useState([]);
  const [current, setCurrent] = useState(null); // editable form, or null
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await axios.get(apiEndpoints.customForms, await authConfig());
      setForms(res.data.forms || []);
    } catch (err) {
      setMessage({ severity: "error", text: messageFrom(err, "Could not load the forms.") });
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const open = (form) => {
    setCurrent(form ? editableFrom(form) : { id: null, name: "", used_as: "visit", roles: [], active: true, items: [blankItem()] });
    setDirty(!form);
    setMessage(null);
  };
  const edit = (patch) => {
    setCurrent((c) => ({ ...c, ...patch }));
    setDirty(true);
    setMessage(null);
  };
  const editItem = (uid, patch) => edit({ items: current.items.map((it) => (it.uid === uid ? { ...it, ...patch } : it)) });
  const moveItem = (i, delta) => {
    const j = i + delta;
    if (j < 0 || j >= current.items.length) return;
    const items = [...current.items];
    [items[i], items[j]] = [items[j], items[i]];
    edit({ items });
  };
  const removeItem = (uid) =>
    edit({ items: current.items.filter((it) => it.uid !== uid).map((it) => (it.showWhen === uid ? { ...it, showWhen: "", showValue: "" } : it)) });

  const problem = current ? problemWithForm(current) : "";

  const save = async () => {
    setBusy(true);
    try {
      const res = await axios.put(apiEndpoints.customForms, { form: payloadFrom(current) }, await authConfig());
      const list = res.data.forms || [];
      setForms(list);
      const saved = list.find((f) => f.name === current.name.trim());
      if (saved) setCurrent(editableFrom(saved));
      setDirty(false);
      setMessage({ severity: "success", text: "Saved. Registrars see it on the Forms step." });
    } catch (err) {
      setMessage({ severity: "error", text: messageFrom(err, "Could not save.") });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!current.id) {
      setCurrent(null);
      return;
    }
    setBusy(true);
    try {
      const res = await axios.delete(apiEndpoints.customForms, await authConfig({ params: { id: current.id } }));
      setForms(res.data.forms || []);
      setCurrent(null);
      setMessage({ severity: "success", text: "Form deleted, with its answers." });
    } catch (err) {
      setMessage({ severity: "error", text: messageFrom(err, "Could not delete.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box data-testid="custom-forms-builder" sx={{ maxWidth: 820 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        Forms
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Add your own questions to registration. A form is kept on the patient or on each visit, and only the roles you pick see it.
      </Typography>
      <Box sx={{ display: "flex", gap: 2, flexDirection: { xs: "column", md: "row" } }}>
        <Box sx={{ width: { md: 220 }, flexShrink: 0 }}>
          <List dense disablePadding sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, mb: 1 }}>
            {forms.length === 0 && (
              <ListItemText sx={{ px: 2, py: 1 }} secondary="No forms yet." />
            )}
            {forms.map((f) => (
              <ListItemButton key={f.id} selected={current?.id === f.id} onClick={() => open(f)} data-testid={`form-row-${f.id}`}>
                <ListItemText primary={f.name} secondary={`${f.used_as === "visit" ? "Visit" : "Patient"}${f.active ? "" : " · off"}`} />
              </ListItemButton>
            ))}
          </List>
          <Button size="small" variant="outlined" onClick={() => open(null)} data-testid="form-new">
            New form
          </Button>
        </Box>

        {current && (
          <Stack spacing={1.5} sx={{ flex: 1 }} data-testid="form-editor">
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
              <TextField size="small" label="Form name" value={current.name} onChange={(e) => edit({ name: e.target.value })} sx={{ flex: 1 }} inputProps={{ maxLength: 100 }} />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel id="cf-used">Kept on</InputLabel>
                <Select labelId="cf-used" label="Kept on" value={current.used_as} onChange={(e) => edit({ used_as: e.target.value })}>
                  <MenuItem value="visit">Each visit</MenuItem>
                  <MenuItem value="patient">The patient</MenuItem>
                </Select>
              </FormControl>
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} alignItems={{ sm: "center" }}>
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel id="cf-roles">Who sees it</InputLabel>
                <Select
                  labelId="cf-roles"
                  label="Who sees it"
                  multiple
                  value={current.roles}
                  onChange={(e) => edit({ roles: e.target.value })}
                  renderValue={(v) => (v.length ? ROLES.filter((r) => v.includes(r.value)).map((r) => r.label).join(", ") : "Everyone")}
                >
                  {ROLES.map((r) => (
                    <MenuItem key={r.value} value={r.value}>
                      <Checkbox size="small" checked={current.roles.includes(r.value)} />
                      {r.label}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              <FormControlLabel control={<Switch checked={current.active} onChange={(e) => edit({ active: e.target.checked })} />} label="On" />
            </Stack>

            {current.items.map((it, i) => (
              <Box key={it.uid} data-testid={`form-item-${i}`} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.25 }}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
                  <TextField size="small" label={`Question ${i + 1}`} value={it.label} onChange={(e) => editItem(it.uid, { label: e.target.value })} sx={{ flex: 1 }} inputProps={{ maxLength: 200 }} />
                  <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel id={`cf-type-${it.uid}`}>Type</InputLabel>
                    <Select labelId={`cf-type-${it.uid}`} label="Type" value={it.item_type} onChange={(e) => editItem(it.uid, { item_type: e.target.value })}>
                      {TYPES.map((t) => (
                        <MenuItem key={t.value} value={t.value}>
                          {t.label}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControlLabel control={<Checkbox size="small" checked={it.required} onChange={(e) => editItem(it.uid, { required: e.target.checked })} />} label="Required" />
                  <IconButton size="small" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => moveItem(i, -1)}>
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" aria-label={`Move question ${i + 1} down`} disabled={i === current.items.length - 1} onClick={() => moveItem(i, 1)}>
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" aria-label={`Remove question ${i + 1}`} onClick={() => removeItem(it.uid)}>
                    <DeleteOutlineIcon fontSize="small" />
                  </IconButton>
                </Stack>
                {it.item_type === "dictionary" && (
                  <TextField size="small" fullWidth sx={{ mt: 1 }} label="Choices (separate with commas)" value={it.optionsText} onChange={(e) => editItem(it.uid, { optionsText: e.target.value })} />
                )}
                {i > 0 && (
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ mt: 1 }}>
                    <FormControl size="small" sx={{ minWidth: 220 }}>
                      <InputLabel id={`cf-when-${it.uid}`}>Show only when</InputLabel>
                      <Select
                        labelId={`cf-when-${it.uid}`}
                        label="Show only when"
                        value={it.showWhen}
                        onChange={(e) => editItem(it.uid, { showWhen: e.target.value, showValue: e.target.value === "" ? "" : it.showValue })}
                      >
                        <MenuItem value="">
                          <em>Always shown</em>
                        </MenuItem>
                        {current.items.slice(0, i).map((p, pi) => (
                          <MenuItem key={p.uid} value={p.uid}>
                            {p.label.trim() || `Question ${pi + 1}`}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                    {it.showWhen !== "" && <TextField size="small" label="is answered" value={it.showValue} onChange={(e) => editItem(it.uid, { showValue: e.target.value })} inputProps={{ "aria-label": `Answer that shows question ${i + 1}` }} />}
                  </Stack>
                )}
              </Box>
            ))}
            <Box>
              <Button size="small" onClick={() => edit({ items: [...current.items, blankItem()] })} disabled={current.items.length >= 40} data-testid="form-add-item">
                Add question
              </Button>
            </Box>

            {(problem || message) && <Alert severity={problem ? "warning" : message.severity}>{problem || message.text}</Alert>}
            <Stack direction="row" spacing={1}>
              <Button variant="contained" onClick={save} disabled={busy || !!problem || !dirty} data-testid="form-save">
                Save form
              </Button>
              <Button variant="outlined" color="error" onClick={remove} disabled={busy} data-testid="form-delete">
                {current.id ? "Delete form" : "Discard"}
              </Button>
            </Stack>
          </Stack>
        )}
      </Box>
      {!current && message && <Alert severity={message.severity} sx={{ mt: 1.5 }}>{message.text}</Alert>}
    </Box>
  );
}
