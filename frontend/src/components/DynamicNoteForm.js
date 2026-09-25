import { useEffect, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  FormControlLabel,
  FormLabel,
  FormGroup,
  Checkbox,
  Radio,
  RadioGroup,
  Stack,
  Divider,
} from "@mui/material";

/**
 * Renders a form for any structured (non-SOAP) ClinicalNote from a
 * NoteTemplate definition (fetched from GET /api/note-templates/<code>/),
 * grouping fields by `section_label` and mapping `field_type` to the
 * matching MUI control:
 *
 *   text        -> single-line TextField
 *   textarea    -> multi-line TextField
 *   dropdown    -> Select, options from the field's dictionary
 *   radio       -> RadioGroup, options from the field's dictionary
 *   multiselect -> checkbox group, options from the field's dictionary,
 *                  value stored as an array of selected option values
 *                  (e.g. a Review of Systems status row -- "negative
 *                  for..." and "positive for..." can both be checked at
 *                  once -- or a findings checklist)
 *   checkbox    -> single Checkbox (stored as boolean)
 *   numeric     -> TextField type="number"
 *   date        -> TextField type="date"
 *
 * A field with `depends_on_key` set is only rendered once the field it
 * depends on has a value containing (for multiselect/array values) or
 * equal to (for everything else) `depends_on_value` -- e.g. a body
 * system's "negative findings" checklist only appears once its own status
 * field has "negative_for" checked.
 *
 * This is the generic renderer described in the note-builder engine: a new
 * note type only needs a new NoteTemplate + NoteFieldDefinition rows (and,
 * eventually, a config-UI to create them) -- never a new React component.
 *
 * `values` is a flat object keyed by NoteFieldDefinition.key (this is
 * exactly what gets posted as ClinicalNote.structured_data). `onChange`
 * receives (key, newValue).
 */

// Shared by the live form, Note History, and required-field validation in
// ClinicalNotesPanel: is `field` visible given the current values object?
// A field with no dependency is always visible.
export function isFieldVisible(field, values) {
  if (!field.depends_on_key) return true;
  const parentValue = values[field.depends_on_key];
  if (Array.isArray(parentValue)) return parentValue.includes(field.depends_on_value);
  return parentValue === field.depends_on_value;
}

