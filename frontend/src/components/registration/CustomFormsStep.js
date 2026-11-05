import React from "react";
import { Box, FormControl, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";
import { itemVisible } from "./customFormHelpers";

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

/** One question, by its type. */
function Question({ item, value, onChange }) {
  const label = item.label;
  const required = !!item.required;
  if (item.item_type === "yes_no" || item.item_type === "dictionary") {
    const options = item.item_type === "yes_no" ? YES_NO : (item.options || []).map((o) => ({ value: o, label: o }));
    const labelId = `cf-${item.id}`;
    return (
      <FormControl size="small" fullWidth required={required}>
        <InputLabel id={labelId}>{label}</InputLabel>
        <Select labelId={labelId} label={label} value={value || ""} onChange={(e) => onChange(e.target.value)} data-testid={`cf-item-${item.id}`}>
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {options.map((o) => (
            <MenuItem key={o.value} value={o.value}>
              {o.label}
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    );
  }
  const type = item.item_type === "date" ? "date" : item.item_type === "number" ? "number" : "text";
  return (
    <TextField
      size="small"
      fullWidth
      required={required}
      label={label}
      type={type}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      InputLabelProps={type === "date" ? { shrink: true } : undefined}
      inputProps={{ "data-testid": `cf-item-${item.id}`, maxLength: 1000 }}
    />
  );
}

/** The Forms step: each form the clinic set up for this role, with questions that show or hide by earlier answers. */
export default function CustomFormsStep({ forms, answers, onChange, visitSaved }) {
  if (!forms.length) return <Typography color="text.secondary">No forms are set up.</Typography>;
  return (
    <Stack spacing={3} data-testid="step-forms">
      {forms.map((form) => (
        <Box key={form.id} data-testid={`cf-form-${form.id}`}>
          <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
            {form.name}
            <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
              {form.used_as === "visit" ? "this visit" : "kept on the patient"}
            </Typography>
          </Typography>
          <Stack spacing={1.5}>
            {form.items.map((item, i) =>
              itemVisible(form, i, answers) ? <Question key={item.id} item={item} value={answers[item.id]} onChange={(v) => onChange(item.id, v)} /> : null
            )}
          </Stack>
          {form.used_as === "visit" && !visitSaved && (
            <Typography variant="caption" color="text.secondary">
              Saved together with the visit.
            </Typography>
          )}
        </Box>
      ))}
    </Stack>
  );
}
