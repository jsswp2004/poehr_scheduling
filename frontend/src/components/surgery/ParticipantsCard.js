import { useCallback, useEffect, useState } from "react";
import { Box, Button, IconButton, Paper, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";
import AddParticipantDialog from "./AddParticipantDialog";
import { toInputValue } from "./surgeryUtils";

/** One participant: time in, time out and comments save when the person leaves the box. */
function ParticipantRow({ caseId, row, editable, onChanged, onRemoved }) {
  const [timeIn, setTimeIn] = useState(toInputValue(row.time_in));
  const [timeOut, setTimeOut] = useState(toInputValue(row.time_out));
  const [comments, setComments] = useState(row.comments || "");

  useEffect(() => {
    setTimeIn(toInputValue(row.time_in));
    setTimeOut(toInputValue(row.time_out));
    setComments(row.comments || "");
  }, [row]);

  const commit = async (field, value, original) => {
    if ((value || "") === (original || "")) return;
    try {
      const saved = await surgeryApi.updateParticipant(caseId, row.id, { [field]: value || (field === "comments" ? "" : null) });
      onChanged(saved);
    } catch (err) {
      toast.error(errorText(err, "That change was not saved."));
      setTimeIn(toInputValue(row.time_in));
      setTimeOut(toInputValue(row.time_out));
      setComments(row.comments || "");
    }
  };

  const remove = async () => {
    try {
      await surgeryApi.removeParticipant(caseId, row.id);
      onRemoved(row.id);
    } catch (err) {
      toast.error(errorText(err, "The participant was not removed."));
    }
  };

  return (
    <TableRow>
      <TableCell sx={{ whiteSpace: "nowrap" }}>{row.role_label}</TableCell>
      <TableCell>{row.display}</TableCell>
      <TableCell>
        <TextField
          size="small"
          type="datetime-local"
          value={timeIn}
          disabled={!editable}
          onChange={(e) => setTimeIn(e.target.value)}
          onBlur={() => commit("time_in", timeIn, toInputValue(row.time_in))}
          inputProps={{ "aria-label": `${row.role_label} time in` }}
        />
      </TableCell>
      <TableCell>
        <TextField
          size="small"
          type="datetime-local"
          value={timeOut}
          disabled={!editable}
          onChange={(e) => setTimeOut(e.target.value)}
          onBlur={() => commit("time_out", timeOut, toInputValue(row.time_out))}
          inputProps={{ "aria-label": `${row.role_label} time out` }}
        />
      </TableCell>
      <TableCell sx={{ minWidth: 200 }}>
        <TextField
          size="small"
          fullWidth
          value={comments}
          disabled={!editable}
          onChange={(e) => setComments(e.target.value)}
          onBlur={() => commit("comments", comments, row.comments)}
          inputProps={{ "aria-label": `${row.role_label} comments`, maxLength: 255 }}
        />
      </TableCell>
      <TableCell padding="checkbox">
        {editable && (
          <IconButton size="small" aria-label={`Remove ${row.role_label}`} onClick={remove}>
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
      </TableCell>
    </TableRow>
  );
}

/** The Participants grid on the Intra-op tab. */
export default function ParticipantsCard({ caseId, lookups, editable }) {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    surgeryApi
      .participants(caseId)
      .then(setRows)
      .catch((err) => toast.error(errorText(err, "Could not load the participants.")));
  }, [caseId]);

  useEffect(load, [load]);

  const replace = (saved) => setRows((rs) => rs.map((r) => (r.id === saved.id ? saved : r)));

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
        <Typography variant="subtitle2" sx={{ flex: 1 }}>
          Participants
        </Typography>
        {editable && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setOpen(true)}>
            Add Participant
          </Button>
        )}
      </Box>
      <TableContainer>
        <Table size="small" aria-label="Case participants">
          <TableHead>
            <TableRow>
              <TableCell>Role</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Time In</TableCell>
              <TableCell>Time Out</TableCell>
              <TableCell>Comments</TableCell>
              <TableCell padding="checkbox" />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((r) => (
              <ParticipantRow
                key={r.id}
                caseId={caseId}
                row={r}
                editable={editable}
                onChanged={replace}
                onRemoved={(id) => setRows((rs) => rs.filter((x) => x.id !== id))}
              />
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6}>
                  <Typography color="text.secondary" variant="body2" sx={{ py: 1, textAlign: "center" }}>
                    No participants added yet.
                  </Typography>
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <AddParticipantDialog
        open={open}
        caseId={caseId}
        roles={lookups?.participant_roles || []}
        me={lookups?.me}
        onClose={() => setOpen(false)}
        onAdded={(added) => setRows((rs) => [...rs, added])}
      />
    </Paper>
  );
}
