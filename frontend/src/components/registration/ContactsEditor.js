import React from "react";
import { Box, Button, Checkbox, FormControlLabel, IconButton, Stack, TextField, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DictionaryField from "./DictionaryField";

export const EMPTY_CONTACT = { contact_type: "", name: "", relationship: "", phone: "", address: "", receives_communication: false };

/** The other people to reach for a patient, one row each. Contact type and relationship suggest the clinic's lists. */
export default function ContactsEditor({ contacts, onChange, typeOptions, relationshipOptions }) {
  const update = (i, patch) => onChange(contacts.map((c, n) => (n === i ? { ...c, ...patch } : c)));
  const remove = (i) => onChange(contacts.filter((_, n) => n !== i));
  return (
    <Box data-testid="contacts-editor">
      {contacts.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No other contacts yet. The emergency contact is on its own step.
        </Typography>
      )}
      <Stack spacing={1.5}>
        {contacts.map((c, i) => (
          <Box key={i} data-testid={`contact-row-${i}`} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5 }}>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 1.5 }}>
              <DictionaryField label="Contact type" options={typeOptions} value={c.contact_type} onChange={(v) => update(i, { contact_type: v })} />
              <TextField label="Name" size="small" fullWidth required value={c.name} onChange={(e) => update(i, { name: e.target.value })} inputProps={{ "data-testid": `contact-name-${i}` }} />
              <DictionaryField label="Relationship" options={relationshipOptions} value={c.relationship} onChange={(v) => update(i, { relationship: v })} />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: "center" }}>
              <TextField label="Phone" size="small" fullWidth value={c.phone} onChange={(e) => update(i, { phone: e.target.value })} inputProps={{ maxLength: 20 }} />
              <TextField label="Address" size="small" fullWidth value={c.address} onChange={(e) => update(i, { address: e.target.value })} />
              <FormControlLabel
                sx={{ whiteSpace: "nowrap" }}
                control={<Checkbox size="small" checked={!!c.receives_communication} onChange={(e) => update(i, { receives_communication: e.target.checked })} />}
                label="Receives communication"
              />
              <IconButton aria-label={`Remove contact ${i + 1}`} data-testid={`remove-contact-${i}`} onClick={() => remove(i)}>
                <DeleteOutlineIcon />
              </IconButton>
            </Stack>
          </Box>
        ))}
      </Stack>
      <Button sx={{ mt: 1.5 }} variant="outlined" size="small" data-testid="add-contact" onClick={() => onChange([...contacts, { ...EMPTY_CONTACT }])}>
        Add contact
      </Button>
    </Box>
  );
}
