import { useState } from "react";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    FormControlLabel,
    IconButton,
    Menu,
    MenuItem,
    Paper,
    Stack,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CalculateIcon from "@mui/icons-material/Calculate";
import { OPERATIONS, formulaNames, parseFormula, toNumber } from "../../utils/calculations";

/**
 * Builder UI for ONE calculated item (a flowsheet row or a note field whose
 * type is "Calculated"): how its value is worked out from the items above it,
 * how to interpret the result, and any cautions to show. Shared by the
 * Flowsheet Builder and the Note Builder -- both store the same `calc` object
 * (format and rules: appointments/calculations.py).
 *
 * `candidates` is every item ABOVE this one that could feed a calculation:
 *   [{ key, label, field_type, numericOk }]
 * (numericOk: for a dropdown/radio, whether its dictionary's stored values are
 * all numbers -- the score of an answer is the stored value of the option).
 */

export const PRESETS = [
    {
        id: "phq9",
        label: "PHQ-9 depression severity",
        bands: [
            { min: "0", max: "4", label: "None-minimal" },
            { min: "5", max: "9", label: "Mild" },
            { min: "10", max: "14", label: "Moderate" },
            { min: "15", max: "19", label: "Moderately severe" },
            { min: "20", max: "27", label: "Severe" },
        ],
        alert: {
            min: "1",
            message:
                "A patient who answers yes to question 9 needs further assessment for suicide risk by an individual who is competent to assess this risk.",
            hint: "Q9",
        },
    },
    {
        id: "gad7",
        label: "GAD-7 anxiety severity",
        bands: [
            { min: "0", max: "4", label: "Minimal anxiety" },
            { min: "5", max: "9", label: "Mild anxiety" },
            { min: "10", max: "14", label: "Moderate anxiety" },
            { min: "15", max: "21", label: "Severe anxiety" },
        ],
        alert: null,
    },
];

export const blankCalc = () => ({
    operation: "sum",
    sources: [],
    require_all: true,
    decimals: 0,
    bands: [],
    alerts: [],
});

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Quick check before saving (the server re-checks everything). Returns a
 * readable problem, or "" when the config looks fine.
 */
export function calcProblems(calc, candidates) {
    if (!calc || !calc.operation) return "choose how to calculate it.";
    const usable = new Map(candidates.filter((c) => c.usable !== false).map((c) => [c.key, c]));
    if (calc.operation === "formula") {
        let names;
        try {
            names = formulaNames(parseFormula(calc.formula));
        } catch (e) {
            return e.message;
        }
        if (names.length === 0) return "the formula must use at least one item key.";
        const missing = names.filter((n) => !usable.has(n));
        if (missing.length) return `the formula uses ${missing.join(", ")}, which isn't an item above this one that can be calculated from.`;
    } else {
        const sources = calc.sources || [];
        if (sources.length === 0) return "pick at least one item to calculate from.";
        const missing = sources.filter((n) => !usable.has(n));
        if (missing.length) return `${missing.join(", ")} isn't an item above this one that can be calculated from.`;
    }
    const decimals = Number(calc.decimals);
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 6) return "decimals must be 0 to 6.";

    const bands = calc.bands || [];
    const parsed = [];
    for (let i = 0; i < bands.length; i += 1) {
        const b = bands[i];
        const n = i + 1;
        if (!(b.label || "").trim()) return `interpretation range ${n} needs a label.`;
        const low = b.min === "" || b.min === null || b.min === undefined ? null : toNumber(b.min);
        const high = b.max === "" || b.max === null || b.max === undefined ? null : toNumber(b.max);
        if ((b.min !== "" && b.min != null && low === null) || (b.max !== "" && b.max != null && high === null)) {
            return `interpretation range ${n} has a limit that isn't a number.`;
        }
        if (low === null && high === null) return `interpretation range ${n} needs a minimum or a maximum.`;
        if (low !== null && high !== null && low > high) return `interpretation range ${n} has a minimum above its maximum.`;
        parsed.push({ low: low === null ? -Infinity : low, high: high === null ? Infinity : high, label: b.label });
    }
    parsed.sort((a, b) => a.low - b.low);
    for (let i = 1; i < parsed.length; i += 1) {
        if (parsed[i - 1].high >= parsed[i].low) {
            return `interpretation ranges "${parsed[i - 1].label}" and "${parsed[i].label}" overlap.`;
        }
    }
    const alerts = calc.alerts || [];
    for (let i = 0; i < alerts.length; i += 1) {
        const a = alerts[i];
        const n = i + 1;
        if (!a.source || !usable.has(a.source)) return `caution ${n} needs an item.`;
        if (toNumber(a.min) === null) return `caution ${n} needs an "at or above" number.`;
        if (!(a.message || "").trim()) return `caution ${n} needs a message.`;
    }
    return "";
}

