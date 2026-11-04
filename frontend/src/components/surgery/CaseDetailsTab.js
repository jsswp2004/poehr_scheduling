import { useCallback, useEffect, useState } from "react";
import { Alert, Box, Button, Paper, Stack, Tab, Tabs, Typography } from "@mui/material";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";
import StatusChip from "./StatusChip";
import CaseHeaderPanel from "./CaseHeaderPanel";
import IntraOpPanel from "./IntraOpPanel";
import CaseUsagePanel from "./CaseUsagePanel";
import CardNotesPanel from "./CardNotesPanel";
import ChargesPanel from "./ChargesPanel";
import DocumentsPanel from "./DocumentsPanel";
import CloseCaseDialog, { CLOSING } from "./CloseCaseDialog";
import HistoryDialog from "./HistoryDialog";
import VisitLinkDialog from "./VisitLinkDialog";
import { displayName, usDateTime } from "./surgeryUtils";

/**
 * Surgery Case Details: one case opened from the Case List or the Day Planner.
 * Sub-tabs: case header, pre-op, intra-op, case usage, post-op, charges and documents.
 */
export default function CaseDetailsTab({ caseId, canEdit, rooms, onEditBooking, onChanged }) {
  const [row, setRow] = useState(null);
  const [lookups, setLookups] = useState(null);
  const [problem, setProblem] = useState("");
  const [sub, setSub] = useState("header");
  const [closing, setClosing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [linking, setLinking] = useState(false);

  const load = useCallback(async () => {
    try {
      setRow(await surgeryApi.getCase(caseId));
      setProblem("");
    } catch (err) {
      setProblem(errorText(err, "Could not open this case."));
    }
  }, [caseId]);

  useEffect(() => {
    setRow(null);
    load();
  }, [load]);

  useEffect(() => {
    surgeryApi.lookups().then(setLookups).catch(() => setLookups(null));
  }, []);

  const saved = (updated) => {
    setRow(updated);
    onChanged?.(updated);
  };

  if (problem) return <Alert severity="error">{problem}</Alert>;
  if (!row) return null;

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 1.5, mb: 1.5, background: "rgba(14,165,233,0.06)" }}>
        <Stack direction="row" spacing={3} flexWrap="wrap" useFlexGap alignItems="center">
          <Box>
            <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
              {displayName(row.patient.name)}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              MRN {row.patient.mrn}
              {row.visit ? ` · Visit ${row.visit.visit_number}` : ""} · {row.patient.age} {row.patient.sex}
            </Typography>
          </Box>
          <Typography variant="body2">Case ID: {row.case_number}</Typography>
          <StatusChip status={row.status} label={row.status_label} />
          <Typography variant="body2">{row.room?.name || "No room"}</Typography>
          <Typography variant="body2" sx={{ flex: 1, minWidth: 220 }}>
            {row.procedures_text}
          </Typography>
          <Typography variant="body2">{row.surgeon?.name}</Typography>
          {canEdit && row.next_statuses.some((x) => CLOSING.includes(x)) && (
            <Button size="small" variant="outlined" onClick={() => setClosing(true)}>
              Close Case
            </Button>
          )}
          {canEdit && row.next_statuses.length > 0 && (
            <Button size="small" onClick={() => setLinking(true)}>
              Link Visit
            </Button>
          )}
          <Button size="small" onClick={() => setShowHistory(true)}>
            Modification History
          </Button>
          <Typography variant="body2">
            {row.header.actual_start ? `Actual: ${usDateTime(row.header.actual_start)}` : `Scheduled: ${usDateTime(row.scheduled_start)}`}
          </Typography>
        </Stack>
      </Paper>

      <Tabs value={sub} onChange={(_, v) => setSub(v)} sx={{ mb: 1.5, minHeight: 36 }} aria-label="Case details sections">
        <Tab value="header" label="Case Header" sx={{ minHeight: 36 }} />
        <Tab value="preop" label="Pre-op" sx={{ minHeight: 36 }} />
        <Tab value="intraop" label="Intra-op" sx={{ minHeight: 36 }} />
        <Tab value="usage" label="Case Usage" sx={{ minHeight: 36 }} />
        <Tab value="postop" label="Post-op" sx={{ minHeight: 36 }} />
        <Tab value="charges" label="Charges" sx={{ minHeight: 36 }} />
        <Tab value="documents" label="Documents" sx={{ minHeight: 36 }} />
      </Tabs>

      {sub === "header" && (
        <CaseHeaderPanel row={row} lookups={lookups} rooms={rooms} canEdit={canEdit} onSaved={saved} onEditBooking={onEditBooking} />
      )}
      {sub === "preop" && <CardNotesPanel caseId={row.id} kind="pre" />}
      {sub === "intraop" && <IntraOpPanel row={row} lookups={lookups} canEdit={canEdit} onSaved={saved} />}
      {sub === "usage" && <CaseUsagePanel caseId={row.id} lookups={lookups} editable={canEdit && row.next_statuses.length > 0} />}
      {sub === "postop" && <CardNotesPanel caseId={row.id} kind="post" />}
      {sub === "charges" && <ChargesPanel caseId={row.id} canEdit={canEdit} started={row.status !== "pending" && row.status !== "cancelled"} />}
      {sub === "documents" && <DocumentsPanel caseId={row.id} lookups={lookups} canEdit={canEdit} />}
      <CloseCaseDialog open={closing} row={row} onClose={() => setClosing(false)} onClosed={saved} />
      <VisitLinkDialog open={linking} caseId={row.id} onClose={() => setLinking(false)} onLinked={saved} />
      <HistoryDialog open={showHistory} caseId={row.id} onClose={() => setShowHistory(false)} />
    </Box>
  );
}
