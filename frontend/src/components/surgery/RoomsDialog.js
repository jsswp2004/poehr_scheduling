import { useCallback, useEffect, useState } from "react";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Stack, Switch, TextField, Typography } from "@mui/material";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";

/** Administrators add operating rooms here and retire the ones no longer used. */
export default function RoomsDialog({ open, facilityId, onClose, onChanged }) {
  const [rooms, setRooms] = useState([]);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState("");

  const load = useCallback(async () => {
    try {
      setRooms(await surgeryApi.rooms({ facility: facilityId, all: 1 }));
      setProblem("");
    } catch (err) {
      setProblem(errorText(err, "Could not load the rooms."));
    }
  }, [facilityId]);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const add = async () => {
    if (!name.trim()) return;
    try {
      await surgeryApi.addRoom({ facility: facilityId, name: name.trim() });
      setName("");
      toast.success("Room added");
      await load();
      onChanged();
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
        <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
          <TextField size="small" label="New room" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} fullWidth />
          <Button variant="contained" onClick={add} disabled={!name.trim()}>
            Add
          </Button>
        </Stack>
        {rooms.length === 0 && <Typography color="text.secondary">No rooms yet.</Typography>}
        {rooms.map((r) => (
          <FormControlLabel key={r.id} sx={{ display: "flex" }} control={<Switch checked={r.is_active} onChange={() => toggle(r)} />} label={`${r.name}${r.is_active ? "" : " (not in use)"}`} />
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
