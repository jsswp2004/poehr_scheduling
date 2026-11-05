import React from "react";
import { Autocomplete, TextField } from "@mui/material";

/**
 * A text field that suggests the clinic's dictionary entries. It stays free text on purpose:
 * an older record may hold a value that is no longer on the list, and it must not disappear.
 */
export default function DictionaryField({ label, value, onChange, options, required, readOnly, ...rest }) {
  return (
    <Autocomplete
      freeSolo
      size="small"
      fullWidth
      options={options || []}
      inputValue={value || ""}
      onInputChange={(e, v, reason) => {
        if (reason === "reset" && v === (value || "")) return;
        onChange(v || "");
      }}
      readOnly={!!readOnly}
      renderInput={(params) => <TextField {...params} label={label} required={!!required} {...rest} />}
    />
  );
}
