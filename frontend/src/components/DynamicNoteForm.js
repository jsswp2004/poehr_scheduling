import { useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Chip,
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
  Tabs,
  Tab,
} from "@mui/material";
import { INTERPRETATION_SUFFIX, applyCalculations, computeCalc } from "../utils/calculations";

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
 *   calculated  -> read-only result (a total / score) worked out live from
 *                  other fields by the field's `calc` config, with its
 *                  interpretation and cautions; stored like any other value
 *                  (the server recomputes it on save)
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

// Turns one field's raw stored value into the string (or null, if empty)
// that should be shown for it -- resolving dictionary values to their
// display labels, formatting multiselect as a joined list, etc. Shared by
// DynamicNoteSummary (Note History) and buildNotePreviewSections (the live
// preview pane / print in ClinicalNotesPanel) so both show a field the same
// way.
export function formatFieldValue(field, rawValue, allValues) {
  if (field.field_type === "calculated") {
    if (rawValue === undefined || rawValue === null || rawValue === "") return null;
    // Work the interpretation out from the field's own (snapshotted) calc so
    // an old note always shows the ranges it was signed with.
    const computed = allValues && field.calc ? computeCalc(field.calc, allValues) : null;
    const interpretation =
      (computed && computed.interpretation) || (allValues && allValues[field.key + INTERPRETATION_SUFFIX]) || "";
    return interpretation ? `${rawValue} (${interpretation})` : String(rawValue);
  }
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
}

// Groups a flat, pre-sorted field list into { label, fields } buckets by
// section_label, preserving first-appearance order (never re-sorts).
// Shared by the live form (per-tab) and, indirectly, by the pattern used in
// DynamicNoteSummary below.
export function groupBySection(fieldList) {
  const sections = [];
  const sectionIndex = {};
  fieldList.forEach((field) => {
    const label = field.section_label || "";
    if (!(label in sectionIndex)) {
      sectionIndex[label] = sections.length;
      sections.push({ label, fields: [] });
    }
    sections[sectionIndex[label]].fields.push(field);
  });
  return sections;
}

// Groups a flat, pre-sorted field list into { label, fields } buckets by
// tab_label, preserving first-appearance order. `tab_label` is an optional
// top-level grouping above section_label, meant for templates that grow too
// long for a single scroll (e.g. a Review-of-Systems-heavy Admission Note).
// A blank tab_label is its own group (labeled "General" when shown), so a
// template that never sets tab_label produces exactly one group and no Tabs
// bar is rendered -- zero visual change for existing templates.
export function groupByTab(fieldList) {
  const tabs = [];
  const tabIndex = {};
  fieldList.forEach((field) => {
    const label = field.tab_label || "";
    if (!(label in tabIndex)) {
      tabIndex[label] = tabs.length;
      tabs.push({ label, fields: [] });
    }
    tabs[tabIndex[label]].fields.push(field);
  });
  return tabs;
}