function CalculationEditor({ calc, onChange, candidates, disabled = false }) {
    const [presetAnchor, setPresetAnchor] = useState(null);
    const value = { ...blankCalc(), ...(calc || {}) };
    const set = (patch) => onChange({ ...value, ...patch });

    const usable = candidates.filter((c) => c.usable !== false);
    const isFormula = value.operation === "formula";

    const toggleSource = (key, checked) => {
        const next = checked ? [...value.sources, key] : value.sources.filter((k) => k !== key);
        // keep the list in the same order as the items above
        const order = candidates.map((c) => c.key);
        next.sort((a, b) => order.indexOf(a) - order.indexOf(b));
        set({ sources: next });
    };

    const updateBand = (index, patch) =>
        set({ bands: value.bands.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
    const updateAlert = (index, patch) =>
        set({ alerts: value.alerts.map((a, i) => (i === index ? { ...a, ...patch } : a)) });

    const applyPreset = (preset) => {
        const next = { bands: preset.bands.map((b) => ({ ...b })) };
        if (preset.alert) {
            const guess = [...usable].reverse().find((c) => c.key.toLowerCase().endsWith(preset.alert.hint.toLowerCase()));
            const already = value.alerts.some((a) => a.message === preset.alert.message);
            if (!already) {
                next.alerts = [
                    ...value.alerts,
                    { source: guess ? guess.key : "", min: preset.alert.min, message: preset.alert.message },
                ];
            }
        }
        set(next);
        setPresetAnchor(null);
    };

    const missingFormulaNames = (() => {
        if (!isFormula || !(value.formula || "").trim()) return [];
        try {
            return formulaNames(parseFormula(value.formula)).filter((n) => !usable.some((c) => c.key === n));
        } catch (e) {
            return [];
        }
    })();
    let formulaError = "";
    if (isFormula && (value.formula || "").trim()) {
        try {
            parseFormula(value.formula);
        } catch (e) {
            formulaError = e.message;
        }
    }

    return (
        <Paper variant="outlined" sx={{ p: 2, bgcolor: "action.hover" }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                <CalculateIcon fontSize="small" color="primary" />
                <Typography variant="subtitle2">Calculation</Typography>
                <Typography variant="body2" color="text.secondary">
                    Filled in automatically from the items above this one -- never typed.
                </Typography>
            </Stack>

            <Stack spacing={2}>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                    <TextField
                        select
                        size="small"
                        label="How to calculate"
                        value={value.operation}
                        disabled={disabled}
                        onChange={(e) => set({ operation: e.target.value })}
                        sx={{ minWidth: 220 }}
                    >
                        {OPERATIONS.map((o) => (
                            <MenuItem key={o.value} value={o.value}>
                                {o.label}
                            </MenuItem>
                        ))}
                    </TextField>
                    <TextField
                        select
                        size="small"
                        label="Decimal places"
                        value={value.decimals}
                        disabled={disabled}
                        onChange={(e) => set({ decimals: Number(e.target.value) })}
                        sx={{ minWidth: 150 }}
                    >
                        {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                            <MenuItem key={n} value={n}>
                                {n}
                            </MenuItem>
                        ))}
                    </TextField>
                </Stack>

                {isFormula ? (
                    <Box>
                        <TextField
                            size="small"
                            fullWidth
                            label="Formula"
                            value={value.formula || ""}
                            disabled={disabled}
                            onChange={(e) => set({ formula: e.target.value })}
                            error={!!formulaError || missingFormulaNames.length > 0}
                            helperText={
                                formulaError ||
                                (missingFormulaNames.length > 0
                                    ? `${missingFormulaNames.join(", ")} isn't an item above this one that can be calculated from.`
                                    : "Use item keys with + - * / and ( ), e.g. weight / (height * height) * 703")
                            }
                            inputProps={{ style: { fontFamily: "monospace" } }}
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
                            Click an item to add its key to the formula:
                        </Typography>
                        <Stack direction="row" flexWrap="wrap" useFlexGap spacing={0.5} sx={{ mt: 0.5 }}>
                            {usable.map((c) => {
                                const ok = IDENT_RE.test(c.key);
                                return (
                                    <Tooltip
                                        key={c.key}
                                        title={ok ? c.label : "Keys with a dash can't be used in a formula. Rename the key to use letters, numbers and underscores."}
                                    >
                                        <span>
                                            <Chip
                                                size="small"
                                                label={c.key}
                                                disabled={disabled || !ok}
                                                onClick={() =>
                                                    set({ formula: `${(value.formula || "").trimEnd()} ${c.key}`.trim() })
                                                }
                                            />
                                        </span>
                                    </Tooltip>
                                );
                            })}
                        </Stack>
                    </Box>
                ) : (
                    <Box>
                        <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                            <Typography variant="body2" sx={{ fontWeight: 600 }}>
                                Items to include ({value.sources.length})
                            </Typography>
                            <Button
                                size="small"
                                disabled={disabled || usable.length === 0}
                                onClick={() => set({ sources: usable.map((c) => c.key) })}
                            >
                                All items above
                            </Button>
                            <Button size="small" disabled={disabled || value.sources.length === 0} onClick={() => set({ sources: [] })}>
                                Clear
                            </Button>
                        </Stack>
                        {candidates.length === 0 ? (
                            <Alert severity="info">
                                There are no items above this one yet. Move this item below the ones it should add up.
                            </Alert>
                        ) : (
                            <Box
                                sx={{
                                    maxHeight: 240,
                                    overflowY: "auto",
                                    border: 1,
                                    borderColor: "divider",
                                    borderRadius: 1,
                                    px: 1.5,
                                    bgcolor: "background.paper",
                                }}
                            >
                                {candidates.map((c) => (
                                    <Box key={c.key}>
                                        <FormControlLabel
                                            disabled={disabled || c.usable === false}
                                            control={
                                                <Checkbox
                                                    size="small"
                                                    checked={value.sources.includes(c.key)}
                                                    onChange={(e) => toggleSource(c.key, e.target.checked)}
                                                />
                                            }
                                            label={
                                                <Typography variant="body2">
                                                    {c.label || c.key}{" "}
                                                    <Typography component="span" variant="caption" color="text.secondary">
                                                        ({c.key})
                                                    </Typography>
                                                    {c.usable === false && (
                                                        <Typography component="span" variant="caption" color="warning.main">
                                                            {" "}
                                                            -- {c.reason}
                                                        </Typography>
                                                    )}
                                                </Typography>
                                            }
                                        />
                                    </Box>
                                ))}
                            </Box>
                        )}
                        <FormControlLabel
                            sx={{ mt: 0.5 }}
                            disabled={disabled}
                            control={
                                <Checkbox
                                    size="small"
                                    checked={!!value.require_all}
                                    onChange={(e) => set({ require_all: e.target.checked })}
                                />
                            }
                            label={
                                <Typography variant="body2">
                                    Only show the result once every item is answered
                                    <Typography component="span" variant="caption" color="text.secondary">
                                        {" "}
                                        (untick to show a running total of the answered items)
                                    </Typography>
                                </Typography>
                            }
                        />
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                            A dropdown or radio answer counts as the stored value of the option chosen, so give each
                            option its score as the stored value (for example 0, 1, 2, 3).
                        </Typography>
                    </Box>
                )}

                <Box>
                    <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 0.5 }}>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            Interpretation of the result
                        </Typography>
                        <Button size="small" disabled={disabled} onClick={(e) => setPresetAnchor(e.currentTarget)}>
                            Use a standard scale...
                        </Button>
                        <Menu anchorEl={presetAnchor} open={!!presetAnchor} onClose={() => setPresetAnchor(null)}>
                            {PRESETS.map((p) => (
                                <MenuItem key={p.id} onClick={() => applyPreset(p)}>
                                    {p.label}
                                </MenuItem>
                            ))}
                        </Menu>
                    </Stack>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                        Optional. Shows a label beside the result, e.g. 10-14 = Moderate. Leave a minimum or maximum
                        blank for an open-ended range.
                    </Typography>
                    <Stack spacing={1}>
                        {value.bands.map((b, i) => (
                            <Stack key={i} direction="row" spacing={1} alignItems="center">
                                <TextField
                                    size="small"
                                    type="number"
                                    label="From"
                                    value={b.min ?? ""}
                                    disabled={disabled}
                                    onChange={(e) => updateBand(i, { min: e.target.value })}
                                    sx={{ width: 100 }}
                                />
                                <TextField
                                    size="small"
                                    type="number"
                                    label="To"
                                    value={b.max ?? ""}
                                    disabled={disabled}
                                    onChange={(e) => updateBand(i, { max: e.target.value })}
                                    sx={{ width: 100 }}
                                />
                                <TextField
                                    size="small"
                                    label="Label"
                                    value={b.label || ""}
                                    disabled={disabled}
                                    onChange={(e) => updateBand(i, { label: e.target.value })}
                                    sx={{ flexGrow: 1 }}
                                />
                                <IconButton
                                    size="small"
                                    disabled={disabled}
                                    onClick={() => set({ bands: value.bands.filter((_, j) => j !== i) })}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                        ))}
                        <Box>
                            <Button
                                size="small"
                                startIcon={<AddIcon />}
                                disabled={disabled}
                                onClick={() => set({ bands: [...value.bands, { min: "", max: "", label: "" }] })}
                            >
                                Add range
                            </Button>
                        </Box>
                    </Stack>
                </Box>

                <Box>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                        Cautions
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                        Optional. Show a warning under the result when one answer is at or above a number -- for
                        example the PHQ-9 suicide-risk note when question 9 is 1 or more.
                    </Typography>
                    <Stack spacing={1}>
                        {value.alerts.map((a, i) => (
                            <Stack key={i} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="flex-start">
                                <TextField
                                    select
                                    size="small"
                                    label="When this item"
                                    value={a.source || ""}
                                    disabled={disabled}
                                    onChange={(e) => updateAlert(i, { source: e.target.value })}
                                    sx={{ minWidth: 200 }}
                                >
                                    {usable.map((c) => (
                                        <MenuItem key={c.key} value={c.key}>
                                            {c.label || c.key} ({c.key})
                                        </MenuItem>
                                    ))}
                                </TextField>
                                <TextField
                                    size="small"
                                    type="number"
                                    label="is at or above"
                                    value={a.min ?? ""}
                                    disabled={disabled}
                                    onChange={(e) => updateAlert(i, { min: e.target.value })}
                                    sx={{ width: 130 }}
                                />
                                <TextField
                                    size="small"
                                    label="Show this message"
                                    value={a.message || ""}
                                    multiline
                                    disabled={disabled}
                                    onChange={(e) => updateAlert(i, { message: e.target.value })}
                                    sx={{ flexGrow: 1, minWidth: 220 }}
                                />
                                <IconButton
                                    size="small"
                                    disabled={disabled}
                                    onClick={() => set({ alerts: value.alerts.filter((_, j) => j !== i) })}
                                >
                                    <DeleteIcon fontSize="small" />
                                </IconButton>
                            </Stack>
                        ))}
                        <Box>
                            <Button
                                size="small"
                                startIcon={<AddIcon />}
                                disabled={disabled}
                                onClick={() => set({ alerts: [...value.alerts, { source: "", min: "1", message: "" }] })}
                            >
                                Add caution
                            </Button>
                        </Box>
                    </Stack>
                </Box>
            </Stack>
        </Paper>
    );
}

export default CalculationEditor;
