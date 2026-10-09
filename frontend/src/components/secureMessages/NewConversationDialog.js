import { useEffect, useState } from "react";
import { Alert, Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, Switch, TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { secure, errorText } from "./secureApi";

export default function NewConversationDialog({ open, isAdmin, onClose, onCreated }) {
  const [mode, setMode] = useState("direct");
  const [all, setAll] = useState(false);
  const [limited, setLimited] = useState(false);
  const [options, setOptions] = useState([]);
  const [picked, setPicked] = useState([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("direct");
    setPicked([]);
    setTitle("");
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    secure
      .people("", all)
      .then((d) => {
        setOptions(d.people || []);
        setLimited(!!d.limited_to_my_facilities);
      })
      .catch((err) => setError(errorText(err, "Could not load colleagues.")));
  }, [open, all]);

  const single = mode === "direct";
  const ready = single ? picked.length === 1 : picked.length >= (mode === "group" ? 1 : 0) && title.trim().length > 0;

  const create = async () => {
    setBusy(true);
    setError("");
    try {
      const body = single ? { kind: "direct", user: picked[0].id } : { kind: mode, title: title.trim(), members: picked.map((p) => p.id) };
      onCreated(await secure.start(body));
    } catch (err) {
      setError(errorText(err, "Could not start the conversation."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>New conversation</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}
        <ToggleButtonGroup
          exclusive
          size="small"
          value={mode}
          onChange={(_, v) => {
            if (v) {
              setMode(v);
              setPicked([]);
            }
          }}
        >
          <ToggleButton value="direct">Direct</ToggleButton>
          <ToggleButton value="group">Group</ToggleButton>
          {isAdmin && <ToggleButton value="channel">Channel</ToggleButton>}
        </ToggleButtonGroup>
        {!single && <TextField label={mode === "channel" ? "Channel name" : "Group name"} value={title} onChange={(e) => setTitle(e.target.value)} inputProps={{ maxLength: 120, "data-testid": "conversation-title" }} />}
        <Autocomplete
          multiple={!single}
          options={options}
          value={single ? picked[0] || null : picked}
          onChange={(_, v) => setPicked(single ? (v ? [v] : []) : v)}
          getOptionLabel={(o) => `${o.name} (${o.role})`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          renderInput={(p) => <TextField {...p} label={single ? "Who do you want to message?" : "People"} />}
        />
        {(limited || all) && (
          <FormControlLabel control={<Switch checked={all} onChange={(e) => setAll(e.target.checked)} />} label="Show everyone in the organization, not just my facilities" />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={create} disabled={!ready || busy} data-testid="start-conversation">
          Start
        </Button>
      </DialogActions>
    </Dialog>
  );
}
