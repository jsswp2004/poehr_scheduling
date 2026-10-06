import { useState, useEffect, useCallback } from "react";
import {
  Box,
  Typography,
  Paper,
  Stack,
  Chip,
  IconButton,
  Tooltip,
  Button,
  Collapse,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  CircularProgress,
  Alert,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";
import ApartmentIcon from "@mui/icons-material/Apartment";
import MeetingRoomIcon from "@mui/icons-material/MeetingRoom";
import HotelIcon from "@mui/icons-material/Hotel";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { toast } from "../SimpleToast";
import { authHeader, errorText } from "../patientHeader/headerApi";

const KIND_OPTIONS = [
  { value: "hospital", label: "Hospital" },
  { value: "clinic", label: "Clinic" },
  { value: "other", label: "Other" },
];
const CARE_TYPES = [
  { value: "outpatient", label: "Outpatient" },
  { value: "inpatient", label: "Inpatient" },
  { value: "emergency", label: "Emergency" },
];
const BED_STATUS_COLOR = {
  available: "success",
  occupied: "primary",
  blocked: "warning",
  cleaning: "warning",
  inactive: "default",
};
const WHAT = { facilities: "location", units: "unit", rooms: "room", beds: "bed" };

const splitNames = (text) =>
  String(text || "")
    .split(/[\n,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

function NodeRow({ depth, icon, title, chips, expandable, expanded, onToggle, actions, dim, testId }) {
  return (
    <Box
      data-testid={testId}
      sx={{
        display: "flex",
        alignItems: "center",
        pl: depth * 3,
        py: 0.5,
        borderBottom: "1px solid",
        borderColor: "divider",
        opacity: dim ? 0.55 : 1,
      }}
    >
      <Box sx={{ width: 28 }}>
        {expandable && (
          <IconButton size="small" onClick={onToggle} aria-label={expanded ? `Collapse ${title}` : `Expand ${title}`}>
            {expanded ? <ExpandMoreIcon fontSize="small" /> : <ChevronRightIcon fontSize="small" />}
          </IconButton>
        )}
      </Box>
      <Box sx={{ mr: 1, display: "flex", color: "text.secondary" }}>{icon}</Box>
      <Typography sx={{ fontWeight: depth < 2 ? 600 : 500, mr: 1 }}>{title}</Typography>
      <Stack direction="row" spacing={0.5} sx={{ flex: 1, flexWrap: "wrap", rowGap: 0.5 }}>
        {chips}
      </Stack>
      <Stack direction="row" spacing={0}>
        {actions}
      </Stack>
    </Box>
  );
}

/**
 * Location Manager: build the tree of locations (hospital or clinic) > units > rooms > beds.
 * The care type (Outpatient / Inpatient / Emergency) is set on each unit. Registration and
 * Scheduling pick from this tree. Anyone on the staff can look; admins change it.
 */
function LocationManager() {
  const [data, setData] = useState(null);
  const [problem, setProblem] = useState("");
  const [open, setOpen] = useState({});
  const [dialog, setDialog] = useState(null); // { mode: "add" | "edit", kind, parent, node }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const headers = await authHeader();
      const res = await api.get(apiEndpoints.locationTree, { headers });
      setData(res.data);
      setProblem("");
    } catch (err) {
      setProblem(errorText(err, "Could not load the locations."));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const canEdit = !!data?.can_edit;
  const toggle = (key) => setOpen((o) => ({ ...o, [key]: !o[key] }));
  const expand = (key) => setOpen((o) => ({ ...o, [key]: true }));

  const send = async (method, url, body, ok) => {
    setBusy(true);
    try {
      const headers = await authHeader();
      await api({ method, url, data: body, headers });
      if (ok) toast.success(ok);
      await load();
      return true;
    } catch (err) {
      toast.error(errorText(err, "That did not work."));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const flip = (kind, node) =>
    send("patch", apiEndpoints.locationItem(kind, node.id), { is_active: !node.is_active }, node.is_active ? "Switched off" : "Switched on");

  const remove = async (kind, node) => {
    if (!window.confirm(`Delete ${WHAT[kind]} "${node.name}"? This cannot be undone.`)) return;
    await send("delete", apiEndpoints.locationItem(kind, node.id), undefined, "Deleted");
  };

  const iconBtn = (label, onClick, icon, extra = {}) => (
    <Tooltip title={label}>
      <span>
        <IconButton size="small" aria-label={label} onClick={onClick} disabled={busy} {...extra}>
          {icon}
        </IconButton>
      </span>
    </Tooltip>
  );

  const nodeActions = (kind, node, parentForAdd, addLabel, addKind) => (
    <>
      {canEdit && addKind && iconBtn(addLabel, () => setDialog({ mode: "add", kind: addKind, parent: node }), <AddIcon fontSize="small" />)}
      {canEdit && iconBtn(`Edit ${node.name}`, () => setDialog({ mode: "edit", kind, node, parent: parentForAdd }), <EditIcon fontSize="small" />)}
      {canEdit &&
        iconBtn(
          node.is_active ? `Switch off ${node.name}` : `Switch on ${node.name}`,
          () => flip(kind, node),
          <PowerSettingsNewIcon fontSize="small" color={node.is_active ? "success" : "disabled"} />
        )}
      {canEdit && iconBtn(`Delete ${node.name}`, () => remove(kind, node), <DeleteIcon fontSize="small" />)}
    </>
  );

  if (!data && !problem) return <CircularProgress aria-label="Loading locations" />;

  return (
    <Box>
      {problem && <Alert severity="error" sx={{ mb: 2 }}>{problem}</Alert>}
      {data && !canEdit && (
        <Alert severity="info" sx={{ mb: 2 }}>
          Only an administrator can change locations. You can look at them here.
        </Alert>
      )}
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary">
          Build each hospital or clinic, then its units, rooms and beds. The care type is set on each unit.
        </Typography>
        {canEdit && (
          <Button variant="contained" size="small" startIcon={<AddIcon />} onClick={() => setDialog({ mode: "add", kind: "facilities" })} disabled={busy}>
            Add location
          </Button>
        )}
      </Stack>

      <Paper variant="outlined">
        {data && data.locations.length === 0 && (
          <Typography sx={{ p: 3 }} color="text.secondary">
            No locations yet.{canEdit ? " Add your first hospital or clinic to get started." : ""}
          </Typography>
        )}
        {data?.locations.map((f) => {
          const fKey = `f${f.id}`;
          return (
            <Box key={fKey}>
              <NodeRow
                testId={`node-${fKey}`}
                depth={0}
                icon={<LocalHospitalIcon fontSize="small" />}
                title={f.name}
                dim={!f.is_active}
                expandable={f.units.length > 0}
                expanded={!!open[fKey]}
                onToggle={() => toggle(fKey)}
                chips={
                  <>
                    <Chip size="small" label={KIND_OPTIONS.find((k) => k.value === f.kind)?.label || f.kind} />
                    {f.code && <Chip size="small" variant="outlined" label={f.code} />}
                    {!f.is_active && <Chip size="small" label="Off" />}
                  </>
                }
                actions={nodeActions("facilities", f, null, `Add unit to ${f.name}`, "units")}
              />
              <Collapse in={!!open[fKey]} unmountOnExit>
                {f.units.map((u) => {
                  const uKey = `u${u.id}`;
                  return (
                    <Box key={uKey}>
                      <NodeRow
                        testId={`node-${uKey}`}
                        depth={1}
                        icon={<ApartmentIcon fontSize="small" />}
                        title={u.name}
                        dim={!u.is_active}
                        expandable={u.rooms.length > 0}
                        expanded={!!open[uKey]}
                        onToggle={() => toggle(uKey)}
                        chips={
                          <>
                            <Chip size="small" color="primary" variant="outlined" label={CARE_TYPES.find((c) => c.value === u.care_type)?.label || u.care_type} />
                            {u.bed_count > 0 && <Chip size="small" label={`${u.occupied_count}/${u.bed_count} beds in use`} />}
                            {u.code && <Chip size="small" variant="outlined" label={u.code} />}
                            {!u.is_active && <Chip size="small" label="Off" />}
                          </>
                        }
                        actions={nodeActions("units", u, f, `Add rooms to ${u.name}`, "rooms")}
                      />
                      <Collapse in={!!open[uKey]} unmountOnExit>
                        {u.rooms.map((r) => {
                          const rKey = `r${r.id}`;
                          return (
                            <Box key={rKey}>
                              <NodeRow
                                testId={`node-${rKey}`}
                                depth={2}
                                icon={<MeetingRoomIcon fontSize="small" />}
                                title={`Room ${r.name}`}
                                dim={!r.is_active}
                                expandable={r.beds.length > 0}
                                expanded={!!open[rKey]}
                                onToggle={() => toggle(rKey)}
                                chips={
                                  <>
                                    {r.beds.length > 0 && <Chip size="small" label={`${r.beds.length} bed${r.beds.length === 1 ? "" : "s"}`} />}
                                    {!r.is_active && <Chip size="small" label="Off" />}
                                  </>
                                }
                                actions={nodeActions("rooms", r, u, `Add bed to room ${r.name}`, "beds")}
                              />
                              <Collapse in={!!open[rKey]} unmountOnExit>
                                {r.beds.map((b) => (
                                  <NodeRow
                                    key={`b${b.id}`}
                                    testId={`node-b${b.id}`}
                                    depth={3}
                                    icon={<HotelIcon fontSize="small" />}
                                    title={`Bed ${b.name}`}
                                    dim={!b.is_active}
                                    chips={
                                      <>
                                        <Chip size="small" color={BED_STATUS_COLOR[b.status] || "default"} label={b.status} data-testid={`bed-status-${b.id}`} />
                                        {b.occupant && <Chip size="small" variant="outlined" label={b.occupant} />}
                                        {b.hold_reason && <Chip size="small" variant="outlined" label={b.hold_reason} />}
                                      </>
                                    }
                                    actions={nodeActions("beds", b, r, null, null)}
                                  />
                                ))}
                              </Collapse>
                            </Box>
                          );
                        })}
                      </Collapse>
                    </Box>
                  );
                })}
              </Collapse>
            </Box>
          );
        })}
      </Paper>

      {dialog && (
        <NodeDialog
          dialog={dialog}
          busy={busy}
          onClose={() => setDialog(null)}
          onSave={async (method, url, body, ok) => {
            const done = await send(method, url, body, ok);
            if (done) {
              if (dialog.parent) {
                const k = dialog.kind === "units" ? `f${dialog.parent.id}` : dialog.kind === "rooms" ? `u${dialog.parent.id}` : dialog.kind === "beds" ? `r${dialog.parent.id}` : null;
                if (k && dialog.mode === "add") expand(k);
                if (dialog.kind === "rooms" && dialog.mode === "add") {
                  // open the unit's own parent too, so the new rooms are visible
                }
              }
              setDialog(null);
            }
          }}
        />
      )}
    </Box>
  );
}

function NodeDialog({ dialog, busy, onClose, onSave }) {
  const { mode, kind, parent, node } = dialog;
  const editing = mode === "edit";
  const [name, setName] = useState(node?.name || "");
  const [code, setCode] = useState(node?.code || "");
  const [facilityKind, setFacilityKind] = useState(node?.kind || "hospital");
  const [careType, setCareType] = useState(node?.care_type || "outpatient");
  const [roomNames, setRoomNames] = useState("");
  const [bedNames, setBedNames] = useState("");
  const [hold, setHold] = useState(node?.hold || "");
  const [holdReason, setHoldReason] = useState(node?.hold_reason || "");
  const [error, setError] = useState("");

  const what = WHAT[kind];
  const title = `${editing ? "Edit" : "Add"} ${what}${!editing && parent ? ` in ${parent.name}` : ""}`;

  const submit = () => {
    setError("");
    if (kind === "rooms" && !editing) {
      const names = splitNames(roomNames);
      if (names.length === 0) return setError("Type at least one room name.");
      return onSave("post", apiEndpoints.locationItems("rooms"), { unit: parent.id, names, bed_names: splitNames(bedNames) }, `Added ${names.length} room${names.length === 1 ? "" : "s"}`);
    }
    if (!name.trim()) return setError(`Give the ${what} a name.`);
    const body = { name: name.trim() };
    if (kind === "facilities") {
      body.kind = facilityKind;
      body.code = code;
    }
    if (kind === "units") {
      body.care_type = careType;
      body.code = code;
    }
    if (kind === "beds" && editing) {
      body.hold = hold;
      body.hold_reason = hold ? holdReason : "";
    }
    if (editing) return onSave("patch", apiEndpoints.locationItem(kind, node.id), body, "Saved");
    if (kind === "units") body.facility = parent.id;
    if (kind === "beds") body.room = parent.id;
    return onSave("post", apiEndpoints.locationItems(kind), body, `Added ${what}`);
  };

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>{title}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {kind === "rooms" && !editing ? (
            <>
              <TextField
                label="Room names"
                helperText="One or more, separated by commas or new lines, for example 301, 302, 303"
                value={roomNames}
                onChange={(e) => setRoomNames(e.target.value)}
                multiline
                minRows={2}
                autoFocus
                fullWidth
              />
              <TextField
                label="Beds in each room (optional)"
                helperText="For example A, B. Every new room gets these beds."
                value={bedNames}
                onChange={(e) => setBedNames(e.target.value)}
                fullWidth
              />
            </>
          ) : (
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus fullWidth inputProps={{ maxLength: kind === "rooms" || kind === "beds" ? 60 : 120 }} />
          )}
          {kind === "facilities" && (
            <>
              <TextField select label="Kind" value={facilityKind} onChange={(e) => setFacilityKind(e.target.value)} fullWidth>
                {KIND_OPTIONS.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} fullWidth inputProps={{ maxLength: 20 }} />
            </>
          )}
          {kind === "units" && (
            <>
              <TextField select label="Type" value={careType} onChange={(e) => setCareType(e.target.value)} fullWidth helperText="Decides whether patients here are Ambulatory, Acute or Emergency Care.">
                {CARE_TYPES.map((o) => (
                  <MenuItem key={o.value} value={o.value}>
                    {o.label}
                  </MenuItem>
                ))}
              </TextField>
              <TextField label="Code (optional)" value={code} onChange={(e) => setCode(e.target.value)} fullWidth inputProps={{ maxLength: 20 }} />
            </>
          )}
          {kind === "beds" && editing && (
            <>
              <TextField select label="Bed hold" value={hold} onChange={(e) => setHold(e.target.value)} fullWidth helperText="Occupied is automatic. Block or mark cleaning only when needed.">
                <MenuItem value="">None</MenuItem>
                <MenuItem value="blocked">Blocked</MenuItem>
                <MenuItem value="cleaning">Cleaning</MenuItem>
              </TextField>
              {hold && <TextField label="Reason (optional)" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} fullWidth inputProps={{ maxLength: 200 }} />}
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={busy}>
          {editing ? "Save" : "Add"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export default LocationManager;
