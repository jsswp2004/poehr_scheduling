import { useEffect, useRef, useState } from "react";
import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    FormControlLabel,
    Grid,
    IconButton,
    MenuItem,
    Paper,
    TextField,
    Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";

// The shared `api` axios instance carries no Authorization header of its
// own -- every call site attaches its own token, matching the pattern used
// throughout the note-builder UI this mirrors.
const authConfig = async () => ({ headers: { Authorization: `Bearer ${await getValidToken()}` } });

// Mirrors FlowsheetRowDefinition.FIELD_TYPE_CHOICES in appointments/models.py.
const FIELD_TYPES = [
    { value: "numeric", label: "Numeric" },
    { value: "text", label: "Text" },
    { value: "dropdown", label: "Dropdown (dictionary)" },
];

let tempIdCounter = 0;
const nextTempId = () => `new-${Date.now()}-${tempIdCounter++}`;

// Converts one row as returned by GET /api/admin/flowsheet-templates/<code>/
// into this editor's flat working shape. Unlike NoteTemplateEditor's fields,
// a flowsheet row has no depends_on/tab_label/required -- just section,
// key, label, unit, type, and (for dropdown) a dictionary.
function rowFromApi(r) {
    return {
        clientId: String(r.id),
        section_label: r.section_label || "",
        key: r.key,
        label: r.label,
        unit: r.unit || "",
        field_type: r.field_type,
        dictionary: r.dictionary || null,
    };
}

function blankRow() {
    return {
        clientId: nextTempId(),
        section_label: "",
        key: "",
        label: "",
        unit: "",
        field_type: "numeric",
        dictionary: null,
    };
}

/**
 * Builds or edits a single FlowsheetTemplate: its metadata plus its
 * complete, drag-and-drop-orderable row list. Saving sends the whole row
 * list in one request to FlowsheetTemplateAdminViewSet -- see
 * FlowsheetTemplateAdminSerializer for how additions/removals/reordering
 * and the cosmetic-vs-structural version bump are resolved server-side.
 *
 * A flat GET /api/admin/flowsheet-templates/<code>/ response (from
 * FlowsheetTemplateSerializer) groups rows by section for read purposes;
 * this editor instead flattens `row_definitions` back into a single
 * ordered row list to edit, since sort_order (not section grouping) is
 * the thing drag-and-drop here actually controls.
 */
