import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Alert, Box, Button, Container, IconButton, MenuItem, Stack, Tab, Tabs, TextField, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import RefreshIcon from "@mui/icons-material/Refresh";
import { toast } from "../components/SimpleToast";
import { errorText } from "../components/patientHeader/headerApi";
import { surgeryApi } from "../components/surgery/surgeryApi";
import CaseListTab from "../components/surgery/CaseListTab";
import DayPlannerTab from "../components/surgery/DayPlannerTab";
import StatusBoardTab from "../components/surgery/StatusBoardTab";
import CaseDetailsTab from "../components/surgery/CaseDetailsTab";
import BayDialog from "../components/surgery/BayDialog";
import CaseDialog from "../components/surgery/CaseDialog";
import RoomsDialog from "../components/surgery/RoomsDialog";
import SetupDialog from "../components/surgery/SetupDialog";
import { shiftDay, todayISO, usDate } from "../components/surgery/surgeryUtils";

const ALLOWED_ROLES = ["doctor", "nurse", "registrar", "admin", "system_admin"];
const ADMIN_ROLES = ["admin", "system_admin"];
const DEFAULT_REFRESH_MS = 30000;

/**
 * Surgical Care: the Case List and the Day Planner for one day at one facility.
 * Both tabs read the same day, so a status change shows in each at once.
 */
