import { useEffect, useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  FormControlLabel, Radio, RadioGroup, TextField, Typography,
} from "@mui/material";
import axios from "axios";
import { API_BASE_URL, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";
import { chooseActingOrg, ownOrgIdFromToken, useActingOrg } from "../utils/actingOrg";

/**
 * "Which organization are you working in?" window for system administrators.
 *
 * `required` is the sign-in version: it cannot be closed (no button, Escape or click outside), nothing is
 * preselected, and it stays until an organization is saved. Without it, it is the header switcher.
 * The server keeps the choice and limits everything the person sees and changes to that organization.
 */
export default function OrganizationSwitcher({ open, onClose, required = false }) {
  const acting = useActingOrg();
  const [orgs, setOrgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [pick, setPick] = useState("");
  const [saving, setSaving] = useState(false);
  const ownId = ownOrgIdFromToken();

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setQuery("");
    setPick(required ? "" : acting ? acting.id : ownId);
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

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? orgs.filter((o) => o.name.toLowerCase().includes(q)) : orgs;
  }, [orgs, query]);

  const apply = async () => {
    const chosen = orgs.find((o) => o.id === pick);
    if (!chosen) return;
    setSaving(true);
    setError("");
    try {
      await chooseActingOrg(chosen, required ? "login" : "header");
      if (onClose) onClose();
    } catch (err) {
      setError(err?.response?.data?.detail || "Could not save your choice. Try again.");
    } finally {
      setSaving(false);
    }
  };
  // The sign-in window ignores Escape and clicks outside; the header one closes normally.
  const handleClose = (event, reason) => {
    if (required) return;
    if (onClose) onClose(event, reason);
  };

  return (
    <Dialog open={open} onClose={handleClose} disableEscapeKeyDown={required} fullWidth maxWidth="xs" aria-labelledby="org-switch-title">
      <DialogTitle id="org-switch-title">{required ? "Which organization are you working in?" : "Work in another organization"}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          {required
            ? "Everything you open and change in this session applies to the organization you choose. You can switch later from the header."
            : "Everything you open and change applies to the organization you choose."}
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
        {!required && <Button onClick={() => handleClose()}>Cancel</Button>}
        <Button variant="contained" onClick={apply} disabled={!pick || loading || saving}>
          {required ? "Work in this organization" : "Switch"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
