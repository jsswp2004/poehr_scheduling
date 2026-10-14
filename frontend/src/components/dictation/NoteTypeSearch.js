import { useEffect, useMemo, useState } from "react";
import { Autocomplete, Box, TextField, Typography } from "@mui/material";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { authHeader } from "../patientHeader/headerApi";

// The built-in SOAP note types. They use the four SOAP boxes. Every other type is a Note Builder
// template. A template with the same code replaces the built-in entry.
export const SOAP_TYPES = [
  { code: "progress_note", name: "Progress Note" },
  { code: "initial_assessment", name: "Initial Assessment" },
];

const RECENT_KEY = "power-dictate-recent-note-types";
const RECENT_MAX = 5;
const GROUP_RECENT = "Recently used";
const GROUP_ALL = "All note types";

export function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list.filter((c) => typeof c === "string") : [];
  } catch (e) {
    return [];
  }
}

/** Remember a note type as recently used (this browser only). */
export function rememberNoteType(code) {
  try {
    const next = [code, ...readRecent().filter((c) => c !== code)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch (e) {
    // private window or blocked storage: the list just won't remember
  }
}

/** Combine SOAP types and templates into picker options, recently used first. Exported for tests. */
export function buildOptions(templates, recent) {
  const byCode = new Map();
  SOAP_TYPES.forEach((t) => byCode.set(t.code, { ...t, kind: "soap", detail: "SOAP note · 4 fields" }));
  (templates || []).forEach((t) => {
    const count = Array.isArray(t.fields) ? t.fields.length : null;
    byCode.set(t.code, { code: t.code, name: t.name, kind: "template", detail: count ? `${count} fields` : "Structured note" });
  });
  const all = Array.from(byCode.values()).sort((a, b) => a.name.localeCompare(b.name));
  const recentOptions = recent.map((c) => byCode.get(c)).filter(Boolean);
  const recentCodes = new Set(recentOptions.map((o) => o.code));
  return [
    ...recentOptions.map((o) => ({ ...o, group: GROUP_RECENT })),
    ...all.filter((o) => !recentCodes.has(o.code)).map((o) => ({ ...o, group: GROUP_ALL })),
  ];
}

/**
 * Searchable list of the note types in clinical documentation: the built-in SOAP types plus every
 * active Note Builder template. `value` is an option object or null.
 */
export default function NoteTypeSearch({ value, onChange, disabled }) {
  const [templates, setTemplates] = useState([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const { data } = await api.get(apiEndpoints.noteTemplates, { headers: await authHeader() });
        const list = Array.isArray(data) ? data : data?.results || [];
        if (live) setTemplates(list.filter((t) => t && t.code && t.name));
      } catch (e) {
        if (live) setFailed(true); // the built-in types still work
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const options = useMemo(() => buildOptions(templates, readRecent()), [templates, value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Autocomplete
      disabled={disabled}
      options={options}
      value={value}
      onChange={(e, next) => onChange(next)}
      groupBy={(o) => o.group}
      getOptionLabel={(o) => o.name}
      isOptionEqualToValue={(a, b) => a.code === b.code}
      noOptionsText="No matching note type. SOAP notes are always available."
      renderOption={(props, o) => {
        const rest = { ...props };
        delete rest.key;
        return (
          <Box component="li" key={`${o.group}-${o.code}`} {...rest}>
            <Box>
              <Typography variant="body1" sx={{ fontWeight: 600 }}>
                {o.name}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {o.detail}
              </Typography>
            </Box>
          </Box>
        );
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label="Note type (optional)"
          placeholder="Search note types"
          helperText={failed ? "Could not load your note templates. Only SOAP types are listed." : undefined}
        />
      )}
    />
  );
}
