import React, { useCallback, useEffect, useState } from "react";
import axios from "axios";
import { Alert, Box, Button, Checkbox, FormControl, InputLabel, MenuItem, Select, TextField, Typography } from "@mui/material";
import { getValidToken } from "../../utils/auth";
import { apiEndpoints } from "../../config/api";

const authConfig = async () => ({ headers: { Authorization: `Bearer ${await getValidToken()}` } });
const messageFrom = (err, fallback) => err?.response?.data?.detail || fallback;

const KINDS = [
  { kind: "types", title: "Insurance types", hint: "Format letters: A letter, N number, Z letter or number, P punctuation. A type marked required primary has to be order 1." },
  { kind: "carriers", title: "Carriers", hint: "The insurance companies you deal with." },
  { kind: "plans", title: "Plans", hint: "A plan needs a carrier and a type first. Untick Active to discontinue a plan; patients keep it as history." },
];

/**
 * Registration Configuration > Insurance setup: types (with the policy number format), carriers and plans.
 * Nothing is deleted: untick Active to retire an entry.
 */
export default function InsuranceSetup() {
  const [data, setData] = useState(null);
  const [kind, setKind] = useState("types");
  const [rows, setRows] = useState([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const adopt = useCallback((payload, k) => {
    setData(payload);
    setRows((payload[k] || []).map((r) => ({ ...r })));
    setDirty(false);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await axios.get(apiEndpoints.insuranceSetup, await authConfig());
        adopt(res.data, "types");
      } catch (err) {
        setMessage({ severity: "error", text: messageFrom(err, "Could not load insurance setup.") });
      }
    })();
  }, [adopt]);

  const pick = (k) => {
    setKind(k);
    setMessage(null);
    if (data) adopt(data, k);
  };
  const edit = (i, patch) => {
    setRows((rs) => rs.map((r, n) => (n === i ? { ...r, ...patch } : r)));
    setDirty(true);
    setMessage(null);
  };
  const add = () => {
    setRows((rs) => [...rs, kind === "types" ? { name: "", policy_format: "", required_primary: false, active: true } : kind === "carriers" ? { name: "", active: true } : { name: "", carrier: "", insurance_type: "", active: true }]);
    setDirty(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      const items = rows.map((r) => ({ ...r }));
      const res = await axios.put(apiEndpoints.insuranceSetup, { kind, items }, await authConfig());
      adopt(res.data, kind);
      setMessage({ severity: "success", text: "Saved." });
    } catch (err) {
      setMessage({ severity: "error", text: messageFrom(err, "Could not save.") });
    } finally {
      setBusy(false);
    }
  };

  const info = KINDS.find((k) => k.kind === kind);
  const carriers = data?.carriers || [];
  const types = data?.types || [];
  return (
    <Box data-testid="insurance-setup" sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        {KINDS.map((k) => (
          <Button key={k.kind} variant={k.kind === kind ? "contained" : "outlined"} size="small" onClick={() => pick(k.kind)} data-testid={`ins-kind-${k.kind}`}>
            {k.title}
          </Button>
        ))}
        <Box sx={{ flex: 1 }} />
        <Button onClick={add} data-testid="ins-add">
          Add
        </Button>
        <Button variant="contained" onClick={save} disabled={busy || !dirty} data-testid="ins-save">
          Save
        </Button>
      </Box>
      <Typography variant="caption" color="text.secondary">
        {info.hint}
      </Typography>
      {message && (
        <Alert severity={message.severity} onClose={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}
      <Box component="table" sx={{ borderCollapse: "collapse", width: "100%", "& td, & th": { p: 0.5, borderBottom: "1px solid", borderColor: "divider", textAlign: "left", fontSize: 14 } }}>
        <thead>
          <tr>
            <th>Name</th>
            {kind === "types" && <th>Policy number format</th>}
            {kind === "types" && <th>Required primary</th>}
            {kind === "plans" && <th>Carrier</th>}
            {kind === "plans" && <th>Type</th>}
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id || `n${i}`} data-testid={`ins-row-${i}`}>
              <td>
                <TextField size="small" fullWidth value={r.name} onChange={(e) => edit(i, { name: e.target.value })} inputProps={{ maxLength: 120, "aria-label": `Name ${i + 1}`, "data-testid": `ins-name-${i}` }} />
              </td>
              {kind === "types" && (
                <td style={{ width: 200 }}>
                  <TextField size="small" value={r.policy_format} onChange={(e) => edit(i, { policy_format: e.target.value.toUpperCase() })} inputProps={{ maxLength: 40, "aria-label": `Format ${i + 1}`, "data-testid": `ins-format-${i}` }} />
                </td>
              )}
              {kind === "types" && (
                <td style={{ width: 120 }}>
                  <Checkbox checked={!!r.required_primary} onChange={(e) => edit(i, { required_primary: e.target.checked })} inputProps={{ "aria-label": `Required primary ${i + 1}` }} />
                </td>
              )}
              {kind === "plans" && (
                <td>
                  <FormControl size="small" fullWidth>
                    <InputLabel id={`ins-car-${i}`}>Carrier</InputLabel>
                    <Select labelId={`ins-car-${i}`} label="Carrier" value={r.carrier || ""} onChange={(e) => edit(i, { carrier: e.target.value })} inputProps={{ "data-testid": `ins-carrier-${i}` }}>
                      {carriers.filter((c) => c.active || c.id === r.carrier).map((c) => (
                        <MenuItem key={c.id} value={c.id}>
                          {c.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </td>
              )}
              {kind === "plans" && (
                <td>
                  <FormControl size="small" fullWidth>
                    <InputLabel id={`ins-typ-${i}`}>Type</InputLabel>
                    <Select labelId={`ins-typ-${i}`} label="Type" value={r.insurance_type || ""} onChange={(e) => edit(i, { insurance_type: e.target.value })} inputProps={{ "data-testid": `ins-type-${i}` }}>
                      {types.filter((t) => t.active || t.id === r.insurance_type).map((t) => (
                        <MenuItem key={t.id} value={t.id}>
                          {t.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                </td>
              )}
              <td style={{ width: 80 }}>
                <Checkbox checked={!!r.active} onChange={(e) => edit(i, { active: e.target.checked })} inputProps={{ "aria-label": `Active ${i + 1}` }} />
              </td>
            </tr>
          ))}
        </tbody>
      </Box>
    </Box>
  );
}
