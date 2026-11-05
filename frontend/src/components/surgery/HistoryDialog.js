import { useEffect, useState } from "react";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";
import { usDateTime } from "./surgeryUtils";

const AREAS = { created: "Case", updated: "Case", status: "Status", participant: "Participants", usage: "Case Usage", charge: "Charges" };
const field = (name) => (name.includes(" ") ? name : name.replace(/_id$/, "").replace(/_/g, " ")).replace(/^./, (c) => c.toUpperCase());

/** Modification History: every change to the case, grouped by who made it and when. */
export default function HistoryDialog({ open, caseId, onClose }) {
  const [entries, setEntries] = useState(null);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    if (!open) return;
    setEntries(null);
    setProblem("");
    surgeryApi.history(caseId).then(setEntries).catch((e) => setProblem(errorText(e, "Could not load the history.")));
  }, [open, caseId]);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Modification History</DialogTitle>
      <DialogContent>
        {problem && <Alert severity="error">{problem}</Alert>}
        {entries && entries.length === 0 && <Typography color="text.secondary">No changes recorded.</Typography>}
        {entries &&
          entries.map((e) => (
            <Box key={e.id} sx={{ mb: 2 }}>
              <Typography variant="subtitle2">
                [{usDateTime(e.at)}] by {e.user || "unknown"}
              </Typography>
              <Table size="small" aria-label={`Changes ${e.id}`}>
                <TableHead>
                  <TableRow>
                    <TableCell>Area</TableCell>
                    <TableCell>Data Field</TableCell>
                    <TableCell>Action</TableCell>
                    <TableCell>Previous Value</TableCell>
                    <TableCell>New Value</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {e.changes.length === 0 && (
                    <TableRow>
                      <TableCell>{AREAS[e.action] || "Case"}</TableCell>
                      <TableCell colSpan={4}>{e.action === "created" ? "Case booked" : "Updated"}</TableCell>
                    </TableRow>
                  )}
                  {e.changes.map((c) => (
                    <TableRow key={c.field}>
                      <TableCell>{AREAS[e.action] || "Case"}</TableCell>
                      <TableCell>{field(c.field)}</TableCell>
                      <TableCell>{!c.previous ? "Added" : !c.new ? "Removed" : "Changed"}</TableCell>
                      <TableCell>{c.previous}</TableCell>
                      <TableCell>{c.new}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
