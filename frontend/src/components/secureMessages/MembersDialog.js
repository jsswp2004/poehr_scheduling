import { useEffect, useState } from "react";
import { Alert, Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, List, ListItem, ListItemText, TextField } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { secure, errorText } from "./secureApi";

export default function MembersDialog({ open, thread, meId, onClose, onChanged }) {
  const [options, setOptions] = useState([]);
  const [picked, setPicked] = useState(null);
  const [error, setError] = useState("");
  const members = (thread && thread.members) || [];
  const iOwn = members.some((m) => m.id === meId && m.owner);
  const canAdd = thread && thread.kind !== "direct";

  useEffect(() => {
    if (!open || !canAdd) return;
    secure
      .people("", true)
      .then((d) => setOptions((d.people || []).filter((p) => !members.some((m) => m.id === p.id))))
      .catch(() => setOptions([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, canAdd, members.length]);

  const add = async () => {
    if (!picked) return;
    try {
      await secure.addMember(thread.id, picked.id);
      setPicked(null);
      setError("");
      onChanged();
    } catch (err) {
      setError(errorText(err, "Could not add that person."));
    }
  };
  const remove = async (id) => {
    try {
      await secure.removeMember(thread.id, id);
      setError("");
      onChanged(id === meId);
    } catch (err) {
      setError(errorText(err, "Could not remove that person."));
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>People in this conversation</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}
        <List dense data-testid="member-list">
          {members.map((m) => (
            <ListItem
              key={m.id}
              secondaryAction={
                thread.kind !== "direct" && (iOwn || m.id === meId) ? (
                  <IconButton edge="end" aria-label={m.id === meId ? "Leave" : `Remove ${m.name}`} onClick={() => remove(m.id)}>
                    <CloseIcon fontSize="small" />
                  </IconButton>
                ) : null
              }
            >
              <ListItemText primary={m.id === meId ? `${m.name} (you)` : m.name} secondary={m.owner ? `${m.role} · owner` : m.role} />
            </ListItem>
          ))}
        </List>
        {canAdd && (
          <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
            <Autocomplete
              fullWidth
              size="small"
              options={options}
              value={picked}
              onChange={(_, v) => setPicked(v)}
              getOptionLabel={(o) => `${o.name} (${o.role})`}
              renderInput={(p) => <TextField {...p} label="Add a person" />}
            />
            <Button variant="contained" onClick={add} disabled={!picked}>
              Add
            </Button>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
