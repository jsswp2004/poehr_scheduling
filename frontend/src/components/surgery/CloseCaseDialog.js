import { useEffect, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";
import { STATUS_META } from "./surgeryUtils";

export const CLOSING = ["discharged", "transferred", "cancelled"];

/** Close Case: pick how the case ends (and why, if it is cancelled). */
export default function CloseCaseDialog({ open, row, onClose, onClosed }) {
  const options = row.next_statuses.filter((s) => CLOSING.includes(s));
  const [status, setStatus] = useState(options[0] || "");
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setStatus(options[0] || "");
      setReason("");
      setProblem("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row.id]);

  const close = async () => {
    setBusy(true);
    setProblem("");
    try {
      const updated = await surgeryApi.setStatus(row.id, status, reason);
      toast.success(`Case ${updated.case_number}: ${updated.status_label}`);
      onClosed(updated);
      onClose();
    } catch (err) {
      setProblem(errorText(err, "The case was not closed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Close Case</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {problem && <Alert severity="error">{problem}</Alert>}
          <TextField size="small" label="Current status" value={row.status_label} InputProps={{ readOnly: true }} />
          <TextField size="small" select label="Closed status" value={status} onChange={(e) => setStatus(e.target.value)}>
            {options.map((s) => (
              <MenuItem key={s} value={s}>
                {STATUS_META[s].label}
              </MenuItem>
            ))}
          </TextField>
          {status === "cancelled" && (
            <TextField size="small" label="Cancellation reason" value={reason} onChange={(e) => setReason(e.target.value)} inputProps={{ maxLength: 200 }} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={close} disabled={busy || !status || (status === "cancelled" && !reason.trim())}>
          Close Case
        </Button>
      </DialogActions>
    </Dialog>
  );
}