function DynamicNoteForm({ template, values, onChange, disabled }) {
  const fields = template?.fields || [];

  // If a field becomes hidden (its dependency no longer matches -- e.g. a
  // Review of Systems block switched from "negative for..." to "positive
  // for..."), clear any value it was already holding rather than leaving
  // stale, no-longer-applicable selections silently sitting in
  // structured_data. onChangeRef avoids re-running this effect just
  // because the parent re-renders with a new onChange function identity.
  // Declared before the `!template` early return below so hook order stays
  // consistent across renders regardless of whether template has loaded.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    if (!template) return;
    fields.forEach((field) => {
      if (!field.depends_on_key) return;
      if (isFieldVisible(field, values)) return;
      const current = values[field.key];
      const isEmpty =
        current === undefined ||
        current === null ||
        current === "" ||
        (Array.isArray(current) && current.length === 0);
      if (!isEmpty) {
        onChangeRef.current(field.key, Array.isArray(current) ? [] : "");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, template]);

  if (!template) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading form...
      </Typography>
    );
  }

  // Group fields by section_label, preserving the backend's sort_order
  // (fields already arrive pre-sorted -- this only groups, never re-sorts).
  const sections = [];
  const sectionIndex = {};
  fields.forEach((field) => {
    const label = field.section_label || "";
    if (!(label in sectionIndex)) {
      sectionIndex[label] = sections.length;
      sections.push({ label, fields: [] });
    }
    sections[sectionIndex[label]].fields.push(field);
  });

  const renderField = (field) => {
    const value = values[field.key] ?? (field.field_type === "checkbox" ? false : "");
    const commonProps = {
      key: field.key,
      disabled,
    };

    switch (field.field_type) {
      case "textarea":
        return (
          <TextField
            {...commonProps}
            label={field.label}
            required={field.required}
            multiline
            minRows={2}
            fullWidth
            value={value}
            helperText={field.help_text || undefined}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        );

      case "numeric":
        return (
          <TextField
            {...commonProps}
            label={field.label}
            required={field.required}
            type="number"
            fullWidth
            value={value}
            helperText={field.help_text || undefined}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        );

      case "date":
        return (
          <TextField
            {...commonProps}
            label={field.label}
            required={field.required}
            type="date"
            fullWidth
            InputLabelProps={{ shrink: true }}
            value={value}
            helperText={field.help_text || undefined}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        );

      case "dropdown":
        return (
          <FormControl {...commonProps} fullWidth required={field.required}>
            <InputLabel id={`field-${field.key}-label`}>{field.label}</InputLabel>
            <Select
              labelId={`field-${field.key}-label`}
              label={field.label}
              value={value}
              onChange={(e) => onChange(field.key, e.target.value)}
            >
              {(field.options || []).map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  {opt.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        );

      case "radio":
        return (
          <FormControl {...commonProps} component="fieldset">
            <FormLabel component="legend">
              {field.label}
              {field.required ? " *" : ""}
            </FormLabel>
            <RadioGroup
              row
              value={value}
              onChange={(e) => onChange(field.key, e.target.value)}
            >
              {(field.options || []).map((opt) => (
                <FormControlLabel
                  key={opt.value}
                  value={opt.value}
                  control={<Radio />}
                  label={opt.label}
                />
              ))}
            </RadioGroup>
          </FormControl>
        );

      case "checkbox":
        return (
          <FormControlLabel
            {...commonProps}
            control={
              <Checkbox
                checked={!!value}
                onChange={(e) => onChange(field.key, e.target.checked)}
              />
            }
            label={`${field.label}${field.required ? " *" : ""}`}
          />
        );

      case "multiselect": {
        const selected = Array.isArray(values[field.key]) ? values[field.key] : [];
        const toggle = (optValue, checked) => {
          const next = checked
            ? [...selected, optValue]
            : selected.filter((v) => v !== optValue);
          onChange(field.key, next);
        };
        return (
          <FormControl {...commonProps} component="fieldset">
            <FormLabel component="legend">
              {field.label}
              {field.required ? " *" : ""}
            </FormLabel>
            <FormGroup row>
              {(field.options || []).map((opt) => (
                <FormControlLabel
                  key={opt.value}
                  control={
                    <Checkbox
                      size="small"
                      checked={selected.includes(opt.value)}
                      onChange={(e) => toggle(opt.value, e.target.checked)}
                    />
                  }
                  label={opt.label}
                />
              ))}
            </FormGroup>
          </FormControl>
        );
      }

      case "text":
      default:
        return (
          <TextField
            {...commonProps}
            label={field.label}
            required={field.required}
            fullWidth
            value={value}
            helperText={field.help_text || undefined}
            onChange={(e) => onChange(field.key, e.target.value)}
          />
        );
    }
  };

  return (
    <Stack spacing={3}>
      {sections.map((section, idx) => (
        <Box key={section.label || `section-${idx}`}>
          {section.label && (
            <>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                {section.label}
              </Typography>
              <Divider sx={{ mb: 2 }} />
            </>
          )}
          <Stack spacing={2}>
            {section.fields.filter((f) => isFieldVisible(f, values)).map(renderField)}
          </Stack>
        </Box>
      ))}
    </Stack>
  );
}

export default DynamicNoteForm;

/**
 * Renders a signed/drafted structured note's values for Note History,
 * against the exact field definitions stored on the note
 * (`note.template_detail.fields`) -- never the live/current template --
 * so an edited template never changes how an already-signed note displays.
 */
export function DynamicNoteSummary({ templateDetail, structuredData }) {
  if (!templateDetail || !structuredData) return null;

  const fields = templateDetail.fields || [];

  const formatValue = (field, rawValue) => {
    if (field.field_type === "multiselect") {
      if (!Array.isArray(rawValue) || rawValue.length === 0) return null;
      return rawValue
        .map((v) => (field.options || []).find((o) => o.value === v)?.label || v)
        .join(", ");
    }
    if (rawValue === undefined || rawValue === null || rawValue === "") return null;
    if (field.field_type === "checkbox") return rawValue ? "Yes" : "No";
    if (field.field_type === "dropdown" || field.field_type === "radio") {
      const opt = (field.options || []).find((o) => o.value === rawValue);
      return opt ? opt.label : rawValue;
    }
    return String(rawValue);
  };

  return (
    <Box sx={{ display: "grid", gap: 0.5 }}>
      {fields.map((field) => {
        // A hidden dependent field's leftover value (if any predates the
        // stale-value cleanup in DynamicNoteForm) is never shown in
        // history -- only what was applicable when the note was signed.
        if (!isFieldVisible(field, structuredData)) return null;
        const display = formatValue(field, structuredData[field.key]);
        if (display === null) return null;
        return (
          <Typography variant="body2" key={field.key}>
            <strong>{field.label}:</strong> {display}
          </Typography>
        );
      })}
    </Box>
  );
}
