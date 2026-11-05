import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Alert, Box, Button, FormControl, InputLabel, MenuItem, Select, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

const authConfig = async (extra = {}) => {
  const token = await getValidToken();
  return { headers: { Authorization: `Bearer ${token}` }, ...extra };
};
const messageFrom = (err, fallback) => err?.response?.data?.detail || fallback;

/** The editable rows of one step, from the server's window. */
export const rowsFromWindow = (w) => (w?.fields || []).map((f) => ({ ...f }));

/** The body to save: only fields that differ from the built-in label and Optional. */
export const bodyFromRows = (rows) =>
  Object.fromEntries(
    rows
      .filter((r) => r.mode !== "opt" || (r.label || "").trim() !== r.default_label)
      .map((r) => [r.key, { label: (r.label || "").trim(), mode: r.mode }])
  );

/**
 * Registration Configuration > Field settings: for each step, relabel a field and make it required,
 * view-only or hidden. Date of birth and legal sex can be relabelled or required, never hidden.
 */
export default function RegistrationFieldSettings() {
  const [data, setData] = useState(null);
  const [windowKey, setWindowKey] = useState("identity");
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const adopt = useCallback((payload, key) => {
    setData(payload);
    setRows(rowsFromWindow((payload.windows || []).find((w) => w.key === key)));
    setDirty(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(apiEndpoints.registrationFields, await authConfig());
        adopt(res.data, "identity");
      } catch (err) {
        setMessage({ severity: "error", text: messageFrom(err, "Could not load the field settings.") });
      }
    })();
  }, [adopt]);

  const pick = (key) => {
    setWindowKey(key);
    setMessage(null);
    if (data) adopt(data, key);
  };
  const edit = (key, patch) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    setDirty(true);
    setMessage(null);
  };

  const run = async (fn, okText) => {
    setBusy(true);
    try {
      const res = await fn();
      adopt(res.data, windowKey);
      setMessage({ severity: "success", text: okText });
    } catch (err) {
      setMessage({ severity: "error", text: messageFrom(err, "Could not save.") });
    } finally {
      setBusy(false);
    }
  };
  const save = async () =>
    run(async () => axios.put(apiEndpoints.registrationFields, { window: windowKey, fields: bodyFromRows(rows) }, await authConfig()), "Saved. New registrations use these settings.");
  const reset = async () =>
    run(async () => axios.delete(apiEndpoints.registrationFields, await authConfig({ params: { window: windowKey } })), "Back to the built-in labels.");

  const win = (data?.windows || []).find((w) => w.key === windowKey);
  const modes = data?.modes || [];

  return (
    <Box data-testid="field-settings" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1.5, alignItems: "center", flexWrap: "wrap" }}>
        <FormControl size="small" sx={{ minWidth: 220 }}>
          <InputLabel id="fs-window">Step</InputLabel>
          <Select labelId="fs-window" label="Step" value={windowKey} onChange={(e) => pick(e.target.value)} inputProps={{ "data-testid": "fs-window" }}>
            {(data?.windows || []).map((w) => (
              <MenuItem key={w.key} value={w.key}>
                {w.title}
                {w.source === "organization" ? " (customized)" : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <Box sx={{ flex: 1 }} />
        <Button onClick={reset} disabled={busy || !win || win.source === "default"} data-testid="fs-reset">
          Reset to defaults
        </Button>
        <Button variant="contained" onClick={save} disabled={busy || !dirty} data-testid="fs-save">
          Save
        </Button>
      </Box>
      {message && (
        <Alert severity={message.severity} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}
      <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", "& td, & th": { p: 0.75, borderBottom: "1px solid", borderColor: "divider", textAlign: "left", fontSize: 14 } }}>
        <thead>
          <tr>
            <th>Field</th>
            <th>Label shown</th>
            <th>Setting</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} data-testid={`fs-row-${r.key}`}>
              <td>
                {r.default_label}
                {r.locked && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 0.75 }} title="Cannot be hidden or view-only">
                    (always shown)
                  </Typography>
                )}
              </td>
              <td>
                <TextField size="small" fullWidth value={r.label} inputProps={{ maxLength: 60, "aria-label": `Label for ${r.default_label}` }} onChange={(e) => edit(r.key, { label: e.target.value })} />
              </td>
              <td>
                <ToggleButtonGroup size="small" exclusive value={r.mode} onChange={(e, v) => v && edit(r.key, { mode: v })} aria-label={`Setting for ${r.default_label}`}>
                  {modes.map((m) => (
                    <ToggleButton key={m.key} value={m.key} disabled={r.locked && (m.key === "hid" || m.key === "view")} data-testid={`fs-${r.key}-${m.key}`} sx={{ textTransform: "none", px: 1.25 }}>
                      {m.label}
                    </ToggleButton>
                  ))}
                </ToggleButtonGroup>
              </td>
            </tr>
          ))}
        </tbody>
      </Box>
      <Typography variant="caption" color="text.secondary">
        Hidden fields keep any value already saved. Required fields must be filled in before the last step can be saved.
      </Typography>
    </Box>
  );
}
