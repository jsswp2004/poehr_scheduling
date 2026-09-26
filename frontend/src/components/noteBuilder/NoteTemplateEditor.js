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
// own (App.js's interceptors are only wired to the default `axios` import,
// not this instance) -- every call site attaches its own token, matching
// the pattern used by useDoctorsData/useOrganizationsData/etc.
const authConfig = async () => ({ headers: { Authorization: `Bearer ${await getValidToken()}` } });

// Mirrors NoteFieldDefinition.FIELD_TYPE_CHOICES in appointments/models.py.
const FIELD_TYPES = [
    { value: "text", label: "Single-line Text" },
    { value: "textarea", label: "Multi-line Text" },
    { value: "radio", label: "Radio Button (dictionary)" },
    { value: "dropdown", label: "Dropdown (dictionary)" },
    { value: "multiselect", label: "Multi-select Checklist (dictionary)" },
    { value: "checkbox", label: "Checkbox (yes/no)" },
    { value: "numeric", label: "Numeric" },
    { value: "date", label: "Date" },
];
const DICTIONARY_FIELD_TYPES = new Set(["radio", "dropdown", "multiselect"]);

let tempIdCounter = 0;
const nextTempId = () => `new-${Date.now()}-${tempIdCounter++}`;

// Converts one field as returned by GET /api/admin/note-templates/<code>/
// into this editor's flat working shape, resolving depends_on_key -> the
// client_id it'll use for the rest of the session (its own database id).
function fieldFromApi(f) {
    return {
        clientId: String(f.id),
        realId: f.id,
        tab_label: f.tab_label || "",
        section_label: f.section_label || "",
        key: f.key,
        label: f.label,
        field_type: f.field_type,
        dictionary: f.dictionary || null,
        required: !!f.required,
        help_text: f.help_text || "",
        dependsOnKey: f.depends_on_key || null, // resolved to a clientId once all fields are loaded
        depends_on_value: f.depends_on_value || "",
    };
}

function blankField() {
    return {
        clientId: nextTempId(),
        realId: null,
        tab_label: "",
        section_label: "",
        key: "",
        label: "",
        field_type: "text",
        dictionary: null,
        required: false,
        help_text: "",
        dependsOnClientId: null,
        depends_on_value: "",
    };
}

/**
 * Builds or edits a single NoteTemplate: its metadata plus its complete,
 * drag-and-drop-orderable field list, including cross-field "only show
 * when..." conditional logic. Saving sends the whole field list in one
 * request to NoteTemplateAdminViewSet -- see NoteTemplateAdminSerializer for
 * how additions/removals/reordering/depends_on wiring and the
 * cosmetic-vs-structural version bump are resolved server-side.
 */
