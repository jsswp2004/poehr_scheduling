import { useEffect, useMemo, useState } from "react";
import {
    Accordion,
    AccordionSummary,
    AccordionDetails,
    Alert,
    Box,
    Button,
    Chip,
    CircularProgress,
    Grid,
    IconButton,
    InputAdornment,
    Paper,
    TextField,
    Typography,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SaveIcon from "@mui/icons-material/Save";
import SearchIcon from "@mui/icons-material/Search";
import ClearIcon from "@mui/icons-material/Clear";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";

// The shared `api` axios instance carries no Authorization header of its
// own (App.js's interceptors are only wired to the default `axios` import,
// not this instance) -- every call site attaches its own token, matching
// the pattern used by useDoctorsData/useOrganizationsData/etc.
const authConfig = async () => ({ headers: { Authorization: `Bearer ${await getValidToken()}` } });

// How many (non-pinned) dictionaries to render at once; "Show more" adds another page.
const PAGE_SIZE = 50;

const norm = (v) => String(v == null ? "" : v).toLowerCase();

/**
 * Search match for one dictionary. Every whitespace-separated term must be
 * found somewhere in the dictionary's name / code / description or in any
 * option's label or stored value (case-insensitive). Returns null when it
 * doesn't match, otherwise { optionHits } -- the labels of options that
 * satisfied a term the header text didn't, so the list can say *why* a
 * dictionary matched when it was an option rather than the name.
 */
const matchDictionary = (dic, terms) => {
    if (terms.length === 0) return { optionHits: [] };
    const head = norm(`${dic.name} ${dic.code} ${dic.description}`);
    const options = (dic.items || []).map((it) => ({
        shown: it.label || it.value,
        text: norm(`${it.label} ${it.value}`),
    }));
    const optionHits = [];
    for (const term of terms) {
        if (head.includes(term)) continue;
        const hit = options.find((o) => o.text.includes(term));
        if (!hit) return null;
        if (!optionHits.includes(hit.shown)) optionHits.push(hit.shown);
    }
    return { optionHits };
};

let tempIdCounter = 0;
const nextTempId = () => `temp-${Date.now()}-${tempIdCounter++}`;

/**
 * A single dictionary's editor: name/description plus its item list
 * (value/label/sort_order rows), expanded inline in the accordion.
 * Un-saved edits live only in local state until "Save" is clicked.
 */
function DictionaryEditor({ dictionary, onSaved, onDeleted }) {
    const [code, setCode] = useState(dictionary.code);
    const [name, setName] = useState(dictionary.name);
    const [description, setDescription] = useState(dictionary.description || "");
    const [items, setItems] = useState(
        dictionary.items.map((i) => ({ ...i, _key: i.id }))
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const addItem = () => {
        setItems((prev) => [
            ...prev,
            { _key: nextTempId(), value: "", label: "", sort_order: prev.length },
        ]);
    };

    const updateItem = (key, field, value) => {
        setItems((prev) => prev.map((it) => (it._key === key ? { ...it, [field]: value } : it)));
    };

    const removeItem = (key) => {
        setItems((prev) => prev.filter((it) => it._key !== key));
    };

    const save = async () => {
        setError("");
        if (!dictionary.isNew && items.length === 0) {
            setError("A dictionary needs at least one option.");
            return;
        }
        setSaving(true);
        const payload = {
            code,
            name,
            description,
            items: items.map((it, idx) => ({
                ...(typeof it.id === "number" ? { id: it.id } : {}),
                value: it.value,
                label: it.label,
                sort_order: idx,
            })),
        };
        try {
            const config = await authConfig();
            if (dictionary.isNew) {
                const res = await api.post(apiEndpoints.dictionariesAdmin, payload, config);
                onSaved(res.data);
            } else {
                const res = await api.put(apiEndpoints.dictionaryAdmin(dictionary.id), payload, config);
                onSaved(res.data);
            }
        } catch (e) {
            const detail = e?.response?.data;
            setError(
                typeof detail === "string"
                    ? detail
                    : JSON.stringify(detail) || "Couldn't save this dictionary."
            );
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        if (!window.confirm(`Delete dictionary "${dictionary.name}"?`)) return;
        if (dictionary.isNew) {
            onDeleted();
            return;
        }
        try {
            await api.delete(apiEndpoints.dictionaryAdmin(dictionary.id), await authConfig());
            onDeleted();
        } catch (e) {
            const detail = e?.response?.data?.detail;
            setError(detail || "Couldn't delete this dictionary -- it's likely still in use.");
        }
    };

    return (
        <Box sx={{ p: 1 }}>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
                    {error}
                </Alert>
            )}
            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                        label="Code"
                        value={code}
                        fullWidth
                        disabled={!dictionary.isNew}
                        onChange={(e) => setCode(e.target.value)}
                        helperText={dictionary.isNew ? "Stable machine key, e.g. 'allergy_severity'" : "Locked once created"}
                    />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField label="Name" value={name} fullWidth onChange={(e) => setName(e.target.value)} />
                </Grid>
                <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                        label="Description"
                        value={description}
                        fullWidth
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </Grid>
            </Grid>

            <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
                Options
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                To use this list in a calculated total (for example a PHQ-9 score), make each stored value its
                score: 0, 1, 2, 3. The label is what people see.
            </Typography>
            {items.map((it) => (
                <Grid container spacing={1} key={it._key} sx={{ mb: 1 }} alignItems="center">
                    <Grid size={{ xs: 5, sm: 4 }}>
                        <TextField
                            label="Value (stored)"
                            size="small"
                            fullWidth
                            value={it.value}
                            onChange={(e) => updateItem(it._key, "value", e.target.value)}
                        />
                    </Grid>
                    <Grid size={{ xs: 5, sm: 5 }}>
                        <TextField
                            label="Label (shown)"
                            size="small"
                            fullWidth
                            value={it.label}
                            onChange={(e) => updateItem(it._key, "label", e.target.value)}
                        />
                    </Grid>
                    <Grid size={{ xs: 2, sm: 2 }}>
                        <IconButton size="small" onClick={() => removeItem(it._key)}>
                            <DeleteIcon fontSize="small" />
                        </IconButton>
                    </Grid>
                </Grid>
            ))}
            <Button size="small" startIcon={<AddIcon />} onClick={addItem} sx={{ mb: 2 }}>
                Add Option
            </Button>

            <Box sx={{ display: "flex", gap: 1 }}>
                <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={saving}>
                    Save
                </Button>
                <Button color="error" onClick={remove} disabled={saving}>
                    Delete Dictionary
                </Button>
            </Box>
        </Box>
    );
}

/**
 * Manages the shared Dictionary/DictionaryItem option lists that
 * radio/dropdown/multiselect fields point to across every template. Backs
 * the "Dictionaries" tab of the note-builder configuration UI.
 */
function DictionaryManager() {
    const [dictionaries, setDictionaries] = useState(null);
    const [error, setError] = useState("");
    const [search, setSearch] = useState("");
    const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
    // Open accordions (and unsaved "New Dictionary" rows) are pinned: they stay
    // on screen whatever the search says, so typing in the box can never hide
    // a dictionary you're in the middle of editing.
    const [expanded, setExpanded] = useState({});

    const load = async () => {
        setError("");
        try {
            const res = await api.get(apiEndpoints.dictionariesAdmin, await authConfig());
            setDictionaries(res.data);
        } catch (e) {
            setError("Couldn't load dictionaries.");
        }
    };

    useEffect(() => {
        load();
    }, []);

    const addNew = () => {
        setDictionaries((prev) => [
            {
                id: nextTempId(),
                isNew: true,
                code: "",
                name: "New Dictionary",
                description: "",
                items: [],
                usage_count: 0,
            },
            ...(prev || []),
        ]);
    };

    const terms = useMemo(() => norm(search).split(/\s+/).filter(Boolean), [search]);

    const { rows, matchTotal, hiddenCount } = useMemo(() => {
        const out = [];
        let matchTotal = 0;
        let unpinnedShown = 0;
        let hiddenCount = 0;
        for (const dic of dictionaries || []) {
            const m = matchDictionary(dic, terms);
            if (m) matchTotal += 1;
            const pinned = dic.isNew || expanded[dic.id];
            if (!m && !pinned) continue;
            if (!pinned) {
                if (unpinnedShown >= visibleCount) {
                    hiddenCount += 1;
                    continue;
                }
                unpinnedShown += 1;
            }
            out.push({ dic, optionHits: m ? m.optionHits : [] });
        }
        return { rows: out, matchTotal, hiddenCount };
    }, [dictionaries, terms, expanded, visibleCount]);

    const updateSearch = (value) => {
        setSearch(value);
        setVisibleCount(PAGE_SIZE);
    };

    if (dictionaries === null && !error) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
                    {error}
                </Alert>
            )}
            <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
                <TextField
                    size="small"
                    fullWidth
                    value={search}
                    onChange={(e) => updateSearch(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Escape") updateSearch("");
                    }}
                    placeholder="Search by name, code, or option -- e.g. allergy, severity, mild"
                    slotProps={{
                        htmlInput: { "aria-label": "Search dictionaries" },
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" />
                                </InputAdornment>
                            ),
                            endAdornment: search ? (
                                <InputAdornment position="end">
                                    <IconButton size="small" aria-label="Clear search" onClick={() => updateSearch("")}>
                                        <ClearIcon fontSize="small" />
                                    </IconButton>
                                </InputAdornment>
                            ) : null,
                        },
                    }}
                />
                <Button variant="contained" startIcon={<AddIcon />} onClick={addNew} sx={{ flexShrink: 0 }}>
                    New Dictionary
                </Button>
            </Box>
            {dictionaries && dictionaries.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
                    {terms.length > 0
                        ? `${matchTotal} of ${dictionaries.filter((d) => !d.isNew).length} dictionaries match`
                        : `${dictionaries.filter((d) => !d.isNew).length} dictionaries`}
                </Typography>
            )}
            {rows.map(({ dic, optionHits }) => (
                <Accordion
                    key={dic.id}
                    expanded={!!expanded[dic.id]}
                    onChange={(_, isOpen) => setExpanded((prev) => ({ ...prev, [dic.id]: isOpen }))}
                >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 2, width: "100%" }}>
                            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                                <Typography>
                                    {dic.name} <code style={{ opacity: 0.6 }}>({dic.code || "unsaved"})</code>
                                </Typography>
                                {optionHits.length > 0 && (
                                    <Typography variant="caption" color="text.secondary" noWrap sx={{ display: "block" }}>
                                        Matching option{optionHits.length > 1 ? "s" : ""}: {optionHits.slice(0, 3).join(", ")}
                                        {optionHits.length > 3 ? ", ..." : ""}
                                    </Typography>
                                )}
                            </Box>
                            <Chip size="small" label={`${dic.items.length} options`} />
                            {dic.usage_count > 0 && (
                                <Chip size="small" color="info" label={`used by ${dic.usage_count} field(s)`} />
                            )}
                        </Box>
                    </AccordionSummary>
                    <AccordionDetails>
                        <DictionaryEditor
                            dictionary={dic}
                            onSaved={() => load()}
                            onDeleted={() => load()}
                        />
                    </AccordionDetails>
                </Accordion>
            ))}
            {hiddenCount > 0 && (
                <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
                    <Button onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
                        Show more ({hiddenCount} more)
                    </Button>
                </Box>
            )}
            {dictionaries && dictionaries.length > 0 && terms.length > 0 && matchTotal === 0 && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                        No dictionaries match "{search.trim()}".{" "}
                        <Button size="small" onClick={() => updateSearch("")}>
                            Clear search
                        </Button>
                    </Typography>
                </Paper>
            )}
            {dictionaries && dictionaries.length === 0 && (
                <Paper sx={{ p: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                        No dictionaries yet -- click "New Dictionary" to create the first option list.
                    </Typography>
                </Paper>
            )}
        </Box>
    );
}

export default DictionaryManager;
