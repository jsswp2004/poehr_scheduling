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
 *   text      -> single-line TextField
 *   textarea  -> multi-line TextField
 *   dropdown  -> Select, options from the field's dictionary
 *   radio     -> RadioGroup, options from the field's dictionary
 *   checkbox  -> single Checkbox (stored as boolean)
 *   numeric   -> TextField type="number"
 *   date      -> TextField type="date"
 *
 * This is the generic renderer described in the note-builder engine: a new
 * note type only needs a new NoteTemplate + NoteFieldDefinition rows (and,
 * eventually, a config-UI to create them) -- never a new React component.
 *
 * `values` is a flat object keyed by NoteFieldDefinition.key (this is
 * exactly what gets posted as ClinicalNote.structured_data). `onChange`
 * receives (key, newValue).
 */
function DynamicNoteForm({ template, values, onChange, disabled }) {
  if (!template) {
    return (
      <Typography variant="body2" color="text.secondary">
        Loading form...
      </Typography>
    );
  }

  const fields = template.fields || [];

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
          <Stack spacing={2}>{section.fields.map(renderField)}</Stack>
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
