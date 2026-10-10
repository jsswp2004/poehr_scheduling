import { useEffect, useState } from "react";
import { Alert, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader, errorText } from "../prescriptions/rxShared";

/**
 * Remove someone from the organization. People who have never ordered, documented, prescribed or messaged are
 * deleted. People who have are deactivated instead, so everything they signed keeps their name; they can no
 * longer sign in, are taken off every facility and conversation, and can be restored later.
 */
export default function RemoveUserDialog({ user, onClose, onDone }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const name = `${user.first_name || ""} ${user.last_name || ""}`.trim() || user.username;

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.userRemoval(user.id), { headers });
        if (live) setPreview(res.data);
      } catch (err) {
        if (live) setError(errorText(err, "Could not check this person."));
      }
    })();
    return () => {
      live = false;
    };
  }, [user.id]);

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const headers = await authHeader();
      const res = await api.post(apiEndpoints.userRemoval(user.id), {}, { headers });
      onDone(res.data);
    } catch (err) {
      setError(errorText(err, "Could not remove this person."));
      setBusy(false);
    }
  };

  const deactivate = preview && preview.action === "deactivate";

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Remove {name} from the organization?</DialogTitle>
      <DialogContent>
        {!preview && !error && <CircularProgress size={22} aria-label="Checking" />}
        {error && <Alert severity="error" sx={{ mb: 1 }}>{error}</Alert>}
        {preview && !deactivate && (
          <Typography variant="body2">
            {name} has not ordered, documented, prescribed or sent any secure messages, so the account will be
            deleted permanently.
          </Typography>
        )}
        {deactivate && (
          <>
            <Typography variant="body2" sx={{ mb: 1 }}>
              {name} already has history in the system ({preview.history.join(", ")}), so the account will be
              deactivated, not deleted. Everything they signed keeps their name.
            </Typography>
            <Typography variant="body2">
              They can no longer sign in, and are taken off all facilities and secure conversations. You can
              restore them later.
            </Typography>
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button color="error" variant="contained" onClick={confirm} disabled={busy || !preview}>
          {deactivate ? "Deactivate" : "Delete"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
