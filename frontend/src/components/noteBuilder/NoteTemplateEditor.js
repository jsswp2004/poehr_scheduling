import { useEffect, useMemo, useRef, useState } from "react";
import {
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
    Tab,
    Tabs,
    TextField,
    Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import SaveIcon from "@mui/icons-material/Save";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";
import DynamicNoteForm from "../DynamicNoteForm";
import { describeCalc } from "../../utils/calculations";
import CalculationEditor, { blankCalc, calcProblems } from "../calc/CalculationEditor";
import { calcCandidates, formatApiError, suggestedTotalSources, uniqueKey } from "../calc/builderItems";

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
    { value: "calculated", label: "Calculated (total / result)" },
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
        calc: f.calc || {},
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
        calc: {},
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
function NoteTemplateEditor({ templateCode, onBack, onManageNoteTypes, kind = "note" }) {
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
    // Value of an item in the note_types dictionary ("" = not set). Only note templates have one.
    const [noteType, setNoteType] = useState("");
    // A new template starts on Details (it needs a code and name first); an existing one on Fields.
    const [tab, setTab] = useState(templateCode === null ? "details" : "fields");
    const [previewValues, setPreviewValues] = useState({});
    // The one field open for editing (the list shows every other field as a compact row).
    const [openFieldId, setOpenFieldId] = useState(null);

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
                setNoteType(tpl.note_type || "");

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
        const nf = blankField();
        setFields((prev) => [...prev, nf]);
        setOpenFieldId(nf.clientId);
    };

    // A calculated field (total / result) added after the current last field,
    // pre-set to add up the scored or numeric fields in the last field's section.
    const addCalculatedField = () => {
        const newId = nextTempId();
        setOpenFieldId(newId);
        setFields((prev) => {
            const section = prev.length ? prev[prev.length - 1].section_label : "";
            const tab = prev.length ? prev[prev.length - 1].tab_label : "";
            return [
                ...prev,
                {
                    ...blankField(),
                    clientId: newId,
                    tab_label: tab,
                    section_label: section,
                    key: uniqueKey("total_score", prev),
                    label: "Total score",
                    field_type: "calculated",
                    calc: { ...blankCalc(), sources: suggestedTotalSources(prev, section, dictionaries) },
                },
            ];
        });
    };

    // Switching a field to "Calculated" starts it as a total of the scored or
    // numeric fields above it in its section; switching away drops the
    // calculation. A calculated field is never typed in, so it is never required.
    const changeFieldType = (index, newType) => {
        setFields((prev) =>
            prev.map((f, i) => {
                if (i !== index) return f;
                if (newType === "calculated") {
                    const calc = f.calc && f.calc.operation
                        ? f.calc
                        : { ...blankCalc(), sources: suggestedTotalSources(prev.slice(0, index), f.section_label, dictionaries) };
                    return { ...f, field_type: newType, dictionary: null, required: false, calc };
                }
                return { ...f, field_type: newType, calc: {} };
            })
        );
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
        for (let i = 0; i < fields.length; i += 1) {
            const f = fields[i];
            if (DICTIONARY_FIELD_TYPES.has(f.field_type) && !f.dictionary) {
                setError(`Field "${f.label || f.key}" needs a dictionary (its type requires one).`);
                return;
            }
            if (f.field_type === "calculated") {
                const problem = calcProblems(f.calc, calcCandidates(fields, i, dictionaries));
                if (problem) {
                    setError(`Calculated field "${f.label || f.key}": ${problem}`);
                    return;
                }
            }
        }

        const payload = {
            code,
            name,
            is_active: isActive,
            // Only set when creating: a template's kind never changes afterwards.
            ...(isNew ? { kind } : {}),
            ...(kind === "note" ? { note_type: noteType } : {}),
            fields: fields.map((f) => ({
                client_id: f.clientId,
                tab_label: f.tab_label || "",
                section_label: f.section_label,
                key: f.key,
                label: f.label,
                field_type: f.field_type,
                dictionary: f.field_type === "calculated" ? null : f.dictionary || null,
                calc: f.field_type === "calculated" ? f.calc : {},
                required: f.field_type === "calculated" ? false : f.required,
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
            setError(formatApiError(e, "Couldn't save this template."));
        } finally {
            setSaving(false);
        }
    };

    const noteTypeItems = (dictionaries.find((d) => d.code === "note_types") || { items: [] }).items;
    const noteTypeLabel = (noteTypeItems.find((i) => i.value === noteType) || {}).label || "";

    // The in-progress template in the shape DynamicNoteForm renders, so the Preview tab shows
    // exactly what a clinician will see (nothing typed there is saved).
    const previewTemplate = useMemo(() => {
        const keyOf = (clientId) => (fields.find((f) => f.clientId === clientId) || {}).key || null;
        return {
            code,
            name,
            fields: fields.map((f, i) => ({
                id: f.clientId,
                key: f.key,
                label: f.label || f.key,
                field_type: f.field_type,
                tab_label: f.tab_label || "",
                section_label: f.section_label || "",
                required: f.field_type === "calculated" ? false : !!f.required,
                sort_order: i * 10,
                help_text: f.help_text || "",
                calc: f.calc || {},
                options: f.dictionary ? ((dictionaries.find((d) => d.id === f.dictionary) || {}).items || []) : [],
                depends_on_key: keyOf(f.dependsOnClientId),
                depends_on_value: f.depends_on_value || "",
            })),
        };
    }, [fields, dictionaries, code, name]);

    if (loading) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            {/* Pinned header: back, title, version, note type and Save stay put; only the tab content scrolls. */}
            <Box
                data-testid="editor-sticky-header"
                sx={{
                    position: "sticky",
                    top: 64,
                    zIndex: 5,
                    bgcolor: "background.paper",
                    borderBottom: 1,
                    borderColor: "divider",
                    mb: 2,
                    pt: 1,
                }}
            >
                <Button size="small" startIcon={<ArrowBackIcon />} onClick={onBack} sx={{ mb: 0.5 }}>
                    Back to templates
                </Button>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap", mb: 0.5 }}>
                    <Typography variant="h5" component="h2">
                        {name || (isNew ? "New template" : code)}
                    </Typography>
                    {version !== null && <Chip size="small" label={`v${version}`} />}
                    {kind === "note" && noteTypeLabel && <Chip size="small" color="primary" variant="outlined" label={noteTypeLabel} />}
                    <Box sx={{ flexGrow: 1 }} />
                    <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>
                        Save Template
                    </Button>
                </Box>
                <Tabs value={tab} onChange={(e, v) => setTab(v)}>
                    <Tab label={`Fields (${fields.length})`} value="fields" />
                    <Tab label="Preview" value="preview" />
                    <Tab label="Details" value="details" />
                </Tabs>
            </Box>

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

            {tab === "details" && (
                <Paper sx={{ p: 2, mb: 3 }}>
                    <Grid container spacing={2}>
                        <Grid size={{ xs: 12, sm: 3 }}>
                            <TextField
                                label="Code"
                                value={code}
                                fullWidth
                                disabled={!isNew}
                                onChange={(e) => setCode(e.target.value)}
                                helperText={isNew ? "Stable machine key, e.g. 'discharge_note'" : "Locked once created"}
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField label="Name" value={name} fullWidth onChange={(e) => setName(e.target.value)} />
                        </Grid>
                        {kind === "note" && (
                            <Grid size={{ xs: 12, sm: 3 }}>
                                <TextField
                                    select
                                    label="Note type"
                                    value={noteType}
                                    fullWidth
                                    onChange={(e) => setNoteType(e.target.value)}
                                    helperText={
                                        onManageNoteTypes ? (
                                            <Button size="small" onClick={onManageNoteTypes} sx={{ p: 0, minWidth: 0 }}>
                                                Manage note types
                                            </Button>
                                        ) : (
                                            "Values come from the Note types dictionary"
                                        )
                                    }
                                >
                                    <MenuItem value="">(not set)</MenuItem>
                                    {noteTypeItems.map((i) => (
                                        <MenuItem key={i.value} value={i.value}>
                                            {i.label}
                                        </MenuItem>
                                    ))}
                                </TextField>
                            </Grid>
                        )}
                        <Grid size={{ xs: 12, sm: 2 }}>
                            <FormControlLabel
                                control={<Checkbox checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />}
                                label="Active"
                            />
                        </Grid>
                    </Grid>
                </Paper>
            )}

            {tab === "preview" && (
                <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        This is how the form will look to the person writing the note. Nothing you type here is saved.
                    </Typography>
                    {fields.length === 0 ? (
                        <Typography variant="body2">No fields yet. Add some on the Fields tab.</Typography>
                    ) : (
                        <DynamicNoteForm
                            template={previewTemplate}
                            values={previewValues}
                            onChange={(key, value) => setPreviewValues((prev) => ({ ...prev, [key]: value }))}
                            disabled={false}
                        />
                    )}
                </Paper>
            )}

            {tab === "fields" && (
                <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Drag the handle to reorder. A field can be shown only when another field has a
                particular value selected -- pick that under "Depends on". A Calculated field (a
                total, score or result) is worked out automatically from the fields above it, so
                keep it below the fields it uses.
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
                        <Grid size={{ xs: 12, sm: 4 }}>
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
                        <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                                label="Tab name"
                                fullWidth
                                size="small"
                                value={bulkTabName}
                                onChange={(e) => setBulkTabName(e.target.value)}
                                placeholder="e.g. Review of Systems"
                            />
                        </Grid>
                        <Grid size={{ xs: 12, sm: 4 }}>
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

            {fields.length > 0 && (
                <Box
                    data-testid="field-list"
                    sx={{ border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden", bgcolor: "background.paper", mb: 2 }}
                >
                    {fields.map((f, index) => {
                        const otherFields = fields.filter((of) => of.clientId !== f.clientId);
                        const dependsOnField = fields.find((of) => of.clientId === f.dependsOnClientId);
                        const dependsOnOptions = dependsOnField ? dictionaryOptionsFor(dependsOnField.dictionary) : [];
                        const prevField = fields[index - 1];
                        const newGroup =
                            !prevField ||
                            (prevField.tab_label || "") !== (f.tab_label || "") ||
                            (prevField.section_label || "") !== (f.section_label || "");
                        const isOpen = openFieldId === f.clientId;
                        const typeLabel = (FIELD_TYPES.find((t) => t.value === f.field_type) || {}).label || f.field_type;
                        const dic = f.dictionary ? dictionaries.find((d) => d.id === f.dictionary) : null;
                        const detail =
                            f.field_type === "calculated"
                                ? describeCalc(f.calc)
                                : dependsOnField
                                ? `Shown if: ${dependsOnField.label || dependsOnField.key}`
                                : dic
                                ? `Dictionary: ${dic.code}`
                                : "";
                        return (
                            <Box key={f.clientId}>
                                {newGroup && (
                                    <Box
                                        sx={{
                                            px: 2.5,
                                            py: 0.75,
                                            bgcolor: "action.hover",
                                            borderBottom: 1,
                                            borderColor: "divider",
                                            fontSize: 12,
                                            fontWeight: 600,
                                            letterSpacing: "0.04em",
                                            textTransform: "uppercase",
                                            color: "text.secondary",
                                        }}
                                    >
                                        {f.tab_label ? `Tab: ${f.tab_label} \u00b7 ` : ""}Section: {f.section_label || "(none)"}
                                    </Box>
                                )}
                                <Box
                                    draggable
                                    onDragStart={handleDragStart(index)}
                                    onDragOver={handleDragOver(index)}
                                    onDrop={handleDrop(index)}
                                    sx={{
                                        display: "grid",
                                        gridTemplateColumns: { xs: "24px minmax(0, 1fr) 44px", md: "24px minmax(0, 3fr) 150px minmax(0, 2fr) 90px 44px" },
                                        gap: 1.5,
                                        alignItems: "center",
                                        px: 2.5,
                                        py: 0.5,
                                        borderBottom: 1,
                                        borderColor: "divider",
                                        bgcolor: isOpen ? "#f6f9ff" : undefined,
                                    }}
                                >
                                    <DragIndicatorIcon fontSize="small" sx={{ cursor: "grab", opacity: 0.5 }} />
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ fontWeight: 500 }} noWrap>
                                            {f.label || <em>(untitled)</em>}
                                        </Typography>
                                        <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                                            {f.key || "no key"}
                                        </Typography>
                                    </Box>
                                    <Typography variant="body2" color="text.secondary" sx={{ display: { xs: "none", md: "block" } }} noWrap>
                                        {typeLabel}
                                    </Typography>
                                    <Typography
                                        variant="body2"
                                        sx={{ display: { xs: "none", md: "block" }, color: dependsOnField || f.field_type === "calculated" ? "info.dark" : "text.secondary" }}
                                        noWrap
                                    >
                                        {detail}
                                    </Typography>
                                    <Box sx={{ display: { xs: "none", md: "block" } }}>
                                        {f.required && <Chip size="small" color="warning" label="Required" />}
                                    </Box>
                                    <IconButton
                                        aria-label={`${isOpen ? "Close" : "Edit"} ${f.label || f.key || "field"}`}
                                        aria-expanded={isOpen}
                                        onClick={() => setOpenFieldId(isOpen ? null : f.clientId)}
                                    >
                                        {isOpen ? <ExpandMoreIcon sx={{ transform: "rotate(180deg)" }} /> : <EditIcon fontSize="small" />}
                                    </IconButton>
                                </Box>
                                {isOpen && (
                                    <Box sx={{ p: 2.5, bgcolor: "#f6f9ff", borderTop: 2, borderTopColor: "primary.main", borderBottom: 1, borderBottomColor: "divider" }}>
                                        <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 2 }}>
                                            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                                                Editing: {f.label || f.key || "new field"}
                                            </Typography>
                                            <Button size="small" color="error" startIcon={<DeleteIcon fontSize="small" />} onClick={() => { removeField(f.clientId); setOpenFieldId(null); }}>
                                                Remove field
                                            </Button>
                                            <Button size="small" onClick={() => setOpenFieldId(null)}>
                                                Collapse
                                            </Button>
                                        </Box>
                            <Grid container spacing={2}>
                                <Grid size={{ xs: 12, sm: 3 }}>
                                    <TextField
                                        label="Tab"
                                        fullWidth
                                        value={f.tab_label}
                                        onChange={(e) => updateField(f.clientId, { tab_label: e.target.value })}
                                        helperText="Optional -- groups sections onto a tab, e.g. 'Review of Systems'"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 3 }}>
                                    <TextField
                                        label="Section"
                                        fullWidth
                                        value={f.section_label}
                                        onChange={(e) => updateField(f.clientId, { section_label: e.target.value })}
                                        helperText="Groups fields under a heading, e.g. 'History'"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 3 }}>
                                    <TextField
                                        label="Key"
                                        fullWidth
                                        value={f.key}
                                        onChange={(e) => updateField(f.clientId, { key: e.target.value })}
                                        helperText="Stable id this value is stored under"
                                    />
                                </Grid>
                                <Grid size={{ xs: 12, sm: 3 }}>
                                    <TextField
                                        label="Label"
                                        fullWidth
                                        value={f.label}
                                        onChange={(e) => updateField(f.clientId, { label: e.target.value })}
                                    />
                                </Grid>

                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <TextField
                                        select
                                        label="Field Type"
                                        fullWidth
                                        value={f.field_type}
                                        onChange={(e) => changeFieldType(index, e.target.value)}
                                    >
                                        {FIELD_TYPES.map((t) => (
                                            <MenuItem key={t.value} value={t.value}>
                                                {t.label}
                                            </MenuItem>
                                        ))}
                                    </TextField>
                                </Grid>
                                {DICTIONARY_FIELD_TYPES.has(f.field_type) && (
                                    <Grid size={{ xs: 12, sm: 4 }}>
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
                                <Grid size={{ xs: 12, sm: 4 }}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={f.required && f.field_type !== "calculated"}
                                                disabled={f.field_type === "calculated"}
                                                onChange={(e) => updateField(f.clientId, { required: e.target.checked })}
                                            />
                                        }
                                        label="Required"
                                    />
                                </Grid>

                                <Grid size={12}>
                                    <TextField
                                        label="Help text"
                                        fullWidth
                                        value={f.help_text}
                                        onChange={(e) => updateField(f.clientId, { help_text: e.target.value })}
                                    />
                                </Grid>

                                <Grid size={{ xs: 12, sm: 6 }}>
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
                                    <Grid size={{ xs: 12, sm: 6 }}>
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
                            {f.field_type === "calculated" && (
                                <Box sx={{ mt: 2 }}>
                                    <CalculationEditor
                                        calc={f.calc}
                                        candidates={calcCandidates(fields, index, dictionaries)}
                                        onChange={(calc) => updateField(f.clientId, { calc })}
                                    />
                                </Box>
                            )}
                                    </Box>
                                )}
                            </Box>
                        );
                    })}
                </Box>
            )}

            <Button startIcon={<AddIcon />} onClick={addField} sx={{ mb: 3 }}>
                Add Field
            </Button>
            <Button startIcon={<AddIcon />} onClick={addCalculatedField} sx={{ mb: 3, ml: 1 }}>
                Add Calculated Field (total / result)
            </Button>

                </Box>
            )}
        </Box>
    );
}

export default NoteTemplateEditor;
