import React, { useCallback, useEffect, useMemo, useState } from "react";
import axios from "axios";
import { Alert, Box, Button, Checkbox, FormControl, IconButton, InputLabel, MenuItem, Select, Typography } from "@mui/material";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

const SETTINGS = [
  { value: "", label: "All care settings" },
  { value: "ambulatory", label: "Ambulatory Care" },
  { value: "emergency", label: "Emergency Care" },
  { value: "acute", label: "Acute Care" },
];

const authConfig = async (extra = {}) => {
  const token = await getValidToken();
  return { headers: { Authorization: `Bearer ${token}` }, ...extra };
};

const messageFrom = (err, fallback) => err?.response?.data?.detail || fallback;

/** Builds the editable list: the steps in the sequence first, then the ones left out. */
export const rowsFrom = (data) => {
  const catalog = data.catalog || [];
  const byKey = Object.fromEntries(catalog.map((c) => [c.key, c]));
  const inSeq = (data.tabs || []).map((t) => ({
    key: t.key,
    label: t.label,
    locked: !!byKey[t.key]?.locked,
    included: true,
    requireReview: !!t.require_review,
  }));
  const used = new Set(inSeq.map((r) => r.key));
  const rest = catalog
    .filter((c) => !used.has(c.key))
    .map((c) => ({ key: c.key, label: c.label, locked: !!c.locked, included: false, requireReview: false }));
  return [...inSeq, ...rest];
};

/** Why this list cannot be saved, or "" when it can. Mirrors the server's rules. */
export const problemWith = (rows) => {
  const included = rows.filter((r) => r.included);
  if (!included.length) return "Keep at least one step.";
  if (included[0].key !== "identity") return "Patient Identity must stay first.";
  const missing = rows.filter((r) => r.locked && !r.included);
  if (missing.length) return `${missing[0].label} must stay in the sequence.`;
  return "";
};

/**
 * Registration Configuration > Tab sequences: which steps Full Registration shows, in what order,
 * and which steps a registrar must open before the last save. Administrators only.
 */
export default function RegistrationConfig() {
  const [careSetting, setCareSetting] = useState("");
  const [data, setData] = useState(null);
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState(null); // { severity, text }
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async (setting) => {
    try {
      const res = await axios.get(apiEndpoints.registrationTabs, await authConfig({ params: setting ? { care_setting: setting } : {} }));
      setData(res.data);
      setRows(rowsFrom(res.data));
      setDirty(false);
    } catch (err) {
      setMessage({ severity: "error", text: messageFrom(err, "Could not load the registration steps.") });
    }
  }, []);

  useEffect(() => {
    setMessage(null);
    load(careSetting);
  }, [careSetting, load]);

  const problem = useMemo(() => problemWith(rows), [rows]);
  const change = (next) => {
    setRows(next);
    setDirty(true);
    setMessage(null);
  };
  const move = (index, delta) => {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = [...rows];
    [next[index], next[target]] = [next[target], next[index]];
    // Patient Identity always opens the registration
    if (next.filter((r) => r.included)[0]?.key !== "identity" && next.some((r) => r.key === "identity" && r.included)) return;
    change(next);
  };
  const update = (index, patch) => change(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const save = async () => {
    setBusy(true);
    try {
      const tabs = rows.filter((r) => r.included).map((r) => ({ key: r.key, require_review: r.requireReview }));
      const res = await axios.put(apiEndpoints.registrationTabs, { care_setting: careSetting, tabs }, await authConfig());
      setData(res.data);
      setRows(rowsFrom(res.data));
      setDirty(false);
      setMessage({ severity: "success", text: "Saved. New registrations use this sequence." });
    } catch (err) {
      setMessage({ severity: "error", text: messageFrom(err, "Could not save.") });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      const res = await axios.delete(apiEndpoints.registrationTabs, await authConfig({ params: careSetting ? { care_setting: careSetting } : {} }));
      setData(res.data);
      setRows(rowsFrom(res.data));
      setDirty(false);
      setMessage({ severity: "success", text: "Back to the default sequence." });
    } catch (err) {
      setMessage({ severity: "error", text: messageFrom(err, "Could not reset.") });
    } finally {
      setBusy(false);
    }
  };

  const sourceText = !data
    ? ""
    : data.source === "care_setting"
      ? "A sequence is set for this care setting."
      : data.source === "organization"
        ? careSetting
          ? "Using the sequence for all care settings. Saving creates one for this care setting."
          : "A sequence is set for all care settings."
        : "Using the built-in sequence.";

  return (
    <Box sx={{ width: "100%" }} data-testid="registration-config">
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        Tab sequences
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Choose the steps Full Registration shows and their order. Mark a step <b>Require review</b> to make the registrar open it before the last save.
      </Typography>

      <FormControl size="small" sx={{ minWidth: 240, mb: 1 }}>
        <InputLabel id="reg-cfg-setting">Applies to</InputLabel>
        <Select labelId="reg-cfg-setting" label="Applies to" value={careSetting} onChange={(e) => setCareSetting(e.target.value)}>
          {SETTINGS.map((s) => (
            <MenuItem key={s.value || "all"} value={s.value}>
              {s.label}
              {data?.overrides?.includes(s.value || "all") ? " (set)" : ""}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
        {sourceText}
      </Typography>

      <Box sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, overflow: "hidden" }}>
        {rows.map((r, i) => (
          <Box
            key={r.key}
            data-testid={`cfg-row-${r.key}`}
            sx={{ display: "flex", alignItems: "center", gap: 1, px: 1, py: 0.25, borderBottom: i < rows.length - 1 ? "1px solid" : 0, borderColor: "divider", bgcolor: r.included ? "background.paper" : "action.hover" }}
          >
            <Checkbox
              size="small"
              checked={r.included}
              disabled={r.locked}
              onChange={(e) => update(i, { included: e.target.checked, requireReview: e.target.checked ? r.requireReview : false })}
              inputProps={{ "aria-label": `Show ${r.label}` }}
            />
            <Typography variant="body2" sx={{ flex: 1, color: r.included ? "text.primary" : "text.secondary" }}>
              {r.label}
              {r.locked && (
                <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                  always shown
                </Typography>
              )}
            </Typography>
            <Box component="label" sx={{ display: "flex", alignItems: "center", fontSize: 13, color: "text.secondary" }}>
              <Checkbox size="small" checked={r.requireReview} disabled={!r.included} onChange={(e) => update(i, { requireReview: e.target.checked })} />
              Require review
            </Box>
            <IconButton size="small" aria-label={`Move ${r.label} up`} disabled={!r.included || i === 0 || (i === 1 && rows[0].key === "identity")} onClick={() => move(i, -1)}>
              <ArrowUpwardIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" aria-label={`Move ${r.label} down`} disabled={!r.included || i >= rows.length - 1 || !rows[i + 1].included || r.key === "identity"} onClick={() => move(i, 1)}>
              <ArrowDownwardIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
      </Box>

      {(problem || message) && (
        <Alert severity={problem ? "warning" : message.severity} sx={{ mt: 1.5 }}>
          {problem || message.text}
        </Alert>
      )}

      <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
        <Button variant="contained" onClick={save} disabled={busy || !!problem || !dirty} data-testid="cfg-save">
          Save sequence
        </Button>
        <Button variant="outlined" onClick={reset} disabled={busy || !data || data.source === "default" || (careSetting && data.source !== "care_setting")} data-testid="cfg-reset">
          Reset to default
        </Button>
      </Box>
    </Box>
  );
}
