import { useEffect, useState } from "react";
import { Paper, TextField, Typography } from "@mui/material";
import { surgeryApi } from "./surgeryApi";

/** Pre-op / Post-op: the Primary preference card's notes, read only. */
export default function CardNotesPanel({ caseId, kind }) {
  const [info, setInfo] = useState(null);
  useEffect(() => {
    surgeryApi.caseCards(caseId).then(setInfo).catch(() => setInfo({ primary: "", pre_op_notes: "", post_op_notes: "" }));
  }, [caseId]);
  if (!info) return null;
  const label = kind === "pre" ? "Pre-op Card Notes" : "Post-op Card Notes";
  const notes = kind === "pre" ? info.pre_op_notes : info.post_op_notes;
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        {label}
      </Typography>
      <TextField
        fullWidth
        multiline
        minRows={8}
        value={info.primary ? `Preference Card: ${info.primary}\n${notes}` : "No preference card on this case."}
        InputProps={{ readOnly: true }}
        inputProps={{ "aria-label": label }}
      />
    </Paper>
  );
}
