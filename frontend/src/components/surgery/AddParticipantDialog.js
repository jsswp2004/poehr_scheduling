import { useEffect, useState } from "react";
import { Autocomplete, Button, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, TextField } from "@mui/material";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";

const personLabel = (p) => (p ? `${p.name}${p.title ? ` (${p.title})` : ""}` : "");

/** Add Case Participants: pick a role, then search the organization's staff (or type a vendor's name). */
export default function AddParticipantDialog({ open, caseId, roles, me, onClose, onAdded }) {
  const [role, setRole] = useState("");
  const [person, setPerson] = useState(null);
  const [text, setText] = useState("");
  const [options, setOptions] = useState([]);
  const [vendorName, setVendorName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRole(roles[0]?.value || "");
    setPerson(null);
    setText("");
    setVendorName("");
  }, [open, roles]);

  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => {
      surgeryApi.staff(text.trim()).then(setOptions).catch(() => setOptions([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [open, text]);

  const isVendor = role === "vendor";
  const ready = !!role && (person || (isVendor && vendorName.trim()));

  const add = async () => {
    setBusy(true);
    try {
      const body = { role };
      if (person) body.user = person.id;
      else body.name = vendorName.trim();
      const added = await surgeryApi.addParticipant(caseId, body);
      toast.success(`${added.role_label}: ${added.display} added`);
      onAdded(added);
      onClose();
    } catch (err) {
      toast.error(errorText(err, "The participant was not added."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Case Participants</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select size="small" label="Role" value={role} onChange={(e) => setRole(e.target.value)}>
            {roles.map((r) => (
              <MenuItem key={r.value} value={r.value}>
                {r.label}
              </MenuItem>
            ))}
          </TextField>
          <Autocomplete
            size="small"
            options={options}
            value={person}
            onChange={(_, v) => setPerson(v)}
            inputValue={text}
            onInputChange={(_, v, reason) => reason !== "reset" && setText(v)}
            getOptionLabel={personLabel}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            filterOptions={(x) => x}
            noOptionsText="No staff found"
            renderInput={(params) => <TextField {...params} label="Name" />}
          />
          <Button size="small" variant="outlined" disabled={!me} onClick={() => me && setPerson(me)} sx={{ alignSelf: "flex-start" }}>
            Add Me
          </Button>
          {isVendor && (
            <TextField size="small" label="Or type a vendor name" value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={add} disabled={!ready || busy}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