function SurgeryPage() {
  const navigate = useNavigate();
  const [role, setRole] = useState("");
  const [tab, setTab] = useState("list");
  const [date, setDate] = useState(todayISO());
  const [facility, setFacility] = useState("");
  const [planner, setPlanner] = useState(null);
  const [rows, setRows] = useState([]);
  const [problem, setProblem] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detailId, setDetailId] = useState(null); // the case open on the Case Details tab
  const [detailVersion, setDetailVersion] = useState(0);
  const [dialog, setDialog] = useState(null); // { caseId, defaults }
  const [roomsOpen, setRoomsOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [refreshMs, setRefreshMs] = useState(DEFAULT_REFRESH_MS);

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      navigate("/login");
      return;
    }
    try {
      const userRole = jwtDecode(token).role || "";
      if (!ALLOWED_ROLES.includes(userRole)) {
        navigate("/solutions");
        return;
      }
      setRole(userRole);
    } catch (err) {
      navigate("/login");
    }
  }, [navigate]);

  const load = useCallback(async () => {
    try {
      const p = await surgeryApi.planner({ date, facility: facility || undefined });
      const c = await surgeryApi.cases({ date, facility: p.facility });
      setPlanner(p);
      setRows(c.results);
      if (!facility) setFacility(String(p.facility));
      setProblem("");
    } catch (err) {
      setPlanner(null);
      setRows([]);
      setProblem(errorText(err, "Could not load the surgery schedule."));
    }
  }, [date, facility]);

  useEffect(() => {
    if (!role) return undefined;
    load();
    const timer = setInterval(load, refreshMs);
    return () => clearInterval(timer);
  }, [role, load, refreshMs]);

  const canEdit = ALLOWED_ROLES.includes(role);
  const rooms = planner ? planner.rooms.map((r) => ({ id: r.id, name: r.name })) : [];

  const openNew = (defaults = {}) => setDialog({ caseId: null, defaults: { date, ...defaults } });
  const openCase = (id) => setDialog({ caseId: id, defaults: { date } });
  const openDetails = (id) => {
    setSelectedId(id);
    setDetailId(id);
    setTab("details");
  };

  const [bay, setBay] = useState(null); // {row, next}: a PreOp or PACU move waiting for a bed to be chosen
  const [movingBay, setMovingBay] = useState(false);

  const send = async (row, next, bed) => {
    try {
      const updated = bed === undefined ? await surgeryApi.setStatus(row.id, next) : await surgeryApi.setStatus(row.id, next, "", bed);
      toast.success(`Case ${updated.case_number}: ${updated.status_label}`);
      load();
      return true;
    } catch (err) {
      toast.error(errorText(err, "That status change did not work."));
      return false;
    }
  };

  const move = async (row, next) => {
    if (next === "cancelled") {
      openCase(row.id); // a reason is needed, which the case dialog asks for
      return;
    }
    if (next === "preop" || next === "pacu") {
      setBay({ row, next }); // ask which bed first, so the patient's visit moves with the case
      return;
    }
    await send(row, next);
  };

  const confirmBay = async (bed) => {
    setMovingBay(true);
    const ok = await send(bay.row, bay.next, bed);
    setMovingBay(false);
    if (ok) setBay(null); // on a refusal (bed taken meanwhile) the picker stays open with the message toasted
  };

  if (!role) return null;

  return (
    <Container maxWidth={false} sx={{ py: 2 }}>
      <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
        <Typography variant="h5" sx={{ mr: 1 }}>
          Surgical Care
        </Typography>
        <IconButton aria-label="Previous day" onClick={() => setDate((d) => shiftDay(d, -1))}>
          <ChevronLeftIcon />
        </IconButton>
        <TextField size="small" type="date" label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} InputLabelProps={{ shrink: true }} />
        <IconButton aria-label="Next day" onClick={() => setDate((d) => shiftDay(d, 1))}>
          <ChevronRightIcon />
        </IconButton>
        <Button size="small" onClick={() => setDate(todayISO())}>
          Today
        </Button>
        {planner && planner.facilities.length > 1 && (
          <TextField size="small" select label="Facility" value={facility} onChange={(e) => setFacility(e.target.value)} sx={{ minWidth: 200 }}>
            {planner.facilities.map((f) => (
              <MenuItem key={f.id} value={String(f.id)}>
                {f.name}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Box sx={{ flex: 1 }} />
        {ADMIN_ROLES.includes(role) && planner && (
          <Button size="small" variant="outlined" onClick={() => setRoomsOpen(true)}>
            Manage Rooms
          </Button>
        )}
        {ADMIN_ROLES.includes(role) && (
          <Button size="small" variant="outlined" onClick={() => setSetupOpen(true)}>
            Setup
          </Button>
        )}
        <Button size="small" startIcon={<RefreshIcon />} onClick={load}>
          Refresh
        </Button>
      </Stack>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
        {usDate(date)} · {rows.length} {rows.length === 1 ? "case" : "cases"}
      </Typography>

      {problem && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {problem}
        </Alert>
      )}

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 1.5 }}>
        <Tab value="list" label="Case List" />
        <Tab value="planner" label="Day Planner" />
        <Tab value="board" label="Status Board" />
        {detailId && <Tab value="details" label="Case Details" />}
      </Tabs>

      {planner && tab === "list" && (
        <CaseListTab rows={rows} rooms={rooms} canEdit={canEdit} selectedId={selectedId} onSelect={setSelectedId} onOpen={openDetails} onEdit={openCase} onNew={() => openNew()} onMove={move} />
      )}
      {planner && tab === "planner" && <DayPlannerTab planner={planner} selectedId={selectedId} onSelect={setSelectedId} onOpen={openDetails} />}
      {planner && tab === "board" && <StatusBoardTab rows={rows} date={date} refreshMs={refreshMs} onRefreshMsChange={setRefreshMs} onRefresh={load} />}

      {planner && tab === "details" && detailId && (
        <CaseDetailsTab key={`${detailId}-${detailVersion}`} caseId={detailId} canEdit={canEdit} rooms={rooms} onEditBooking={openCase} onChanged={load} />
      )}

      {dialog && planner && (
        <CaseDialog
          open
          caseId={dialog.caseId}
          defaults={dialog.defaults}
          facilityId={planner.facility}
          rooms={rooms}
          canEdit={canEdit}
          onClose={() => setDialog(null)}
          onSaved={(saved) => {
            setSelectedId(saved.id);
            setDetailVersion((v) => v + 1);
            load();
          }}
        />
      )}
      {bay && <BayDialog open caseId={bay.row.id} status={bay.next} busy={movingBay} onClose={() => setBay(null)} onConfirm={confirmBay} />}
      {ADMIN_ROLES.includes(role) && <SetupDialog open={setupOpen} onClose={() => setSetupOpen(false)} />}
      {planner && (
        <RoomsDialog open={roomsOpen} facilityId={planner.facility} onClose={() => setRoomsOpen(false)} onChanged={load} />
      )}
    </Container>
  );
}

export default SurgeryPage;
