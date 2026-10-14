import { useEffect, useState } from "react";
import { Autocomplete, Box, CircularProgress, TextField, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader } from "../patientHeader/headerApi";

const MIN_CHARS = 2;

export function formatDob(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  return m ? `${m[2]}/${m[3]}/${m[1]}` : "";
}

/** One row from the patient list call, reduced to what this page needs. `userId` is what visits and notes are keyed on. */
export function toPatient(p) {
  return {
    userId: p.user_id,
    name: [p.last_name, p.first_name].filter(Boolean).join(", ") || p.username || "Unnamed patient",
    mrn: p.mrn || "",
    dob: formatDob(p.date_of_birth),
  };
}

const detail = (p) => [p.mrn && `MRN ${p.mrn}`, p.dob && `DOB ${p.dob}`].filter(Boolean).join(" · ");

/**
 * Type-ahead patient search. Uses the same patient list the rest of the app uses, so each person
 * only finds the patients their role is allowed to see. `value` is a patient object or null.
 */
export default function PatientSearch({ value, onChange, disabled }) {
  const [input, setInput] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const q = input.trim();
    if (q.length < MIN_CHARS || (value && input === value.name)) {
      setOptions([]);
      setFailed(false);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      setFailed(false);
      try {
        const { data } = await api.get(apiEndpoints.patients, {
          params: { search: q, page_size: 8 },
          headers: await authHeader(),
        });
        const rows = Array.isArray(data) ? data : data?.results || [];
        if (live) setOptions(rows.filter((p) => p.user_id).map(toPatient));
      } catch (e) {
        if (live) {
          setOptions([]);
          setFailed(true);
        }
      } finally {
        if (live) setLoading(false);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [input, value]);

  let empty = `Type at least ${MIN_CHARS} letters of a name or MRN`;
  if (failed) empty = "Search failed. Try again.";
  else if (input.trim().length >= MIN_CHARS) empty = "No patients found";

  return (
    <Autocomplete
      disabled={disabled}
      options={options}
      value={value}
      onChange={(e, next) => onChange(next)}
      inputValue={input}
      onInputChange={(e, text) => setInput(text)}
      filterOptions={(all) => all}
      getOptionLabel={(p) => p.name}
      isOptionEqualToValue={(a, b) => a.userId === b.userId}
      loading={loading}
      loadingText="Searching..."
      noOptionsText={empty}
      renderOption={(props, p) => {
        const rest = { ...props };
        delete rest.key; // React wants the key set directly, not spread
        return (
          <Box component="li" key={p.userId} {...rest}>
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {p.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {detail(p)}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Patient (optional)"
          placeholder="Search by name or MRN"
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress size={18} aria-label="Searching patients" /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
    />
  );
}
