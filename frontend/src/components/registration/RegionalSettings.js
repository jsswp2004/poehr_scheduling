import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Alert, Box, Button, Checkbox, FormControl, FormControlLabel, IconButton, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

const authConfig = async (extra = {}) => {
  const token = await getValidToken();
  return { headers: { Authorization: `Bearer ${token}` }, ...extra };
};
const messageFrom = (err, fallback) => err?.response?.data?.detail || fallback;

/**
 * Registration Configuration > Regional and ZIP: the country (which decides Zip Code / Postal Code, State / Province
 * and SSN / SIN wording), whether a ZIP the clinic does not know is refused, and the clinic's ZIP / postal table.
 * Administrators only.
 */
export default function RegionalSettings() {
  const [settings, setSettings] = useState(null);
  const [settingsMsg, setSettingsMsg] = useState(null);
  const [zip, setZip] = useState({ total: 0, results: [] });
  const [q, setQ] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [replace, setReplace] = useState(false);
  const [report, setReport] = useState(null);
  const [zipMsg, setZipMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadSettings = useCallback(async () => {
    try {
      const res = await axios.get(apiEndpoints.registrationSettings, await authConfig());
      setSettings({ country: res.data.country, validate_zip: !!res.data.validate_zip, countries: res.data.countries || [] });
    } catch (err) {
      setSettingsMsg({ severity: "error", text: messageFrom(err, "Could not load the settings.") });
    }
  }, []);
  const loadZip = useCallback(async (query) => {
    try {
      const res = await axios.get(apiEndpoints.zipCodes, await authConfig({ params: query ? { q: query } : {} }));
      setZip({ total: res.data.total, results: res.data.results || [] });
    } catch (err) {
      setZipMsg({ severity: "error", text: messageFrom(err, "Could not load the ZIP codes.") });
    }
  }, []);
  useEffect(() => {
    loadSettings();
  }, [loadSettings]);
  useEffect(() => {
    loadZip(q);
  }, [q, loadZip]);

  const saveSettings = async () => {
    setBusy(true);
    try {
      await axios.put(apiEndpoints.registrationSettings, { country: settings.country, validate_zip: settings.validate_zip }, await authConfig());
      setSettingsMsg({ severity: "success", text: "Saved. Registration forms pick this up the next time they open." });
    } catch (err) {
      setSettingsMsg({ severity: "error", text: messageFrom(err, "Could not save.") });
    } finally {
      setBusy(false);
    }
  };

  const readFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setFileName(file.name);
      setCsv(String(reader.result || ""));
      setReport(null);
    };
    reader.readAsText(file);
  };

  const send = async (preview) => {
    setBusy(true);
    setZipMsg(null);
    try {
      const res = await axios.post(apiEndpoints.zipCodes, { csv, replace, preview }, await authConfig());
      setReport({ ...res.data, preview });
      if (!preview) {
        setCsv("");
        setFileName("");
        setZipMsg({ severity: "success", text: `Imported ${res.data.valid} codes. The table now holds ${res.data.total}.` });
        loadZip(q);
      }
    } catch (err) {
      const d = err?.response?.data;
      setReport(d && d.valid !== undefined ? { ...d, preview } : null);
      setZipMsg({ severity: "error", text: messageFrom(err, "Could not import.") });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (params) => {
    setBusy(true);
    try {
      await axios.delete(apiEndpoints.zipCodes, await authConfig({ params }));
      loadZip(q);
    } catch (err) {
      setZipMsg({ severity: "error", text: messageFrom(err, "Could not remove.") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 720 }} data-testid="regional-settings">
      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        Regional settings
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        The country sets the wording on the registration form: Zip Code and State, or Postal Code and Province, and Social Security or Social Insurance Number. A label you set under Field settings still wins.
      </Typography>
      {settings && (
        <Stack spacing={1} sx={{ mb: 3 }}>
          <FormControl size="small" sx={{ maxWidth: 260 }}>
            <InputLabel id="rs-country">Country</InputLabel>
            <Select labelId="rs-country" label="Country" value={settings.country} onChange={(e) => { setSettings({ ...settings, country: e.target.value }); setSettingsMsg(null); }} data-testid="rs-country">
              {(settings.countries.length ? settings.countries : [{ key: "US", label: "United States" }, { key: "CA", label: "Canada" }]).map((c) => (
                <MenuItem key={c.key} value={c.key}>
                  {c.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <FormControlLabel
            control={<Checkbox checked={settings.validate_zip} onChange={(e) => { setSettings({ ...settings, validate_zip: e.target.checked }); setSettingsMsg(null); }} inputProps={{ "data-testid": "rs-validate" }} />}
            label="Refuse a ZIP / postal code that is not in the table below (only once the table has codes)"
          />
          {settingsMsg && <Alert severity={settingsMsg.severity}>{settingsMsg.text}</Alert>}
          <Box>
            <Button variant="contained" onClick={saveSettings} disabled={busy} data-testid="rs-save">
              Save settings
            </Button>
          </Box>
        </Stack>
      )}

      <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>
        ZIP / postal codes
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
        Typing a code in Demographics fills the city and state from this table. Import a list with one code per line: <code>code, city, state</code>. A header line is fine, and ZIP+4 is shortened to 5 digits.
        A GeoNames postal-code file (<code>US.txt</code> or <code>CA.txt</code>, unzipped) can be chosen as it is. GeoNames data is licensed CC BY 4.0: credit GeoNames (geonames.org) where you publish it.
      </Typography>
      {fileName ? (
        <Alert severity="info" action={<Button size="small" onClick={() => { setCsv(""); setFileName(""); setReport(null); }}>Clear</Button>} data-testid="zip-file">
          {fileName} loaded ({csv.split("\n").filter((l) => l.trim()).length.toLocaleString()} lines). Preview it, then import.
        </Alert>
      ) : (
        <TextField
          size="small"
          fullWidth
          multiline
          minRows={4}
          label="Paste codes, or choose a file"
          value={csv}
          onChange={(e) => { setCsv(e.target.value); setReport(null); }}
          inputProps={{ "data-testid": "zip-csv" }}
          placeholder={"11201, Brooklyn, NY\nK1A 0B1, Ottawa, ON"}
        />
      )}
      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1, flexWrap: "wrap" }}>
        <Button component="label" size="small" variant="outlined">
          Choose file
          <input type="file" hidden accept=".csv,.txt,text/csv,text/plain" onChange={(e) => { readFile(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        </Button>
        <FormControlLabel control={<Checkbox size="small" checked={replace} onChange={(e) => setReplace(e.target.checked)} />} label="Replace the whole table" />
        <Button size="small" variant="outlined" disabled={busy || !csv.trim()} onClick={() => send(true)} data-testid="zip-preview">
          Preview
        </Button>
        <Button size="small" variant="contained" disabled={busy || !csv.trim()} onClick={() => send(false)} data-testid="zip-import">
          Import
        </Button>
      </Stack>
      {report && (
        <Alert severity={report.error_count ? "warning" : "info"} sx={{ mt: 1.5 }} data-testid="zip-report">
          {report.preview ? "Preview: " : ""}
          {report.valid} usable ({report.new} new, {report.updated} to update)
          {report.error_count ? `, ${report.error_count} row${report.error_count === 1 ? "" : "s"} skipped` : ""}.
          {(report.errors || []).map((e) => (
            <div key={e}>{e}</div>
          ))}
        </Alert>
      )}
      {zipMsg && <Alert severity={zipMsg.severity} sx={{ mt: 1.5 }}>{zipMsg.text}</Alert>}

      <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mt: 2, mb: 0.5 }}>
        <Typography variant="body2" sx={{ fontWeight: 600 }} data-testid="zip-total">
          {zip.total} code{zip.total === 1 ? "" : "s"} in the table
        </Typography>
        <TextField size="small" placeholder="Search by code" value={q} onChange={(e) => setQ(e.target.value)} inputProps={{ "data-testid": "zip-search" }} />
        <Button size="small" color="error" disabled={busy || !zip.total} onClick={() => remove({ all: 1 })} data-testid="zip-remove-all">
          Remove all
        </Button>
      </Stack>
      <Box data-testid="zip-list">
        {zip.results.map((z) => (
          <Box key={z.code} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.25, borderBottom: "1px solid", borderColor: "divider" }}>
            <Typography variant="body2" sx={{ width: 80, fontWeight: 600 }}>
              {z.code}
            </Typography>
            <Typography variant="body2" sx={{ flex: 1 }}>
              {z.city}, {z.state}
            </Typography>
            <IconButton size="small" aria-label={`Remove ${z.code}`} onClick={() => remove({ code: z.code })}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ))}
        {zip.total > zip.results.length && !q && (
          <Typography variant="caption" color="text.secondary">
            Showing the first {zip.results.length}. Search to find a code.
          </Typography>
        )}
      </Box>
    </Box>
  );
}