function FlowsheetTemplateEditor({ templateCode, onBack }) {
    const isNew = templateCode === null;
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [banner, setBanner] = useState(null);

    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [sortOrder, setSortOrder] = useState(0);
    const [version, setVersion] = useState(null);
    const [rows, setRows] = useState([]);
    const [dictionaries, setDictionaries] = useState([]);

    const dragIndex = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get(apiEndpoints.dictionariesAdmin, await authConfig());
                setDictionaries(res.data);
            } catch (e) {
                setError("Couldn't load dictionaries for the row editor.");
            }
        })();
    }, []);

    useEffect(() => {
        if (isNew) return;
        (async () => {
            try {
                const config = await authConfig();
                const res = await api.get(apiEndpoints.flowsheetTemplateAdmin(templateCode), config);
                const tpl = res.data;
                setCode(tpl.code);
                setName(tpl.name);
                setIsActive(tpl.is_active);
                setSortOrder(tpl.sort_order || 0);
                setVersion(tpl.version);

                // row_definitions arrives grouped by section (for the
                // flowsheet panel's grid); flatten it back into a single
                // ordered list, since the admin GET already returns rows
                // in sort_order within each section and sections themselves
                // are already in sort_order.
                const flat = (tpl.row_definitions || []).flatMap((section) =>
                    section.rows.map((r) => ({ ...r, section_label: section.section }))
                );
                setRows(flat.map(rowFromApi));
            } catch (e) {
                setError("Couldn't load this flowsheet type.");
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateCode]);

    const updateRow = (clientId, patch) => {
        setRows((prev) => prev.map((r) => (r.clientId === clientId ? { ...r, ...patch } : r)));
    };

    const addRow = () => {
        setRows((prev) => [...prev, blankRow()]);
    };

    const removeRow = (clientId) => {
        setRows((prev) => prev.filter((r) => r.clientId !== clientId));
    };

    // --- Native HTML5 drag-and-drop reordering (no extra dependency) -------
    const handleDragStart = (index) => (e) => {
        dragIndex.current = index;
        e.dataTransfer.effectAllowed = "move";
    };
    const handleDragOver = (index) => (e) => {
        e.preventDefault();
    };
    const handleDrop = (index) => (e) => {
        e.preventDefault();
        const from = dragIndex.current;
        dragIndex.current = null;
        if (from === null || from === index) return;
        setRows((prev) => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(index, 0, moved);
            return next;
        });
    };

    const save = async () => {
        setError("");
        setBanner(null);

        if (!code.trim() || !name.trim()) {
            setError("Name and code are required.");
            return;
        }
        if (rows.length === 0) {
            setError("A flowsheet needs at least one row.");
            return;
        }
        const keys = rows.map((r) => r.key.trim());
        if (keys.some((k) => !k)) {
            setError("Every row needs a key.");
            return;
        }
        if (new Set(keys).size !== keys.length) {
            setError("Row keys must be unique within this flowsheet.");
            return;
        }
        for (const r of rows) {
            if (r.field_type === "dropdown" && !r.dictionary) {
                setError(`Row "${r.label || r.key}" needs a dictionary (its type requires one).`);
                return;
            }
            if (!r.section_label.trim()) {
                setError(`Row "${r.label || r.key}" needs a section.`);
                return;
            }
        }

        const payload = {
            code,
            name,
            is_active: isActive,
            sort_order: sortOrder,
            rows: rows.map((r) => ({
                client_id: r.clientId,
                section_label: r.section_label,
                key: r.key,
                label: r.label,
                unit: r.unit || "",
                field_type: r.field_type,
                dictionary: r.field_type === "dropdown" ? r.dictionary : null,
            })),
        };

        setSaving(true);
        try {
            const config = await authConfig();
            const res = isNew
                ? await api.post(apiEndpoints.flowsheetTemplatesAdmin, payload, config)
                : await api.put(apiEndpoints.flowsheetTemplateAdmin(code), payload, config);
            const data = res.data;
            setVersion(data.version);
            if (isNew) {
                setBanner({ severity: "success", text: `Flowsheet type created (version ${data.version}).` });
            } else if (data.version_bumped) {
                setBanner({
                    severity: "info",
                    text: `Saved -- structural changes bumped this flowsheet type to version ${data.version}. ${
                        data.instances_count > 0
                            ? `${data.instances_count} charted flowsheet(s) on file are unaffected.`
                            : ""
                    }`,
                });
            } else {
                setBanner({ severity: "success", text: "Saved." });
            }
        } catch (e) {
            const detail = e?.response?.data;
            setError(
                typeof detail === "string"
                    ? detail
                    : detail
                    ? JSON.stringify(detail)
                    : "Couldn't save this flowsheet type."
            );
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            <Button startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 2 }}>
                Back to flowsheet types
            </Button>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
                    {error}
                </Alert>
            )}
            {banner && (
                <Alert severity={banner.severity} sx={{ mb: 2 }} onClose={() => setBanner(null)}>
                    {banner.text}
                </Alert>
            )}

            <Paper sx={{ p: 2, mb: 3 }}>
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={3}>
                        <TextField
                            label="Code"
                            value={code}
                            fullWidth
                            disabled={!isNew}
                            onChange={(e) => setCode(e.target.value)}
                            helperText={isNew ? "Stable machine key, e.g. 'intake_screening'" : "Locked once created"}
                        />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <TextField label="Name" value={name} fullWidth onChange={(e) => setName(e.target.value)} />
                    </Grid>
                    <Grid item xs={12} sm={2}>
                        <TextField
                            label="Sort Order"
                            type="number"
                            value={sortOrder}
                            fullWidth
                            onChange={(e) => setSortOrder(parseInt(e.target.value, 10) || 0)}
                            helperText="Position in the Flowsheet dropdown"
                        />
                    </Grid>
                    <Grid item xs={12} sm={2}>
                        <FormControlLabel
                            control={<Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
                            label="Active"
                        />
                    </Grid>
                    <Grid item xs={12} sm={1}>
                        {version !== null && <Chip label={`v${version}`} />}
                    </Grid>
                </Grid>
            </Paper>

            <Typography variant="h6" sx={{ mb: 1 }}>
                Rows ({rows.length})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Drag the handle to reorder. Rows sharing the same section label are grouped
                together in the flowsheet grid.
            </Typography>

            {rows.map((r, index) => (
                <Accordion
                    key={r.clientId}
                    draggable
                    onDragStart={handleDragStart(index)}
                    onDragOver={handleDragOver(index)}
                    onDrop={handleDrop(index)}
                    sx={{ mb: 1 }}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                            <DragIndicatorIcon fontSize="small" sx={{ cursor: "grab", opacity: 0.5 }} />
                            {r.section_label && <Chip size="small" label={r.section_label} />}
                            <Typography sx={{ flexGrow: 1 }}>
                                {r.label || <em>(untitled)</em>}{" "}
                                <Typography component="span" variant="body2" color="text.secondary">
                                    ({r.key || "no key"})
                                </Typography>
                            </Typography>
                            <Chip size="small" variant="outlined" label={r.field_type} />
                            {r.unit && <Chip size="small" variant="outlined" label={r.unit} />}
                            <IconButton
                                size="small"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    removeRow(r.clientId);
                                }}
                            >
                                <DeleteIcon fontSize="small" />
                            </IconButton>
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                        <Grid container spacing={2}>
                            <Grid item xs={12} sm={3}>
                                <TextField
                                    label="Section"
                                    fullWidth
                                    value={r.section_label}
                                    onChange={(e) => updateRow(r.clientId, { section_label: e.target.value })}
                                    helperText="Groups rows under a heading, e.g. 'Vital Signs'"
                                />
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <TextField
                                    label="Key"
                                    fullWidth
                                    value={r.key}
                                    onChange={(e) => updateRow(r.clientId, { key: e.target.value })}
                                    helperText="Stable id this value is stored under"
                                />
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <TextField
                                    label="Label"
                                    fullWidth
                                    value={r.label}
                                    onChange={(e) => updateRow(r.clientId, { label: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={12} sm={3}>
                                <TextField
                                    label="Unit"
                                    fullWidth
                                    value={r.unit}
                                    onChange={(e) => updateRow(r.clientId, { unit: e.target.value })}
                                    placeholder="e.g. mmHg, %, lbs"
                                />
                            </Grid>

                            <Grid item xs={12} sm={4}>
                                <TextField
                                    select
                                    label="Field Type"
                                    fullWidth
                                    value={r.field_type}
                                    onChange={(e) => updateRow(r.clientId, { field_type: e.target.value })}
                                >
                                    {FIELD_TYPES.map((t) => (
                                        <MenuItem key={t.value} value={t.value}>
                                            {t.label}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            </Grid>
                            {r.field_type === "dropdown" && (
                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        select
                                        label="Dictionary"
                                        fullWidth
                                        value={r.dictionary || ""}
                                        onChange={(e) =>
                                            updateRow(r.clientId, { dictionary: e.target.value || null })
                                        }
                                    >
                                        {dictionaries.map((d) => (
                                            <MenuItem key={d.id} value={d.id}>
                                                {d.name}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>
                            )}
                        </Grid>
                    </AccordionDetails>
                </Accordion>
            ))}

            <Button startIcon={<AddIcon />} onClick={addRow} sx={{ mb: 3 }}>
                Add Row
            </Button>

            <Box sx={{ display: "flex", gap: 2 }}>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>
                    Save Flowsheet Type
                </Button>
            </Box>
        </Box>
    );
}

export default FlowsheetTemplateEditor;