function NoteTemplateEditor({ templateCode, onBack }) {
    const isNew = templateCode === null;
    const [loading, setLoading] = useState(!isNew);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [banner, setBanner] = useState(null);

    const [code, setCode] = useState("");
    const [name, setName] = useState("");
    const [isActive, setIsActive] = useState(true);
    const [version, setVersion] = useState(null);
    const [fields, setFields] = useState([]);
    const [dictionaries, setDictionaries] = useState([]);

    // Bulk-assign tool: rather than hand-editing a "Tab" field on every one
    // of a long template's fields (e.g. ~97 Review-of-Systems fields), pick
    // an existing Section and give it a Tab name in one shot.
    const [bulkSection, setBulkSection] = useState("");
    const [bulkTabName, setBulkTabName] = useState("");

    const dragIndex = useRef(null);

    useEffect(() => {
        (async () => {
            try {
                const res = await api.get(apiEndpoints.dictionariesAdmin, await authConfig());
                setDictionaries(res.data);
            } catch (e) {
                setError("Couldn't load dictionaries for the field editor.");
            }
        })();
    }, []);

    useEffect(() => {
        if (isNew) return;
        (async () => {
            try {
                const config = await authConfig();
                const res = await api.get(apiEndpoints.noteTemplateAdmin(templateCode), config);
                const tpl = res.data;
                setCode(tpl.code);
                setName(tpl.name);
                setIsActive(tpl.is_active);
                setVersion(tpl.version);

                const loaded = tpl.fields.map(fieldFromApi);
                const keyToClientId = {};
                loaded.forEach((f) => {
                    keyToClientId[f.key] = f.clientId;
                });
                loaded.forEach((f) => {
                    f.dependsOnClientId = f.dependsOnKey ? keyToClientId[f.dependsOnKey] || null : null;
                    delete f.dependsOnKey;
                });
                setFields(loaded);
            } catch (e) {
                setError("Couldn't load this template.");
            } finally {
                setLoading(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [templateCode]);

    const updateField = (clientId, patch) => {
        setFields((prev) => prev.map((f) => (f.clientId === clientId ? { ...f, ...patch } : f)));
    };

    const addField = () => {
        setFields((prev) => [...prev, blankField()]);
    };

    const removeField = (clientId) => {
        setFields((prev) =>
            prev
                .filter((f) => f.clientId !== clientId)
                // Clear depends_on for any field that pointed at the one being removed.
                .map((f) => (f.dependsOnClientId === clientId ? { ...f, dependsOnClientId: null } : f))
        );
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
        setFields((prev) => {
            const next = [...prev];
            const [moved] = next.splice(from, 1);
            next.splice(index, 0, moved);
            return next;
        });
    };

    const dictionaryOptionsFor = (dictionaryId) => {
        const dic = dictionaries.find((d) => d.id === dictionaryId);
        return dic ? dic.items : [];
    };

    const distinctSections = Array.from(
        new Set(fields.map((f) => f.section_label).filter((s) => s && s.trim()))
    );

    const applyBulkTab = () => {
        if (!bulkSection || !bulkTabName.trim()) return;
        const tabValue = bulkTabName.trim();
        setFields((prev) =>
            prev.map((f) => (f.section_label === bulkSection ? { ...f, tab_label: tabValue } : f))
        );
        setBanner({
            severity: "success",
            text: `Assigned tab "${tabValue}" to every field in section "${bulkSection}". Review below, then Save.`,
        });
    };

    const save = async () => {
        setError("");
        setBanner(null);

        if (!code.trim() || !name.trim()) {
            setError("Name and code are required.");
            return;
        }
        if (fields.length === 0) {
            setError("A template needs at least one field.");
            return;
        }
        const keys = fields.map((f) => f.key.trim());
        if (keys.some((k) => !k)) {
            setError("Every field needs a key.");
            return;
        }
        if (new Set(keys).size !== keys.length) {
            setError("Field keys must be unique within this template.");
            return;
        }
        for (const f of fields) {
            if (DICTIONARY_FIELD_TYPES.has(f.field_type) && !f.dictionary) {
                setError(`Field "${f.label || f.key}" needs a dictionary (its type requires one).`);
                return;
            }
        }

        const payload = {
            code,
            name,
            is_active: isActive,
            fields: fields.map((f) => ({
                client_id: f.clientId,
                tab_label: f.tab_label || "",
                section_label: f.section_label,
                key: f.key,
                label: f.label,
                field_type: f.field_type,
                dictionary: f.dictionary || null,
                required: f.required,
                help_text: f.help_text,
                depends_on_client_id: f.dependsOnClientId || null,
                depends_on_value: f.depends_on_value || "",
            })),
        };

        setSaving(true);
        try {
            const config = await authConfig();
            const res = isNew
                ? await api.post(apiEndpoints.noteTemplatesAdmin, payload, config)
                : await api.put(apiEndpoints.noteTemplateAdmin(code), payload, config);
            const data = res.data;
            setVersion(data.version);
            if (isNew) {
                setBanner({ severity: "success", text: `Template created (version ${data.version}).` });
            } else if (data.version_bumped) {
                setBanner({
                    severity: "info",
                    text: `Saved -- structural changes bumped this template to version ${data.version}. ${
                        data.signed_notes_count > 0
                            ? `${data.signed_notes_count} previously signed note(s) are unaffected -- they keep displaying exactly as signed.`
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
                    : "Couldn't save this template."
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
                Back to templates
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
                    <Grid item xs={12} sm={4}>
                        <TextField
                            label="Code"
                            value={code}
                            fullWidth
                            disabled={!isNew}
                            onChange={(e) => setCode(e.target.value)}
                            helperText={isNew ? "Stable machine key, e.g. 'discharge_note'" : "Locked once created"}
                        />
                    </Grid>
                    <Grid item xs={12} sm={5}>
                        <TextField label="Name" value={name} fullWidth onChange={(e) => setName(e.target.value)} />
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
                Fields ({fields.length})
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Drag the handle to reorder. A field can be shown only when another field has a
                particular value selected -- pick that under "Depends on".
            </Typography>

            {distinctSections.length > 0 && (
                <Paper variant="outlined" sx={{ p: 2, mb: 2 }}>
                    <Typography variant="subtitle2" sx={{ mb: 1 }}>
                        Move a whole section to a tab
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                        Long notes (e.g. a Review-of-Systems-heavy Admission Note) can be split
                        across tabs. Pick a section and give it a tab name to assign every field
                        in that section at once, instead of editing each field individually.
                    </Typography>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={4}>
                            <TextField
                                select
                                label="Section"
                                fullWidth
                                size="small"
                                value={bulkSection}
                                onChange={(e) => setBulkSection(e.target.value)}
                            >
                                <MenuItem value="">(choose a section)</MenuItem>
                                {distinctSections.map((s) => (
                                    <MenuItem key={s} value={s}>
                                        {s} ({fields.filter((f) => f.section_label === s).length} fields)
                                    </MenuItem>
                                ))}
                            </TextField>
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                label="Tab name"
                                fullWidth
                                size="small"
                                value={bulkTabName}
                                onChange={(e) => setBulkTabName(e.target.value)}
                                placeholder="e.g. Review of Systems"
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <Button
                                variant="outlined"
                                fullWidth
                                disabled={!bulkSection || !bulkTabName.trim()}
                                onClick={applyBulkTab}
                            >
                                Apply to all fields in this section
                            </Button>
                        </Grid>
                    </Grid>
                </Paper>
            )}

            {fields.map((f, index) => {
                const otherFields = fields.filter((of) => of.clientId !== f.clientId);
                const dependsOnField = fields.find((of) => of.clientId === f.dependsOnClientId);
                const dependsOnOptions = dependsOnField ? dictionaryOptionsFor(dependsOnField.dictionary) : [];
                return (
                    <Accordion
                        key={f.clientId}
                        draggable
                        onDragStart={handleDragStart(index)}
                        onDragOver={handleDragOver(index)}
                        onDrop={handleDrop(index)}
                        sx={{ mb: 1 }}
                    >
                        <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, width: "100%" }}>
                                <DragIndicatorIcon fontSize="small" sx={{ cursor: "grab", opacity: 0.5 }} />
                                {f.tab_label && <Chip size="small" color="secondary" label={f.tab_label} />}
                                {f.section_label && <Chip size="small" label={f.section_label} />}
                                <Typography sx={{ flexGrow: 1 }}>
                                    {f.label || <em>(untitled)</em>}{" "}
                                    <Typography component="span" variant="body2" color="text.secondary">
                                        ({f.key || "no key"})
                                    </Typography>
                                </Typography>
                                <Chip size="small" variant="outlined" label={f.field_type} />
                                {f.required && <Chip size="small" color="warning" label="required" />}
                                {f.dependsOnClientId && <Chip size="small" color="info" label="conditional" />}
                                <IconButton
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        removeField(f.clientId);
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
                                        label="Tab"
                                        fullWidth
                                        value={f.tab_label}
                                        onChange={(e) => updateField(f.clientId, { tab_label: e.target.value })}
                                        helperText="Optional -- groups sections onto a tab, e.g. 'Review of Systems'"
                                    />
                                </Grid>
                                <Grid item xs={12} sm={3}>
                                    <TextField
                                        label="Section"
                                        fullWidth
                                        value={f.section_label}
                                        onChange={(e) => updateField(f.clientId, { section_label: e.target.value })}
                                        helperText="Groups fields under a heading, e.g. 'History'"
                                    />
                                </Grid>
                                <Grid item xs={12} sm={3}>
                                    <TextField
                                        label="Key"
                                        fullWidth
                                        value={f.key}
                                        onChange={(e) => updateField(f.clientId, { key: e.target.value })}
                                        helperText="Stable id this value is stored under"
                                    />
                                </Grid>
                                <Grid item xs={12} sm={3}>
                                    <TextField
                                        label="Label"
                                        fullWidth
                                        value={f.label}
                                        onChange={(e) => updateField(f.clientId, { label: e.target.value })}
                                    />
                                </Grid>

                                <Grid item xs={12} sm={4}>
                                    <TextField
                                        select
                                        label="Field Type"
                                        fullWidth
                                        value={f.field_type}
                                        onChange={(e) => updateField(f.clientId, { field_type: e.target.value })}
                                    >
                                        {FIELD_TYPES.map((t) => (
                                            <MenuItem key={t.value} value={t.value}>
                                                {t.label}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>
                                {DICTIONARY_FIELD_TYPES.has(f.field_type) && (
                                    <Grid item xs={12} sm={4}>
                                        <TextField
                                            select
                                            label="Dictionary"
                                            fullWidth
                                            value={f.dictionary || ""}
                                            onChange={(e) =>
                                                updateField(f.clientId, { dictionary: e.target.value || null })
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
                                <Grid item xs={12} sm={4}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={f.required}
                                                onChange={(e) => updateField(f.clientId, { required: e.target.checked })}
                                            />
                                        }
                                        label="Required"
                                    />
                                </Grid>

                                <Grid item xs={12}>
                                    <TextField
                                        label="Help text"
                                        fullWidth
                                        value={f.help_text}
                                        onChange={(e) => updateField(f.clientId, { help_text: e.target.value })}
                                    />
                                </Grid>

                                <Grid item xs={12} sm={6}>
                                    <TextField
                                        select
                                        label="Depends on"
                                        fullWidth
                                        value={f.dependsOnClientId || ""}
                                        onChange={(e) =>
                                            updateField(f.clientId, {
                                                dependsOnClientId: e.target.value || null,
                                                depends_on_value: "",
                                            })
                                        }
                                        helperText="Only show this field when another field has a specific value"
                                    >
                                        <MenuItem value="">(always shown)</MenuItem>
                                        {otherFields.map((of) => (
                                            <MenuItem key={of.clientId} value={of.clientId}>
                                                {of.label || of.key} ({of.key})
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>
                                {f.dependsOnClientId && (
                                    <Grid item xs={12} sm={6}>
                                        {dependsOnOptions.length > 0 ? (
                                            <TextField
                                                select
                                                label="...with value"
                                                fullWidth
                                                value={f.depends_on_value}
                                                onChange={(e) =>
                                                    updateField(f.clientId, { depends_on_value: e.target.value })
                                                }
                                            >
                                                {dependsOnOptions.map((opt) => (
                                                    <MenuItem key={opt.value} value={opt.value}>
                                                        {opt.label}
                                                    </MenuItem>
                                                ))}
                                            </TextField>
                                        ) : (
                                            <TextField
                                                label="...with value"
                                                fullWidth
                                                value={f.depends_on_value}
                                                onChange={(e) =>
                                                    updateField(f.clientId, { depends_on_value: e.target.value })
                                                }
                                                helperText="Exact stored value to match"
                                            />
                                        )}
                                    </Grid>
                                )}
                            </Grid>
                        </AccordionDetails>
                    </Accordion>
                );
            })}

            <Button startIcon={<AddIcon />} onClick={addField} sx={{ mb: 3 }}>
                Add Field
            </Button>

            <Box sx={{ display: "flex", gap: 2 }}>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>
                    Save Template
                </Button>
            </Box>
        </Box>
    );
}

export default NoteTemplateEditor;
