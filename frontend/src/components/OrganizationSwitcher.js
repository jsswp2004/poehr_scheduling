import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Radio, RadioGroup, TextField, Typography,
} from "@mui/material";
import axios from "axios";
import { API_BASE_URL, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { clearActingOrg, ownOrgIdFromToken, setActingOrg, useActingOrg } from "../utils/actingOrg";

/**
 * "Work in another organization" window for system administrators. Opened from the organization name in
 * the header. The choice is kept by utils/actingOrg and followed by the pages that support it.
 */
export default function OrganizationSwitcher({ open, onClose }) {
  const acting = useActingOrg();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState("");
  const ownId = ownOrgIdFromToken();

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setQuery("");
    setPick(acting ? acting.id : ownId);
    setError("");
    setLoading(true);
    axios
      .get(`${API_BASE_URL}/api/users/organizations/`, { headers: getAuthHeaders(getAccessToken()) })
      .then((res) => {
        if (cancelled) return;
        const list = (Array.isArray(res.data) ? res.data : res.data?.results || [])
          .map((o) => ({ id: String(o.id), name: o.name || `Organization ${o.id}`, state: o.state || "" }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setOrgs(list);
      })
      .catch(() => !cancelled && setError("Could not load the list of organizations."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const own = orgs.find((o) => o.id === ownId);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? orgs.filter((o) => o.name.toLowerCase().includes(q)) : orgs;
  }, [orgs, query]);

  const apply = () => {
    const chosen = orgs.find((o) => o.id === pick);
    if (chosen) setActingOrg(chosen, own || { id: ownId, name: "" });
    onClose();
  };
  const backToMine = () => {
    clearActingOrg();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="org-switch-title">
      <DialogTitle id="org-switch-title">Work in another organization</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Choose the organization you want to look at and change. Pages that support it will follow your choice.
        </Typography>
        <TextField
          autoFocus
          fullWidth
          size="small"
          type="search"
          label="Search organizations"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          sx={{ mb: 1 }}
        />
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", p: 3 }}><CircularProgress size={26} /></Box>
        ) : (
          <RadioGroup value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Organizations" sx={{ maxHeight: 280, overflow: "auto", flexWrap: "nowrap" }}>
            {shown.map((o) => (
              <FormControlLabel
                key={o.id}
                value={o.id}
                control={<Radio size="small" />}
                label={
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <span>{o.name}{o.state ? ` (${o.state})` : ""}</span>
                    {o.id === ownId && <Chip size="small" color="success" variant="outlined" label="Yours" />}
                  </Box>
                }
              />
            ))}
            {shown.length === 0 && <Typography variant="body2" color="text.secondary">No organization matches.</Typography>}
          </RadioGroup>
        )}
      </DialogContent>
      <DialogActions sx={{ flexWrap: "wrap", gap: 0.5 }}>
        <Button onClick={backToMine} disabled={!acting}>Back to my organization</Button>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={apply} disabled={!pick || loading}>Switch</Button>
      </DialogActions>
    </Dialog>
  );
}