function DynamicNoteForm({ template, values, onChange, disabled }) {
  const fields = template?.fields || [];
  const [activeTab, setActiveTab] = useState(0);

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

  // Calculated fields (a total, a score) are never typed: keep each one's
  // stored value -- and its interpretation, stored beside it -- in step with
  // the answers it is calculated from. Only visible ones are kept (a hidden
  // one is cleared by the effect above), and each pass fixes what differs, so
  // chained calculations settle in a few passes. The server recomputes on
  // save, so this is for what the author sees while typing.
  useEffect(() => {
    if (!template) return;
    const calculated = fields.filter((f) => f.field_type === "calculated" && isFieldVisible(f, values));
    if (calculated.length === 0) return;
    const { values: next } = applyCalculations(fields, values);
    calculated.forEach((f) => {
      [f.key, f.key + INTERPRETATION_SUFFIX].forEach((key) => {
        const want = next[key] === undefined ? "" : next[key];
        const have = values[key] === undefined ? "" : values[key];
        if (want !== have) onChangeRef.current(key, want);
      });
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

  // Group fields by tab_label first (only rendered as a Tabs bar when more
  // than one distinct tab is in use), then by section_label within whichever
  // tab is active. Fields already arrive pre-sorted from the backend -- this
  // only groups, never re-sorts.
  const tabGroups = groupByTab(fields);
  const hasTabs = tabGroups.length > 1;
  const safeActiveTab = Math.min(activeTab, tabGroups.length - 1);
  const activeFields = hasTabs ? tabGroups[safeActiveTab].fields : fields;
  const sections = groupBySection(activeFields);

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

      case "calculated": {
        const result = computeCalc(field.calc, values);
        return (
          <Box
            key={field.key}
            sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 1, bgcolor: "action.hover" }}
          >
            <Typography variant="caption" color="text.secondary">
              {field.label}
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" flexWrap="wrap" useFlexGap>
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                {result.value !== "" ? result.value : "--"}
              </Typography>
              {result.interpretation && <Chip color="primary" label={result.interpretation} />}
            </Stack>
            {result.value === "" && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                Calculated automatically from the items above.
              </Typography>
            )}
            {field.help_text && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                {field.help_text}
              </Typography>
            )}
            {result.alerts.map((message) => (
              <Alert key={message} severity="warning" sx={{ mt: 1 }}>
                {message}
              </Alert>
            ))}
          </Box>
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
    <Box>
      {hasTabs && (
        <Tabs
          value={safeActiveTab}
          onChange={(e, newValue) => setActiveTab(newValue)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}
        >
          {tabGroups.map((tab, idx) => (
            <Tab key={tab.label || `tab-${idx}`} label={tab.label || "General"} />
          ))}
        </Tabs>
      )}
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
    </Box>
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

  const renderFieldLine = (field) => {
    // A hidden dependent field's leftover value (if any predates the
    // stale-value cleanup in DynamicNoteForm) is never shown in
    // history -- only what was applicable when the note was signed.
    if (!isFieldVisible(field, structuredData)) return null;
    const display = formatFieldValue(field, structuredData[field.key], structuredData);
    // A caution (e.g. the PHQ-9 suicide-risk note) shows even before the
    // total itself can be worked out.
    const cautions =
      field.field_type === "calculated" && field.calc ? computeCalc(field.calc, structuredData).alerts : [];
    if (display === null && cautions.length === 0) return null;
    return (
      <Box key={field.key}>
        {display !== null && (
          <Typography variant="body2">
            <strong>{field.label}:</strong> {display}
          </Typography>
        )}
        {cautions.map((message) => (
          <Typography variant="body2" color="error" key={message}>
            Caution: {message}
          </Typography>
        ))}
      </Box>
    );
  };

  // Tab headings are purely for readability here (no interactive Tabs bar --
  // this is a read-only summary), so only add them once a template actually
  // uses more than one tab; otherwise render exactly as before.
  const tabGroups = groupByTab(fields);
  if (tabGroups.length <= 1) {
    return <Box sx={{ display: "grid", gap: 0.5 }}>{fields.map(renderFieldLine)}</Box>;
  }

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      {tabGroups.map((tab, idx) => (
        <Box key={tab.label || `tab-${idx}`}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: "uppercase" }}>
            {tab.label || "General"}
          </Typography>
          <Box sx={{ display: "grid", gap: 0.5, mt: 0.5 }}>
            {tab.fields.map(renderFieldLine)}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

/**
 * Builds the shared { tabLabel, sections: [{ sectionLabel, entries }] }
 * shape consumed by NotePreviewPane for both the live preview pane and its
 * Print button, so what's shown on screen while documenting is exactly what
 * gets printed -- from the SAME template/field structure DynamicNoteForm
 * itself renders (tab_label -> section_label -> fields).
 *
 * Unlike DynamicNoteSummary (Note History, which only shows what was
 * actually filled in on a signed note), this keeps every visible field,
 * marking an empty one with `empty: true` so the preview/print can show
 * "Not yet documented" placeholders while the note is still being drafted.
 */
export function buildNotePreviewSections(fields, values) {
  const tabGroups = groupByTab(fields || []);
  return tabGroups.map((tab) => ({
    tabLabel: tab.label,
    sections: groupBySection(tab.fields).map((section) => ({
      sectionLabel: section.label,
      entries: section.fields
        .filter((f) => isFieldVisible(f, values || {}))
        .map((f) => {
          let display = formatFieldValue(f, values ? values[f.key] : undefined, values || {});
          // Calculated items carry their caution into the preview and print.
          if (f.field_type === "calculated" && f.calc) {
            const cautions = computeCalc(f.calc, values || {}).alerts;
            if (cautions.length > 0) {
              display = `${display === null ? "" : `${display} -- `}Caution: ${cautions.join(" ")}`;
            }
          }
          return { label: f.label, display: display === null ? "" : display, empty: display === null };
        }),
    })),
  }));
}
