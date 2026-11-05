import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, MenuItem, Stack, Switch, TextField, Typography } from "@mui/material";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";

/**
 * Administrators set up operating rooms here. Rooms live in Location Manager (in an operating-room unit):
 * pick one that already exists there, or type a new name and it is built for you.
 */
export default function RoomsDialog({ open, facilityId, onClose, onChanged }) {
  const [rooms, setRooms] = useState([]);
  const [options, setOptions] = useState([]);
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");

  const load = useCallback(async () => {
    try {
      const [list, free] = await Promise.all([
        surgeryApi.rooms({ facility: facilityId, all: 1 }),
        surgeryApi.roomOptions({ facility: facilityId }),
      ]);
      setRooms(list);
      setOptions(free || []);
      setProblem("");
    } catch (err) {
      setProblem(errorText(err, "Could not load the rooms."));
    }
  }, [facilityId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const added = async (message) => {
    toast.success(message);
    await load();
    onChanged();
  };

  const add = async () => {
    if (!name.trim()) return;
    try {
      await surgeryApi.addRoom({ facility: facilityId, name: name.trim() });
      setName("");
      await added("Room added");
    } catch (err) {
      setProblem(errorText(err, "The room was not added."));
    }
  };

  const use = async () => {
    if (!pick) return;
    try {
      await surgeryApi.addRoom({ location_room: Number(pick) });
      setPick("");
      await added("Room added");
    } catch (err) {
      setProblem(errorText(err, "The room was not added."));
    }
  };

  const toggle = async (room) => {
    try {
      await surgeryApi.updateRoom(room.id, { is_active: !room.is_active });
      await load();
      onChanged();
    } catch (err) {
      setProblem(errorText(err, "The room was not changed."));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Manage Rooms</DialogTitle>
      <DialogContent dividers>
        {problem && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {problem}
          </Alert>
        )}
        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Operating rooms are kept in Location Manager. Renaming or switching a room off there changes it here too.
        </Typography>
        {options.length > 0 && (
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <TextField size="small" select label="Room from Location Manager" value={pick} onChange={(e) => setPick(e.target.value)} fullWidth>
              {options.map((o) => (
                <MenuItem key={o.id} value={String(o.id)}>
                  {o.unit} › {o.name}
                </MenuItem>
              ))}
            </TextField>
            <Button variant="outlined" onClick={use} disabled={!pick}>
              Use
            </Button>
          </Stack>
        )}
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField size="small" label="New room" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} fullWidth />
          <Button variant="contained" onClick={add} disabled={!name.trim()}>
            Add
          </Button>
        </Stack>
        {rooms.length === 0 && <Typography color="text.secondary">No rooms yet.</Typography>}
        {rooms.map((r) => (
          <FormControlLabel
            key={r.id}
            sx={{ display: "flex" }}
            control={<Switch checked={r.is_active} onChange={() => toggle(r)} />}
            label={`${r.name}${r.unit ? ` (${r.unit})` : ""}${r.is_active ? "" : " (not in use)"}`}
          />
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
