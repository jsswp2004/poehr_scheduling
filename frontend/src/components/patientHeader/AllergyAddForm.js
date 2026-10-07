import { useState, useEffect, useRef } from "react";
import { Autocomplete, Box, Button, MenuItem, Stack, TextField, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader } from "./headerApi";

const SEVERITIES = [
  { value: "", label: "Not stated" },
  { value: "mild", label: "Mild" },
  { value: "moderate", label: "Moderate" },
  { value: "severe", label: "Severe" },
];

const CATEGORIES = [
  { value: "", label: "Not specified" },
  { value: "medication", label: "Medication" },
  { value: "food", label: "Food" },
  { value: "environment", label: "Environment" },
  { value: "biologic", label: "Biologic / vaccine" },
  { value: "other", label: "Other" },
];

const TYPES = [
  { value: "allergy", label: "Allergy" },
  { value: "intolerance", label: "Intolerance" },
];

const SOURCE_NOTE = {
  rxnorm: (o) => `RxNorm ${o.code}`,
  catalog: (o) => `SNOMED CT ${o.code}`,
  local: () => "Local list, no code",
};

const reactionLabel = (r) => (typeof r === "string" ? r : r.display);

/**
 * The "add an allergy" form. The allergen is looked up (RxNorm for drugs, a SNOMED list for foods
 * and environmental substances) so the allergy is stored with a code; typing something that is
 * not listed still works and is saved as free text.
 */
export default function AllergyAddForm({ busy, onAdd }) {
  const [input, setInput] = useState("");
  const [picked, setPicked] = useState(null); // a search result, or null for free text
  const [options, setOptions] = useState([]);
  const [searchState, setSearchState] = useState("idle");
  const [searchDetail, setSearchDetail] = useState("");
  const [category, setCategory] = useState("");
  const [type, setType] = useState("allergy");
  const [reactions, setReactions] = useState([]);
  const [reactionOptions, setReactionOptions] = useState([]);
  const [severity, setSeverity] = useState("");
  const latest = useRef(0);

  // the common reactions, once
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(apiEndpoints.allergyReactions, { headers: await authHeader() });
        if (!cancelled && Array.isArray(res?.data?.reactions)) setReactionOptions(res.data.reactions);
      } catch (err) {
        /* free-text reactions still work */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // allergen search, debounced; a stale answer is ignored
  useEffect(() => {
    const text = input.trim();
    if (text.length < 2 || (picked && picked.display === text)) {
      setOptions([]);
      setSearchState("idle");
      setSearchDetail("");
      return undefined;
    }
    const ticket = ++latest.current;
    const timer = setTimeout(async () => {
      try {
        const res = await api.get(apiEndpoints.allergySubstances, {
          headers: await authHeader(),
          params: { q: text, ...(category ? { category } : {}) },
        });
        if (ticket !== latest.current) return;
        setOptions(Array.isArray(res?.data?.results) ? res.data.results : []);
        setSearchState(res?.data?.rxnorm || "idle");
        setSearchDetail(res?.data?.rxnorm_detail || "");
      } catch (err) {
        if (ticket === latest.current) {
          setOptions([]);
          setSearchState("unavailable");
          setSearchDetail("the server could not be reached");
        }
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [input, category, picked]);

  const substance = (picked ? picked.display : input).trim();

  const submit = async () => {
    const payload = {
      substance,
      category,
      reaction_type: type,
      reactions: reactions.map((r) => (typeof r === "string" ? { code: "", display: r } : { code: r.code || "", display: r.display })),
      severity,
    };
    if (picked && picked.code) {
      payload.code_system = picked.system;
      payload.code = picked.code;
    }
    const ok = await onAdd(payload);
    if (ok) {
      setInput("");
      setPicked(null);
      setOptions([]);
      setCategory("");
      setType("allergy");
      setReactions([]);
      setSeverity("");
    }
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Stack spacing={1}>
        {searchDetail && !picked && (
          <Typography variant="caption" color="warning.dark" data-testid="allergy-lookup-note">
            {searchState === "unavailable"
              ? `Drug code lookup (RxNorm) is unavailable: ${searchDetail}. Showing the local list; those entries save without a code.`
              : `Drug code lookup (RxNorm): ${searchDetail}.`}
          </Typography>
        )}
        <Autocomplete
          freeSolo
          size="small"
          options={options}
          filterOptions={(x) => x}
          inputValue={input}
          value={picked}
          getOptionLabel={(o) => (typeof o === "string" ? o : o.display)}
          isOptionEqualToValue={(a, b) => a.code === b.code && a.display === b.display}
          onInputChange={(e, text, reason) => {
            setInput(text);
            if (reason === "input") setPicked(null); // typing again drops the earlier pick
          }}
          onChange={(e, value) => {
            if (value && typeof value === "object") {
              setPicked(value);
              if (value.category) setCategory(value.category);
            }
          }}
          renderOption={(props, o) => {
            const { key, ...rest } = props;
            return (
              <li key={key} {...rest}>
                <Box>
                  <Typography variant="body2">{o.display}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {[o.category, SOURCE_NOTE[o.source]?.(o)].filter(Boolean).join(" · ")}
                  </Typography>
                </Box>
              </li>
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Allergic to"
              helperText={
                searchState === "unavailable"
                  ? "The RxNorm drug lookup is not reachable right now; showing the local list. You can still type any name."
                  : picked && picked.code
                  ? `Saved with ${picked.system === "rxnorm" ? "RxNorm" : "SNOMED CT"} code ${picked.code}`
                  : "Pick a match to save it with a code, or type any name."
              }
            />
          )}
        />
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <TextField size="small" select label="Category" value={category} onChange={(e) => setCategory(e.target.value)} sx={{ flex: 1, minWidth: 140 }}>
            {CATEGORIES.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" select label="Type" value={type} onChange={(e) => setType(e.target.value)} sx={{ flex: 1, minWidth: 130 }}>
            {TYPES.map((t) => (
              <MenuItem key={t.value} value={t.value}>
                {t.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" select label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)} sx={{ flex: 1, minWidth: 130 }}>
            {SEVERITIES.map((s) => (
              <MenuItem key={s.value} value={s.value}>
                {s.label}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Autocomplete
            multiple
            freeSolo
            size="small"
            sx={{ flex: 1 }}
            options={reactionOptions}
            value={reactions}
            getOptionLabel={reactionLabel}
            isOptionEqualToValue={(a, b) => reactionLabel(a) === reactionLabel(b)}
            onChange={(e, value) => setReactions(value)}
            renderInput={(params) => <TextField {...params} label="Reactions" helperText="Choose from the list or type your own and press Enter." />}
          />
          <Button variant="contained" sx={{ alignSelf: "flex-start", height: 40 }} disabled={busy || !substance} onClick={submit}>
            Add
          </Button>
        </Stack>
      </Stack>
    </Box>
  );
}
