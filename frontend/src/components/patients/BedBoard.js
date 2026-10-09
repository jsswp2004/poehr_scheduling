import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import ExitToAppIcon from "@mui/icons-material/ExitToApp";
import ManageAccountsIcon from "@mui/icons-material/ManageAccounts";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import BlockIcon from "@mui/icons-material/Block";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "../patientHeader/headerApi";

const COLORS = {
  available: { bg: "#e8f5e9", border: "#66bb6a", label: "Available" },
  occupied: { bg: "#e3f2fd", border: "#42a5f5", label: "Occupied" },
  cleaning: { bg: "#fff8e1", border: "#ffb300", label: "Cleaning" },
  blocked: { bg: "#ffebee", border: "#ef5350", label: "Blocked" },
};

const FRONT_LINE = ["doctor", "nurse", "registrar", "admin", "system_admin"];

/**
 * Who is in which bed on the inpatient units, with the actions staff need on the spot:
 * move or discharge the patient, change the attending, mark the bed for cleaning, block it, or free it again.
 * `refreshKey` reloads the board after something changes elsewhere on the page.
 */
export default function BedBoard({ userRole, refreshKey = 0, onOpenPatient, onTransfer, onDischarge, onChangeAttending }) {
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState("");
  const [blocking, setBlocking] = useState(null); // bed being blocked
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const canAct = FRONT_LINE.includes(userRole);

  const load = useCallback(async () => {
    try {
      const headers = await authHeader();
      const res = await api.get(`${apiEndpoints.locationTree}?active=1`, { headers });
      setData(res.data?.locations || []);
      setProblem("");
    } catch (err) {
      setProblem(errorText(err, "Could not load the beds."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const setHold = async (bed, hold, holdReason = "") => {
    setBusy(true);
    try {
      const headers = await authHeader();
      await api.post(apiEndpoints.bedHold(bed.id), { hold, hold_reason: holdReason }, { headers });
      toast.success(hold === "" ? `Bed ${bed.name} is ready` : hold === "cleaning" ? `Bed ${bed.name} marked for cleaning` : `Bed ${bed.name} blocked`);
      await load();
      return true;
    } catch (err) {
      toast.error(errorText(err, "That did not work."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  if (!data && !problem) return <CircularProgress aria-label="Loading beds" sx={{ m: 3 }} />;

  // inpatient units only
  const units = (data || []).flatMap((f) => f.units.filter((u) => u.care_type === "inpatient").map((u) => ({ ...u, facility: f })));

  const patientFor = (bed, unit, room) => ({
    id: bed.patient,
    user_id: bed.patient_user_id,
    full_name: bed.occupant,
    current_visit: {
      id: bed.registration,
      visit_number: bed.visit_number,
      care_setting: "acute",
      location: [unit.facility.name, unit.name, room.name, bed.name].join(" › "),
      discharge_datetime: null,
      attending_provider: bed.attending_provider || null,
      attending_provider_name: bed.attending_provider_name || "",
    },
  });

  const act = (label, icon, onClick, color) => (
    <Tooltip title={label}>
      <span>
        <IconButton size="small" aria-label={label} disabled={busy} onClick={onClick} sx={{ color }}>
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );

  return (
    <Box sx={{ p: 2 }} data-testid="bed-board">
      {problem && <Alert severity="error" sx={{ mb: 2 }}>{problem}</Alert>}
      {data && units.length === 0 && (
        <Typography color="text.secondary" data-testid="no-board-units">
          There are no inpatient units yet. An admin can add them in the Location Manager.
        </Typography>
      )}
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {Object.entries(COLORS).map(([key, c]) => (
          <Chip key={key} size="small" label={c.label} sx={{ bgcolor: c.bg, border: `1px solid ${c.border}` }} />
        ))}
      </Stack>
      <Stack spacing={2}>
        {units.map((u) => (
          <Paper key={u.id} variant="outlined" sx={{ p: 2 }} data-testid={`board-unit-${u.id}`}>
            <Stack direction="row" spacing={1} alignItems="baseline" sx={{ mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{u.name}</Typography>
              <Typography variant="body2" color="text.secondary">{u.facility.name}</Typography>
              <Chip size="small" label={`${u.occupied_count} of ${u.bed_count} occupied`} data-testid={`board-count-${u.id}`} />
            </Stack>
            {u.rooms.length === 0 && <Typography variant="body2" color="text.secondary">No rooms yet.</Typography>}
            {u.rooms.map((r) => (
              <Box key={r.id} sx={{ mb: 1.5 }}>
                <Typography variant="caption" color="text.secondary">Room {r.name}</Typography>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 0.5 }}>
                  {r.beds.map((b) => {
                    const c = COLORS[b.status] || COLORS.available;
                    return (
                      <Box
                        key={b.id}
                        data-testid={`board-bed-${b.id}`}
                        sx={{ width: 200, p: 1, borderRadius: 1, bgcolor: c.bg, border: `1px solid ${c.border}` }}
                      >
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>Bed {b.name}</Typography>
                          <Typography variant="caption">{c.label}</Typography>
                        </Stack>
                        {b.status === "occupied" ? (
                          <>
                            <Typography
                              variant="body2"
                              sx={{ cursor: onOpenPatient ? "pointer" : "default", textDecoration: onOpenPatient ? "underline" : "none" }}
                              onClick={() => onOpenPatient && onOpenPatient(patientFor(b, u, r))}
                            >
                              {b.occupant}
                            </Typography>
                            <Typography variant="caption" color="text.secondary" display="block" noWrap data-testid={`board-attending-${b.id}`}>
                              {b.attending_provider_name || "No attending set"}
                            </Typography>
                          </>
                        ) : (
                          <Typography variant="body2" color="text.secondary" sx={{ minHeight: 20 }}>
                            {b.hold_reason || " "}
                          </Typography>
                        )}
                        {canAct && (
                          <Box sx={{ display: "flex", gap: 0.5, mt: 0.5 }}>
                            {b.status === "occupied" && (
                              <>
                                {onChangeAttending && act(`Attending for ${b.occupant}`, <ManageAccountsIcon fontSize="small" />, () => onChangeAttending(patientFor(b, u, r)), "#6a1b9a")}
                                {onTransfer && act(`Transfer ${b.occupant}`, <SwapHorizIcon fontSize="small" />, () => onTransfer(patientFor(b, u, r)), "#0277bd")}
                                {onDischarge && act(`Discharge ${b.occupant}`, <ExitToAppIcon fontSize="small" />, () => onDischarge(patientFor(b, u, r)), "#ef6c00")}
                              </>
                            )}
                            {b.status === "available" && (
                              <>
                                {act(`Mark bed ${b.name} for cleaning`, <CleaningServicesIcon fontSize="small" />, () => setHold(b, "cleaning"), "#f9a825")}
                                {act(`Block bed ${b.name}`, <BlockIcon fontSize="small" />, () => { setReason(""); setBlocking(b); }, "#c62828")}
                              </>
                            )}
                            {(b.status === "cleaning" || b.status === "blocked") &&
                              act(`Make bed ${b.name} available`, <CheckCircleOutlineIcon fontSize="small" />, () => setHold(b, ""), "#2e7d32")}
                          </Box>
                        )}
                      </Box>
                    );
                  })}
                </Box>
              </Box>
            ))}
          </Paper>
        ))}
      </Stack>

      <Dialog open={!!blocking} onClose={() => setBlocking(null)} fullWidth maxWidth="xs">
        <DialogTitle>Block bed {blocking?.name}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            size="small"
            margin="dense"
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            inputProps={{ maxLength: 200 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setBlocking(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            disabled={busy}
            onClick={async () => {
              if (await setHold(blocking, "blocked", reason)) setBlocking(null);
            }}
          >
            Block
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
