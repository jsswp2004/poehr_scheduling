import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Alert, Box, Button, Checkbox, IconButton, List, ListItemButton, ListItemText, TextField, Typography } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

const authConfig = async (extra = {}) => {
  const token = await getValidToken();
  return { headers: { Authorization: `Bearer ${token}` }, ...extra };
};
const messageFrom = (err, fallback) => err?.response?.data?.detail || fallback;

/** Why this list cannot be saved, or "". Mirrors the server's rules. */
export const problemWithEntries = (entries) => {
  const seen = new Set();
  for (const e of entries) {
    const v = (e.value || "").trim();
    if (!v) return "An entry has no value.";
    if (seen.has(v.toLowerCase())) return `'${v}' is listed twice.`;
    seen.add(v.toLowerCase());
    if ((e.abbr || "").trim().length > 5) return `The abbreviation for '${v}' is longer than 5 characters.`;
  }
  if (!entries.some((e) => e.active)) return "Keep at least one active entry.";
  return "";
};

/**
 * Registration Configuration > Dictionaries: the choice lists behind registration fields. Entries can be
 * added, reordered and made inactive; inactive entries stay on old records but are not offered again.
 */
export default function RegistrationDictionaries() {
  const [data, setData] = useState(null);
  const [code, setCode] = useState("language");
  const [entries, setEntries] = useState([]);
  const [newValue, setNewValue] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const adopt = useCallback((payload, key) => {
    setData(payload);
    const d = (payload.dictionaries || []).find((x) => x.code === key);
    setEntries((d?.entries || []).map((e) => ({ ...e })));
    setDirty(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(apiEndpoints.registrationDictionaries, await authConfig());
        adopt(res.data, "language");
      } catch (err) {
        setMessage({ severity: "error", text: messageFrom(err, "Could not load the dictionaries.") });
      }
    })();
  }, [adopt]);

  const pick = (key) => {
    setCode(key);
    setMessage(null);
    setNewValue("");
    if (data) adopt(data, key);
  };
  const change = (next) => {
    setEntries(next);
    setDirty(true);
    setMessage(null);
  };
  const add = () => {
    const v = newValue.trim();
    if (!v) return;
    if (entries.some((e) => e.value.toLowerCase() === v.toLowerCase())) {
      setMessage({ severity: "warning", text: `'${v}' is already on the list.` });
      return;
    }
    change([...entries, { value: v, abbr: "", active: true }]);
    setNewValue("");
  };
  const move = (i, delta) => {
    const t = i + delta;
    if (t < 0 || t >= entries.length) return;
    const next = [...entries];
    [next[i], next[t]] = [next[t], next[i]];
    change(next);
  };
  const patch = (i, p) => change(entries.map((e, n) => (n === i ? { ...e, ...p } : e)));

  const run = async (fn, okText) => {
    setBusy(true);
    try {
      const res = await fn();
      adopt(res.data, code);
      setMessage({ severity: "success", text: okText });
    } catch (err) {
      setMessage({ severity: "error", text: messageFrom(err, "Could not save.") });
    } finally {
      setBusy(false);
    }
  };
  const problem = problemWithEntries(entries);
  const save = async () =>
    run(async () => axios.put(apiEndpoints.registrationDictionaries, { code, entries }, await authConfig()), "Saved. New registrations offer this list.");
  const reset = async () =>
    run(async () => axios.delete(apiEndpoints.registrationDictionaries, await authConfig({ params: { code } })), "Back to the built-in list.");

  const current = (data?.dictionaries || []).find((d) => d.code === code);

  return (
    <Box data-testid="dictionaries" sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "240px 1fr" }, gap: 2 }}>
      <List dense disablePadding sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, alignSelf: "start" }}>
        {(data?.dictionaries || []).map((d) => (
          <ListItemButton key={d.code} selected={d.code === code} onClick={() => pick(d.code)} data-testid={`dict-${d.code}`}>
            <ListItemText primary={d.title} secondary={d.source === "organization" ? "Customized" : null} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
            {current?.title}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Used on: {current?.used_on}
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Button onClick={reset} disabled={busy || !current || current.source === "default"} data-testid="dict-reset">
            Reset to defaults
          </Button>
          <Button variant="contained" onClick={save} disabled={busy || !dirty || !!problem} data-testid="dict-save">
            Save
          </Button>
        </Box>
        {message && (
          <Alert severity={message.severity} onClose={() => setMessage(null)}>
            {message.text}
          </Alert>
        )}
        {dirty && problem && <Alert severity="warning">{problem}</Alert>}
        <Box sx={{ display: "flex", gap: 1 }}>
          <TextField
            size="small"
            label="Add an entry"
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
            }}
            inputProps={{ maxLength: 80, "data-testid": "dict-new" }}
            sx={{ flex: 1 }}
          />
          <Button onClick={add} data-testid="dict-add">
            Add
          </Button>
        </Box>
        <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", "& td, & th": { p: 0.5, borderBottom: "1px solid", borderColor: "divider", textAlign: "left", fontSize: 14 } }}>
          <thead>
            <tr>
              <th>Entry</th>
              <th>Abbreviation</th>
              <th>Active</th>
              <th>Order</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={`${e.value}-${i}`} data-testid={`dict-row-${i}`} style={{ opacity: e.active ? 1 : 0.55 }}>
                <td>
                  <TextField size="small" fullWidth value={e.value} inputProps={{ maxLength: 80, "aria-label": `Entry ${i + 1}` }} onChange={(ev) => patch(i, { value: ev.target.value })} />
                </td>
                <td style={{ width: 110 }}>
                  <TextField size="small" value={e.abbr} inputProps={{ maxLength: 5, "aria-label": `Abbreviation for ${e.value}` }} onChange={(ev) => patch(i, { abbr: ev.target.value })} />
                </td>
                <td style={{ width: 70 }}>
                  <Checkbox checked={e.active} onChange={(ev) => patch(i, { active: ev.target.checked })} inputProps={{ "aria-label": `${e.value} active` }} />
                </td>
                <td style={{ width: 90, whiteSpace: "nowrap" }}>
                  <IconButton size="small" aria-label={`Move ${e.value} up`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUpwardIcon fontSize="small" />
                  </IconButton>
                  <IconButton size="small" aria-label={`Move ${e.value} down`} disabled={i === entries.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDownwardIcon fontSize="small" />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </Box>
        <Typography variant="caption" color="text.secondary">
          Inactive entries stay on old records but are not offered for new registrations.
        </Typography>
      </Box>
    </Box>
  );
}
