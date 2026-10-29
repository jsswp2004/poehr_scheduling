import { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import {
  Alert, Box, Button, Chip, CircularProgress, FormControl, IconButton, InputLabel, MenuItem, Paper, Select, Switch,
  TextField, Typography,
} from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { BuilderShell, BuilderToolbar, BuilderSplit } from "../components/builders/BuilderShell";
import DictionaryField, { DISPLAY_TYPE_LABELS } from "../components/dictionaries/DictionaryField";
import { API_BASE_URL } from "../config/api";

const BASE = `${API_BASE_URL}/api/users/dictionaries/`;
const slug = (s) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50);

// System Dictionaries: the configurable lists behind the app's choices. Roles first.
// System administrators only. Built-in entries are locked (label and order can change).
export default function SystemDictionariesPage() {
  const navigate = useNavigate();
  const [list, setList] = useState([]);
  const [code, setCode] = useState("roles");
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [newLabel, setNewLabel] = useState("");
  const [newBase, setNewBase] = useState("receptionist");

  const open = useCallback(async (c) => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE}${c}/`);
      setSaved(res.data);
      setDraft({ display_type: res.data.display_type, entries: res.data.entries });
      setCode(c);
    } catch (err) {
      setMessage({ severity: "error", text: err.response?.data?.detail || "Could not load the dictionary." });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    let role = "";
    try { role = token ? jwtDecode(token).role : ""; } catch (e) { role = ""; }
    if (!token) { navigate("/login"); return; }
    if (role !== "system_admin") { navigate("/admin"); return; }
    axios.get(BASE).then((r) => setList(r.data)).catch(() => {});
    open("roles");
  }, [navigate, open]);

  const dirty = useMemo(
    () => !!saved && !!draft && JSON.stringify({ d: saved.display_type, e: saved.entries }) !== JSON.stringify({ d: draft.display_type, e: draft.entries }),
    [saved, draft]
  );

  const setEntry = (i, patch) => setDraft((d) => ({ ...d, entries: d.entries.map((e, k) => (k === i ? { ...e, ...patch } : e)) }));
  const move = (i, dir) => setDraft((d) => {
    const next = [...d.entries];
    const j = i + dir;
    if (j < 0 || j >= next.length) return d;
    [next[i], next[j]] = [next[j], next[i]];
    return { ...d, entries: next };
  });
  const removeEntry = (i) => setDraft((d) => ({ ...d, entries: d.entries.filter((_, k) => k !== i) }));
  const addEntry = () => {
    const value = slug(newLabel);
    if (!value || value.length < 2) return;
    if (draft.entries.some((e) => e.value === value)) { setMessage({ severity: "error", text: `"${value}" already exists.` }); return; }
    setDraft((d) => ({ ...d, entries: [...d.entries, { value, label: newLabel.trim(), behaves_like: code === "roles" ? newBase : "", is_active: true, is_locked: false, isNew: true }] }));
    setNewLabel("");
  };

  const save = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const body = {
        display_type: draft.display_type,
        entries: draft.entries.map((e) => ({ value: e.value, label: e.label, behaves_like: e.behaves_like, is_active: e.is_active })),
      };
      const res = await axios.patch(`${BASE}${code}/`, body);
      setSaved(res.data);
      setDraft({ display_type: res.data.display_type, entries: res.data.entries });
      setMessage({ severity: "success", text: "Saved." });
    } catch (err) {
      const d = err.response?.data;
      setMessage({ severity: "error", text: d?.detail || (d && Object.values(d).flat().join(" ")) || "Could not save." });
    } finally {
      setSaving(false);
    }
  };

  const baseRoles = (draft?.entries || []).filter((e) => e.is_locked && e.value !== "patient" && e.value !== "system_admin");
  const previewOptions = (draft?.entries || []).filter((e) => e.is_active).map((e) => ({ value: e.value, label: e.label }));

  return (
    <BuilderShell title="System Dictionaries" subtitle="The lists behind the app's dropdowns. Shared by every organization." maxWidth={1280}>
      <BuilderToolbar>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 1 }}>
          <Box sx={{ flex: 1 }} />
          <Button size="small" disabled={!dirty || saving} onClick={() => open(code)}>Discard</Button>
          <Button size="small" variant="contained" disabled={!dirty || saving} onClick={save}>{saving ? "Saving..." : "Save"}</Button>
        </Box>
      </BuilderToolbar>

      {message && <Alert severity={message.severity} sx={{ mt: 2 }} onClose={() => setMessage(null)}>{message.text}</Alert>}

      <BuilderSplit
        list={
          <Box sx={{ display: "grid", gap: 1 }}>
            {list.map((d) => (
              <Paper key={d.code} variant="outlined" onClick={() => open(d.code)}
                sx={{ p: 1.25, cursor: "pointer", borderColor: d.code === code ? "primary.main" : "divider", borderWidth: d.code === code ? 2 : 1 }}>
                <Typography fontWeight={600}>{d.name}</Typography>
                <Typography variant="caption" color="text.secondary">{d.entry_count} entries, {DISPLAY_TYPE_LABELS[d.display_type]}</Typography>
              </Paper>
            ))}
          </Box>
        }
      >
        {loading && <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress /></Box>}
        {!loading && draft && (
          <Box sx={{ display: "grid", gap: 2 }}>
            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={600}>{saved.name}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>Used by: {saved.used_by || "not recorded"}</Typography>
              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel id="dt">How people choose a value</InputLabel>
                <Select labelId="dt" label="How people choose a value" value={draft.display_type} onChange={(e) => setDraft({ ...draft, display_type: e.target.value })}>
                  {saved.display_types.map((t) => <MenuItem key={t.value} value={t.value}>{t.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Entries</Typography>
              <Box sx={{ overflowX: "auto" }}>
                <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", minWidth: 620, "& td, & th": { p: 0.75, borderBottom: "1px solid", borderColor: "divider", textAlign: "left" } }}>
                  <thead><tr><th>Label shown</th><th>Stored value</th>{code === "roles" && <th>Behaves like</th>}<th>Status</th><th /></tr></thead>
                  <tbody>
                    {draft.entries.map((e, i) => (
                      <tr key={e.value}>
                        <td><TextField size="small" value={e.label} onChange={(ev) => setEntry(i, { label: ev.target.value })} inputProps={{ "aria-label": `Label for ${e.value}` }} /></td>
                        <td><code>{e.value}</code></td>
                        {code === "roles" && <td>{e.is_locked ? "Built in" : e.behaves_like}</td>}
                        <td>
                          {e.is_locked ? <Chip size="small" label="Locked" /> : (
                            <Switch size="small" checked={e.is_active} onChange={(ev) => setEntry(i, { is_active: ev.target.checked })} inputProps={{ "aria-label": `${e.label} active` }} />
                          )}
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <IconButton size="small" aria-label="Move up" onClick={() => move(i, -1)}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
                          <IconButton size="small" aria-label="Move down" onClick={() => move(i, 1)}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
                          {!e.is_locked && e.isNew && <Button size="small" onClick={() => removeEntry(i)}>Remove</Button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Box>
              </Box>
              <Box sx={{ display: "flex", gap: 1, mt: 2, flexWrap: "wrap", alignItems: "center" }}>
                <TextField size="small" label="New entry" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
                {code === "roles" && (
                  <FormControl size="small" sx={{ minWidth: 200 }}>
                    <InputLabel id="base">Behaves like</InputLabel>
                    <Select labelId="base" label="Behaves like" value={newBase} onChange={(e) => setNewBase(e.target.value)}>
                      {baseRoles.map((b) => <MenuItem key={b.value} value={b.value}>{b.label}</MenuItem>)}
                    </Select>
                  </FormControl>
                )}
                <Button variant="outlined" size="small" onClick={addEntry} disabled={slug(newLabel).length < 2}>Add entry</Button>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                Built-in entries keep their stored value because the app's access checks depend on them; their label and order can change.
                A new role acts as the built-in role you pick. Fine-tune its rights in Security Settings. Turn an entry off to stop offering it; people who have it keep working.
              </Typography>
            </Paper>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>Preview</Typography>
              <DictionaryField label={saved.name} name="preview" value="" onChange={() => {}} options={previewOptions} displayType={draft.display_type} />
            </Paper>
          </Box>
        )}
      </BuilderSplit>
    </BuilderShell>
  );
}
