import { useEffect, useRef, useState } from "react";
import { Autocomplete, Box, Chip, CircularProgress, TextField, Typography } from "@mui/material";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { getValidToken } from "../utils/auth";

/**
 * Diagnosis picker: type a code or a few words ("E11", "diabetes") and pick
 * from the matching ICD-10-CM codes. The value is a list of
 * { code, description }, the shape orders already store.
 *
 * Searching goes through our own backend (GET /api/icd10/search/), never to an
 * outside site from the browser. If the search is unavailable, the field still
 * works as a plain entry box: type a code and press Enter.
 */

export const MAX_CODES = 20; // the server accepts at most 20 diagnoses per order
const MIN_CHARS = 2;
const DEBOUNCE_MS = 300;

const authHeader = async () => {
  const token = await getValidToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token.access_token || token}` };
};

/** "e11.9, i10" -> [{code:"E11.9"}, {code:"I10"}]; one entry per code, upper-cased. */
export function codesFromText(text) {
  return String(text || "")
    .split(/[,;\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean)
    .map((code) => ({ code, description: "" }));
}

/** The same code never appears twice; the first copy (the one with a description) wins. */
export function uniqueByCode(list) {
  const seen = new Set();
  return list.filter((item) => {
    const key = item.code.toUpperCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export const dxLabel = (dx) => (dx.description ? `${dx.code} - ${dx.description}` : dx.code);

function IcdCodePicker({ value, onChange, disabled = false, label = "Diagnosis codes (ICD-10)", size = "small", sx }) {
  const [inputValue, setInputValue] = useState("");
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const requestId = useRef(0);
  const selected = value || [];

  useEffect(() => {
    const text = inputValue.trim();
    requestId.current += 1;
    const mine = requestId.current;
    if (text.length < MIN_CHARS) {
      setOptions([]);
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.icd10Search, { headers, params: { q: text, limit: 15 } });
        if (mine !== requestId.current) return; // a newer search replaced this one
        setOptions((res.data && res.data.results) || []);
        setUnavailable(false);
      } catch (err) {
        if (mine !== requestId.current) return;
        setOptions([]);
        setUnavailable(true);
      } finally {
        if (mine === requestId.current) setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [inputValue]);

  const handleChange = (_event, newValue) => {
    const next = [];
    newValue.forEach((item) => {
      if (typeof item === "string") {
        // typed (not picked): take the description from a search result for the same code if we have one
        codesFromText(item).forEach((typed) => {
          const known = options.find((o) => o.code.toUpperCase() === typed.code);
          next.push(known || typed);
        });
      } else {
        next.push(item);
      }
    });
    onChange(uniqueByCode(next).slice(0, MAX_CODES));
    setInputValue("");
  };

  const helper = unavailable
    ? "Code search is unavailable right now. Type a code and press Enter."
    : selected.length >= MAX_CODES
    ? `At most ${MAX_CODES} diagnoses per order.`
    : undefined;

  return (
    <Autocomplete
      multiple
      freeSolo
      disableCloseOnSelect={false}
      size={size}
      disabled={disabled}
      options={options}
      value={selected}
      inputValue={inputValue}
      onInputChange={(_e, text, reason) => {
        if (reason !== "reset") setInputValue(text);
      }}
      onChange={handleChange}
      loading={loading}
      // the server already matched; only hide codes already on the order (clicking one again would remove it)
      filterOptions={(list) => list.filter((o) => !selected.some((s) => s.code.toUpperCase() === o.code.toUpperCase()))}
      getOptionLabel={(option) => (typeof option === "string" ? option : option.code)}
      isOptionEqualToValue={(option, val) => option.code === val.code}
      renderOption={(props, option) => {
        const { key, ...rest } = props;
        return (
          <li key={key} {...rest}>
            <Box>
              <Typography component="span" variant="body2" fontWeight={700} sx={{ mr: 1 }}>
                {option.code}
              </Typography>
              <Typography component="span" variant="body2">
                {option.description}
              </Typography>
            </Box>
          </li>
        );
      }}
      renderTags={(tagValue, getTagProps) =>
        tagValue.map((dx, index) => {
          const { key, ...tagProps } = getTagProps({ index });
          return <Chip key={key} size="small" label={dx.code} title={dx.description || dx.code} {...tagProps} />;
        })
      }
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          placeholder={selected.length ? "" : "Search by code or name, e.g. E11 or diabetes"}
          helperText={helper}
          InputProps={{
            ...params.InputProps,
            endAdornment: (
              <>
                {loading ? <CircularProgress color="inherit" size={16} /> : null}
                {params.InputProps.endAdornment}
              </>
            ),
          }}
        />
      )}
      noOptionsText={inputValue.trim().length < MIN_CHARS ? "Type at least 2 characters" : "No matching codes"}
      sx={sx}
    />
  );
}

export default IcdCodePicker;
