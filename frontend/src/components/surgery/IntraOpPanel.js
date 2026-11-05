import { Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import ParticipantsCard from "./ParticipantsCard";
import TimesCard from "./TimesCard";
import { LATERALITY, hoursMinutes } from "./surgeryUtils";

const lateralityLabel = (v) => LATERALITY.find((l) => l.value === v)?.label || "";

/** The Intra-op tab: the planned procedures, who worked the case and when, and the case times. */
export default function IntraOpPanel({ row, lookups, canEdit, onSaved }) {
  const closed = row.next_statuses.length === 0;
  const editable = canEdit && !closed;
  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Planned Procedures{" "}
          <Typography component="span" variant="caption" color="text.secondary">
            · Planned duration: {hoursMinutes(row.duration_minutes)}
          </Typography>
        </Typography>
        <TableContainer>
          <Table size="small" aria-label="Planned procedures">
            <TableHead>
              <TableRow>
                <TableCell>Provider</TableCell>
                <TableCell>Procedure Name</TableCell>
                <TableCell>Procedure Type</TableCell>
                <TableCell>Procedure Codes</TableCell>
                <TableCell>Laterality</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {row.procedures.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>{row.surgeon?.name || ""}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>{p.is_primary ? "Primary" : "Secondary"}</TableCell>
                  <TableCell>{p.cpt_code}</TableCell>
                  <TableCell>{lateralityLabel(p.laterality)}</TableCell>
                </TableRow>
              ))}
              {row.procedures.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography color="text.secondary" variant="body2" sx={{ textAlign: "center" }}>
                      No procedures booked.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <ParticipantsCard caseId={row.id} lookups={lookups} editable={editable} />
      <TimesCard row={row} lookups={lookups} editable={editable} onSaved={onSaved} />
    </Stack>
  );
}
