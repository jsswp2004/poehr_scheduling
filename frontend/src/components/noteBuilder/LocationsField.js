import { useMemo } from "react";
import { Autocomplete, Checkbox, TextField } from "@mui/material";
import { useLocationTree } from "../locations/LocationPicker";

export const ALL_LOCATIONS = { id: "all", label: "All locations", group: "" };

/**
 * Searchable multi-select of every unit in the Location Manager, with an "All locations" choice.
 * Props: allLocations (bool), unitIds (number[]), onChange({ allLocations, unitIds }).
 * Picking "All locations" clears the individual units; picking a unit drops "All locations".
 */
function LocationsField({ allLocations, unitIds, onChange, helperText }) {
    const tree = useLocationTree({ includeSurgical: true });
    const options = useMemo(() => {
        const units = [];
        (tree || []).forEach((f) => {
            (f.units || []).forEach((u) => units.push({ id: u.id, label: u.name, group: f.name }));
        });
        return [ALL_LOCATIONS, ...units];
    }, [tree]);

    const value = allLocations ? [ALL_LOCATIONS] : options.filter((o) => o.id !== "all" && unitIds.includes(o.id));

    const handleChange = (_e, next) => {
        const pickedAll = next.some((o) => o.id === "all");
        const hadAll = allLocations;
        if (pickedAll && !hadAll) return onChange({ allLocations: true, unitIds: [] });
        const units = next.filter((o) => o.id !== "all").map((o) => o.id);
        // Choosing a unit while "All locations" is on switches to just that unit.
        onChange({ allLocations: units.length === 0, unitIds: units });
    };

    return (
        <Autocomplete
            multiple
            disableCloseOnSelect
            size="medium"
            options={options}
            loading={tree === null}
            value={value}
            onChange={handleChange}
            getOptionLabel={(o) => (o.group ? `${o.group} - ${o.label}` : o.label)}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            groupBy={(o) => (o.id === "all" ? "" : o.group)}
            renderOption={(props, option, { selected }) => {
                const { key, ...rest } = props;
                return (
                    <li key={key} {...rest}>
                        <Checkbox size="small" checked={selected} sx={{ mr: 1, p: 0.5 }} />
                        {option.label}
                    </li>
                );
            }}
            renderInput={(params) => (
                <TextField {...params} label="Location" helperText={helperText} />
            )}
            limitTags={2}
        />
    );
}

export default LocationsField;
