// Who owns documents made from a note template. Shown as a column in the Note Builder's template list and
// chosen in the template editor. The value is stored on NoteTemplate.ownership; "" means not set.
export const OWNERSHIP_OPTIONS = [
    { value: "physician", label: "Physician" },
    { value: "nursing", label: "Nursing" },
    { value: "ancillary", label: "Ancillary" },
];

export function ownershipLabel(value) {
    return (OWNERSHIP_OPTIONS.find((o) => o.value === value) || {}).label || "";
}
