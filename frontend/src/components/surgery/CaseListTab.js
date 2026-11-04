import { useMemo, useState } from "react";
import { Box, Button, MenuItem, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { ACTION_LABELS, STATUS_META, LEGEND_ORDER, clock, displayName, matchesSearch, usDate } from "./surgeryUtils";
import StatusChip from "./StatusChip";

const COLUMNS = [
  { key: "date", label: "Date", render: (r) => usDate(r.date) },
  { key: "room", label: "Room", render: (r) => (r.room ? <span title={r.room.path || r.room.name}>{r.room.name}</span> : "Unassigned") },
  { key: "time", label: "Time", render: (r) => r.time },
  { key: "case_number", label: "Case ID", render: (r) => r.case_number },
  { key: "patient", label: "Patient Name", render: (r) => displayName(r.patient.name) },
  { key: "procedures", label: "Procedures", render: (r) => r.procedures_text, wide: true },
  { key: "surgeon", label: "Case Provider", render: (r) => r.surgeon?.name || "" },
  { key: "status", label: "Status", render: (r) => <StatusChip status={r.status} label={r.status_label} /> },
  { key: "type", label: "Type", render: (r) => r.case_type_label },
  { key: "service", label: "Service", render: (r) => r.service },
  { key: "sex", label: "Gender", render: (r) => ({ F: "Female", M: "Male" }[r.patient.sex] || r.patient.sex || "") },
  { key: "age", label: "Age", render: (r) => r.patient.age },
  { key: "mrn", label: "MRN", render: (r) => r.patient.mrn },
  { key: "visit", label: "Visit ID", render: (r) => r.visit?.visit_number || "" },
  { key: "pacu", label: "PACU In", render: (r) => clock(r.times.pacu_start) },
];

/** The Case List: one row per case for the day, with the actions that work on the selected case. */
export default function CaseListTab({ rows, rooms, canEdit, selectedId, onSelect, onOpen, onEdit, onNew, onMove }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [room, setRoom] = useState("");

  const shown = useMemo(
    () =>
      rows.filter(
        (r) => matchesSearch(r, search) && (!status || r.status === status) && (!room || String(r.room?.id || "none") === room)
      ),
    [rows, search, status, room]
  );
  const selected = rows.find((r) => r.id === selectedId) || null;

  return (
    <Box>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1.5 }}>
        {canEdit && (
          <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
            New Case
          </Button>
        )}
        <Button variant="outlined" startIcon={<OpenInNewIcon />} disabled={!selected} onClick={() => selected && onOpen(selected.id)}>
          Open Case Details
        </Button>
        {canEdit && onEdit && (
          <Button variant="outlined" disabled={!selected} onClick={() => selected && onEdit(selected.id)}>
            Modify Case
          </Button>
        )}
        {canEdit &&
          selected &&
          selected.next_statuses.map((next) => (
            <Button key={next} variant="outlined" color={next === "cancelled" ? "error" : "primary"} onClick={() => onMove(selected, next)}>
              {ACTION_LABELS[next] || STATUS_META[next]?.label}
            </Button>
          ))}
        <Box sx={{ flex: 1 }} />
        <TextField size="small" label="Search" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ width: 200 }} />
        <TextField size="small" select label="Status" value={status} onChange={(e) => setStatus(e.target.value)} sx={{ width: 190 }}>
          <MenuItem value="">All</MenuItem>
          {LEGEND_ORDER.map((s) => (
            <MenuItem key={s} value={s}>
              {STATUS_META[s].label}
            </MenuItem>
          ))}
        </TextField>
        <TextField size="small" select label="Room" value={room} onChange={(e) => setRoom(e.target.value)} sx={{ width: 140 }}>
          <MenuItem value="">All</MenuItem>
          {rooms.map((r) => (
            <MenuItem key={r.id} value={String(r.id)}>
              {r.name}
            </MenuItem>
          ))}
          <MenuItem value="none">Unassigned</MenuItem>
        </TextField>
      </Stack>

      <Paper variant="outlined">
        <TableContainer sx={{ maxHeight: "calc(100vh - 290px)" }}>
          <Table size="small" stickyHeader aria-label="Surgery case list">
            <TableHead>
              <TableRow>
                {COLUMNS.map((c) => (
                  <TableCell key={c.key} sx={{ whiteSpace: "nowrap" }}>
                    {c.label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {shown.map((r) => {
                const isSelected = r.id === selectedId;
                const meta = STATUS_META[r.status];
                return (
                  <TableRow
                    key={r.id}
                    hover
                    selected={isSelected}
                    onClick={() => onSelect(r.id)}
                    onDoubleClick={() => onOpen(r.id)}
                    sx={{ cursor: "pointer", boxShadow: `inset 4px 0 0 ${meta.border}` }}
                  >
                    {COLUMNS.map((c) => (
                      <TableCell key={c.key} sx={{ whiteSpace: c.wide ? "normal" : "nowrap", minWidth: c.wide ? 240 : undefined }}>
                        {c.render(r)}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })}
              {shown.length === 0 && (
                <TableRow>
                  <TableCell colSpan={COLUMNS.length}>
                    <Typography color="text.secondary" sx={{ py: 2, textAlign: "center" }}>
                      {rows.length === 0 ? "No cases booked for this day." : "No cases match these filters."}
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: "block" }}>
        {selected ? "1" : "0"} of {shown.length} cases selected
      </Typography>
    </Box>
  );
}
