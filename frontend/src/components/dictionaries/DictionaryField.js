import React from "react";
import {
  Autocomplete, Checkbox, FormControl, FormControlLabel, FormGroup, FormLabel, InputLabel, MenuItem, Radio,
  RadioGroup, Select, TextField,
} from "@mui/material";

export const DISPLAY_TYPE_LABELS = {
  checkboxes: "Checkboxes",
  radio: "Radio buttons",
  dropdown: "Dropdown",
  searchable: "Dropdown, searchable",
};

/**
 * One choice from a System Dictionary, shown the way the dictionary is set up: checkboxes, radio buttons,
 * dropdown or searchable dropdown. The value is the stored value; onChange gets an event-like object
 * ({ target: { name, value } }) so it drops into existing forms. A single-value field shown as checkboxes
 * behaves like radio buttons: ticking one clears the others.
 */
export default function DictionaryField({ label, name, value, onChange, options, displayType = "dropdown", required = false, disabled = false, size = "small" }) {
  const emit = (v) => onChange({ target: { name, value: v } });

  if (displayType === "checkboxes") {
    return (
      <FormControl component="fieldset" required={required} disabled={disabled}>
        <FormLabel component="legend">{label}</FormLabel>
        <FormGroup row>
          {options.map((o) => (
            <FormControlLabel
              key={o.value}
              label={o.label}
              control={<Checkbox size={size} checked={value === o.value} onChange={() => emit(value === o.value ? "" : o.value)} />}
            />
          ))}
        </FormGroup>
      </FormControl>
    );
  }
  if (displayType === "radio") {
    return (
      <FormControl component="fieldset" required={required} disabled={disabled}>
        <FormLabel component="legend">{label}</FormLabel>
        <RadioGroup row name={name} value={value || ""} onChange={(e) => emit(e.target.value)}>
          {options.map((o) => (
            <FormControlLabel key={o.value} value={o.value} label={o.label} control={<Radio size={size} />} />
          ))}
        </RadioGroup>
      </FormControl>
    );
  }
  if (displayType === "searchable") {
    const current = options.find((o) => o.value === value) || null;
    return (
      <Autocomplete
        size={size}
        disabled={disabled}
        options={options}
        value={current}
        getOptionLabel={(o) => o.label}
        isOptionEqualToValue={(a, b) => a.value === b.value}
        onChange={(_, o) => emit(o ? o.value : "")}
        renderInput={(params) => <TextField {...params} label={label} required={required} />}
      />
    );
  }
  const id = `${name}-label`;
  return (
    <FormControl fullWidth size={size} required={required} disabled={disabled}>
      <InputLabel id={id}>{label}</InputLabel>
      <Select labelId={id} name={name} value={value || ""} label={label} onChange={(e) => emit(e.target.value)} sx={{ borderRadius: 2 }}>
        <MenuItem value=""><em>Select</em></MenuItem>
        {options.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
      </Select>
    </FormControl>
  );
}
