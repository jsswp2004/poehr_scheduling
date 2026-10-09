import { useCallback, useEffect, useState } from "react";
import {
  Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, List, ListItem, ListItemText, Stack, TextField, Typography,
} from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "./rxShared";

/** The signed-in person's favorite prescriptions: pick one to start a new prescription from it, or remove it. */
export default function FavoritesDialog({ open, onClose, onUse }) {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get(apiEndpoints.prescriptionFavorites, { headers: await authHeader(), params: q.trim() ? { q: q.trim() } : {} });
      setRows(res.data?.results || []);
      setError("");
    } catch (err) {
      setError(errorText(err, "Could not load your favorites."));
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(load, q ? 250 : 0);
    return () => clearTimeout(timer);
  }, [open, load, q]);

  useEffect(() => {
    if (open) setQ("");
  }, [open]);

  const remove = async (fav) => {
    try {
      await api.delete(apiEndpoints.prescriptionFavorite(fav.id), { headers: await authHeader() });
      setRows((list) => list.filter((f) => f.id !== fav.id));
      toast.success("Removed from your favorites.");
    } catch (err) {
      toast.error(errorText(err, "Could not remove the favorite."));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" data-testid="rx-favorites">
      <DialogTitle>My favorite prescriptions</DialogTitle>
      <DialogContent dividers>
        <TextField size="small" fullWidth label="Search" value={q} onChange={(e) => setQ(e.target.value)} sx={{ mb: 1 }} inputProps={{ "data-testid": "rx-favorites-search" }} />
        {error && <Alert severity="error" data-testid="rx-favorites-error">{error}</Alert>}
        {loading ? (
          <CircularProgress size={22} />
        ) : rows.length === 0 && !error ? (
          <Typography variant="body2" color="text.secondary" data-testid="rx-favorites-empty">
            No favorites yet. Open a prescription and choose Save as favorite, or use Save as favorite while writing one.
          </Typography>
        ) : (
          <List dense disablePadding>
            {rows.map((f) => (
              <ListItem
                key={f.id}
                divider
                data-testid={`rx-favorite-${f.id}`}
                secondaryAction={
                  <Stack direction="row" spacing={0.5}>
                    <Button size="small" variant="contained" onClick={() => onUse(f)} data-testid={`rx-favorite-use-${f.id}`}>Use</Button>
                    <Button size="small" color="error" onClick={() => remove(f)} data-testid={`rx-favorite-remove-${f.id}`}>Remove</Button>
                  </Stack>
                }
              >
                <ListItemText
                  sx={{ pr: 18 }}
                  primary={f.label}
                  secondary={[f.sig, f.quantity ? `Dispense ${f.quantity} ${f.quantity_unit}`.trim() : "", f.refills ? `${f.refills} refill${f.refills === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}
                />
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
