import { useEffect, useState } from "react";
import { Alert, Box, Button, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";

const STAGE = { preop: "PreOp", pacu: "PACU" };

/**
 * Asks which PreOp or PACU bed the patient is going to. Beds with someone in them cannot be picked, and the list shows
 * who is there. "Decide later" moves the case without a bed (the patient is then in the operating-room unit as a whole).
 */
export default function BayDialog({ open, caseId, status, onClose, onConfirm, busy }) {
  const [beds, setBeds] = useState(null);
  const [pick, setPick] = useState(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    setBeds(null);
    setPick(null);
    setProblem("");
    surgeryApi
      .bayOptions(caseId)
      .then((rows) => live && setBeds(rows))
      .catch((err) => {
        if (live) {
          setBeds([]);
          setProblem(errorText(err, "Could not load the beds."));
        }
      });
    return () => {
      live = false;
    };
  }, [open, caseId]);

  const rooms = (beds || []).reduce((acc, b) => {
    (acc[b.room] = acc[b.room] || []).push(b);
    return acc;
  }, {});
  const stage = STAGE[status] || status;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Move to {stage}: choose a bed</DialogTitle>
      <DialogContent dividers>
        {problem && <Alert severity="error" sx={{ mb: 2 }}>{problem}</Alert>}
        {!beds && <CircularProgress aria-label="Loading beds" />}
        {beds && beds.length === 0 && !problem && (
          <Alert severity="info">
            No PreOp or PACU beds are set up yet. Add rooms and beds to an operating-room unit in the Location Manager.
            You can still move the case now.
          </Alert>
        )}
        {Object.entries(rooms).map(([room, list]) => (
          <Box key={room} sx={{ mb: 2 }}>
            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>{room}</Typography>
            <ToggleButtonGroup exclusive size="small" value={pick} onChange={(_, v) => setPick(v)} sx={{ flexWrap: "wrap", gap: 1 }}>
              {list.map((b) => (
                <ToggleButton
                  key={b.id}
                  value={b.id}
                  disabled={b.state !== "available" && !b.current}
                  aria-label={`Bed ${b.name} in ${room}${b.state !== "available" ? `, ${b.note || b.state}` : ""}`}
                  sx={{ textTransform: "none", flexDirection: "column", minWidth: 96 }}
                >
                  <span>Bed {b.name}</span>
                  <Typography variant="caption" color="inherit">{b.state === "available" ? "Free" : b.note || b.state}</Typography>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Box>
        ))}
        <Typography variant="caption" color="text.secondary">
          The patient's visit moves to this bed, so the bed board and census show them there.
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Stack direction="row" spacing={1}>
          <Button disabled={busy || !beds} onClick={() => onConfirm(null)}>Decide later</Button>
          <Button variant="contained" disabled={busy || !beds || pick === null} onClick={() => onConfirm(pick)}>
            Move to {stage}
          </Button>
        </Stack>
      </DialogActions>
    </Dialog>
  );
}
