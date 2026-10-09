import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Checkbox, CircularProgress, FormControlLabel, FormGroup, Stack, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "../prescriptions/rxShared";

/**
 * Administrators choose which hospitals or clinics a person works at. Nothing checked means no restriction (they
 * see every facility, as before). Once any are checked, that person's Acute and ED patient lists, bed board
 * and unit pickers show only those facilities. System administrators are never restricted.
 */
export default function UserFacilitiesPanel({ user }) {
  const [data, setData] = useState(null);
  const [chosen, setChosen] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const headers = await authHeader();
      const res = await api.get(apiEndpoints.userFacilities(user.id), { headers });
      setData(res.data);
      setChosen(res.data.facility_ids || []);
    } catch (err) {
      setData(null);
      setError(errorText(err, "Could not load the facilities."));
    }
  }, [user.id]);

  useEffect(() => {
    setData(null);
    setSaved(false);
    load();
  }, [load]);

  const toggle = (id) => {
    setSaved(false);
    setChosen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const headers = await authHeader();
      const res = await api.put(apiEndpoints.userFacilities(user.id), { facility_ids: chosen }, { headers });
      setData(res.data);
      setChosen(res.data.facility_ids || []);
      setSaved(true);
    } catch (err) {
      setError(errorText(err, "Could not save the facilities."));
    } finally {
      setBusy(false);
    }
  };

  const original = data ? data.facility_ids : [];
  const changed = data && (chosen.length !== original.length || chosen.some((id) => !original.includes(id)));
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username;

  return (
    <Box sx={{ mt: 4 }} data-testid="user-facilities">
      <Typography variant="h6" sx={{ fontWeight: 600, color: "primary.main", mb: 1 }}>
        Facilities
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 1 }} data-testid="facilities-error">{error}</Alert>}
      {!data && !error && <CircularProgress size={22} />}
      {data && (
        <Stack spacing={1}>
          <Typography variant="body2" color="text.secondary">
            Where <strong>{name}</strong> works. Leave every box unchecked to let them see all facilities. Check one or more and their
            patient lists, bed board and unit filters show only those.
            {user.role === "system_admin" && " System administrators are never restricted."}
          </Typography>
          {data.facilities.length === 0 ? (
            <Typography variant="body2" data-testid="facilities-none">This organization has no facilities yet. Add them in the Location Manager.</Typography>
          ) : (
            <FormGroup>
              {data.facilities.map((f) => (
                <FormControlLabel
                  key={f.id}
                  control={<Checkbox size="small" checked={chosen.includes(f.id)} onChange={() => toggle(f.id)} inputProps={{ "data-testid": `facility-${f.id}` }} />}
                  label={`${f.name}${f.kind ? ` (${f.kind})` : ""}${f.is_active ? "" : " – inactive"}`}
                />
              ))}
            </FormGroup>
          )}
          <Box>
            <Button variant="contained" size="small" disabled={busy || !changed} onClick={save} data-testid="facilities-save" sx={{ textTransform: "none", fontWeight: 600 }}>
              {busy ? <CircularProgress size={18} /> : "Save facilities"}
            </Button>
            {saved && (
              <Typography component="span" variant="body2" sx={{ ml: 1.5 }} data-testid="facilities-saved">
                {chosen.length === 0 ? "Saved: no restriction." : `Saved: limited to ${chosen.length} ${chosen.length === 1 ? "facility" : "facilities"}.`}
              </Typography>
            )}
          </Box>
        </Stack>
      )}
    </Box>
  );
}
