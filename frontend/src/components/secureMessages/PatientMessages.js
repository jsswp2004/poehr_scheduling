import { useState } from "react";
import { Alert, Box, Button, Paper, Typography } from "@mui/material";
import useInbox from "../../hooks/secureMessages/useInbox";
import Conversation from "./Conversation";
import { secure, errorText } from "./secureApi";

/** The care-team conversation for one patient. It follows the patient across inpatient, ED and clinic. */
export default function PatientMessages({ patient }) {
  const { threads, loading, error, reload } = useInbox(patient.id);
  const [busy, setBusy] = useState(false);
  const [openError, setOpenError] = useState("");
  const [opened, setOpened] = useState(null);
  const thread = threads.find((t) => t.kind === "patient") || (opened ? { id: opened } : null);

  const open = async () => {
    setBusy(true);
    setOpenError("");
    try {
      const t = await secure.start({ kind: "patient", patient: patient.id });
      setOpened(t.id);
      reload();
    } catch (err) {
      setOpenError(errorText(err, "Could not open the care-team conversation."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <Typography sx={{ p: 2 }}>Loading messages…</Typography>;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (thread) {
    return (
      <Paper variant="outlined" sx={{ height: 560, minHeight: 0 }} data-testid="patient-messages">
        <Conversation key={thread.id} threadId={thread.id} />
      </Paper>
    );
  }
  return (
    <Box sx={{ p: 2, display: "grid", gap: 1.5, maxWidth: 560 }} data-testid="patient-messages-start">
      <Typography variant="subtitle1">Care-team messages</Typography>
      <Typography variant="body2" color="text.secondary">
        A private conversation for the staff caring for this patient, shared across inpatient, ED and clinic visits. Opening it adds you to the care team
        conversation; your name, role and the time are recorded.
      </Typography>
      {openError && <Alert severity="error">{openError}</Alert>}
      <Box>
        <Button variant="contained" onClick={open} disabled={busy} data-testid="open-care-team">
          Open care-team messages
        </Button>
      </Box>
    </Box>
  );
}
