// What a documentation report can show, mirroring staffing/custom_report_documentation.py (keys must match).

export const DOC_SOURCE = "note_documentation";

// [group, [[key, label, on by default, kind, type]...]]
export const DOC_COLUMN_GROUPS = [
  [
    "The note",
    [
      ["template", "Note or screen", true, "dimension", "text"],
      ["note_id", "Note ID", false, "dimension", "text"],
      ["status", "Status", false, "dimension", "text"],
      ["date", "Date documented", true, "dimension", "date"],
      ["signed_on", "Date signed", false, "dimension", "date"],
      ["hours_to_sign", "Hours to sign", false, "measure", "hours"],
    ],
  ],
  [
    "Patient",
    [
      ["patient", "Patient name", true, "dimension", "text"],
      ["mrn", "MRN", true, "dimension", "text"],
      ["visit_id", "Visit ID", true, "dimension", "text"],
    ],
  ],
  [
    "People",
    [
      ["author", "Author", true, "dimension", "text"],
      ["author_role", "Author's role", false, "dimension", "text"],
      ["attending", "Attending physician", true, "dimension", "text"],
      ["discipline", "Physician's discipline", true, "dimension", "text"],
    ],
  ],
  [
    "Visit",
    [
      ["visit_date", "Visit date", false, "dimension", "date"],
      ["unit", "Unit or clinic", false, "dimension", "text"],
      ["facility", "Facility", false, "dimension", "text"],
    ],
  ],
];

export const DEFAULT_DOC_COLUMNS = DOC_COLUMN_GROUPS.flatMap(([, cols]) => cols.filter((c) => c[2]).map((c) => c[0]));

export const NUMBER_OBSERVATION_TYPES = ["numeric", "calculated"];

// The column key an observation gets in the "one column per observation" layout.
export const observationKey = (o) => (NUMBER_OBSERVATION_TYPES.includes(o.type) ? `num__${o.id}` : `obs__${o.id}`);

// Every field a report can use, for the picked observations and layout: [{key, label, kind, type}].
export function documentationFields(layout, picked) {
  const base = DOC_COLUMN_GROUPS.flatMap(([, cols]) => cols.map(([key, label, , kind, type]) => ({ key, label, kind, type })));
  if (layout === "long") {
    return [
      ...base,
      { key: "observation", label: "Observation", kind: "dimension", type: "text" },
      { key: "value", label: "Value", kind: "dimension", type: "text" },
      { key: "value_num", label: "Value (number)", kind: "measure", type: "number" },
    ];
  }
  return [
    ...base,
    ...picked.map((o) => ({
      key: observationKey(o),
      label: o.label,
      kind: NUMBER_OBSERVATION_TYPES.includes(o.type) ? "measure" : "dimension",
      type: NUMBER_OBSERVATION_TYPES.includes(o.type) ? "number" : "text",
    })),
  ];
}

// The columns to ask for, in reading order: ticked base columns, then the observation columns (or Observation/Value).
export function documentationColumns(layout, ticked, picked) {
  const base = DOC_COLUMN_GROUPS.flatMap(([, cols]) => cols.map((c) => c[0])).filter((k) => ticked.includes(k));
  if (layout === "long") return [...base, "observation", "value"];
  return [...base, ...picked.map(observationKey)];
}
