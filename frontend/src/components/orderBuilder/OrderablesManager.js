import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Alert,
    Box,
    Button,
    Checkbox,
    Chip,
    CircularProgress,
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    FormControl,
    FormControlLabel,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    Paper,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import SearchIcon from "@mui/icons-material/Search";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { jwtDecode } from "jwt-decode";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { FREQUENCY_OPTIONS } from "../tasks/taskShared";
import {
    CATEGORIES,
    CODE_SYSTEMS,
    PRIORITIES,
    authConfig,
    errorText,
    labelOf,
    listOf,
    saveCsv,
} from "./builderCommon";

const PAGE_SIZE = 50;

const EMPTY = {
    id: null,
    code: "",
    name: "",
    category: "laboratory",
    code_system: "local",
    external_code: "",
    description: "",
    default_priority: "routine",
    requires_cosign: false,
    creates_tasks: null,
    default_frequency: "",
    detail_template: "",
    is_active: true,
};

const TASK_CHOICES = [
    { value: "auto", label: "Automatic (medications yes; nursing only when given a frequency)" },
    { value: "yes", label: "Always make nurse tasks" },
    { value: "no", label: "Never make nurse tasks" },
];
const tasksToChoice = (v) => (v === true ? "yes" : v === false ? "no" : "auto");
const choiceToTasks = (v) => (v === "yes" ? true : v === "no" ? false : null);

function OrderableDialog({ initial, forms, locked, onClose, onSaved }) {
    const isNew = !initial.id;
    const [form, setForm] = useState({ ...EMPTY, ...initial, detail_template: initial.detail_template || "" });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

    const save = async () => {
        setError("");
        if (!form.code.trim() || !form.name.trim()) {
            setError("Code and name are required.");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                code: form.code.trim(),
                name: form.name.trim(),
                category: form.category,
                code_system: form.code_system,
                external_code: form.external_code.trim(),
                description: form.description,
                default_priority: form.default_priority,
                requires_cosign: form.requires_cosign,
                creates_tasks: form.creates_tasks,
                default_frequency: form.default_frequency || "",
                detail_template: form.detail_template || null,
                is_active: form.is_active,
            };
            const config = await authConfig();
            if (isNew) await api.post(apiEndpoints.orderablesAdmin, payload, config);
            else await api.patch(apiEndpoints.orderableAdmin(form.id), payload, config);
            onSaved(isNew ? `Added "${payload.name}".` : `Saved "${payload.name}".`);
        } catch (e) {
            setError(errorText(e, "Couldn't save that orderable."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="sm">
            <DialogTitle>{isNew ? "New orderable" : `Edit: ${initial.name}`}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}
                    {locked && (
                        <Alert severity="info">
                            This entry is shared by all organizations. Only a system administrator can change it.
                        </Alert>
                    )}
                    <Stack direction="row" spacing={2}>
                        <TextField
                            label="Code"
                            size="small"
                            value={form.code}
                            onChange={set("code")}
                            disabled={!isNew || locked}
                            helperText="Stable key, e.g. cbc_with_diff"
                            sx={{ flex: 1 }}
                        />
                        <TextField
                            label="Name"
                            size="small"
                            value={form.name}
                            onChange={set("name")}
                            disabled={locked}
                            sx={{ flex: 2 }}
                        />
                    </Stack>
                    <Stack direction="row" spacing={2}>
                        <FormControl size="small" sx={{ flex: 1 }} disabled={locked}>
                            <InputLabel id="ob-cat">Category</InputLabel>
                            <Select labelId="ob-cat" label="Category" value={form.category} onChange={set("category")}>
                                {CATEGORIES.map((c) => (
                                    <MenuItem key={c.value} value={c.value}>
                                        {c.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <FormControl size="small" sx={{ flex: 1 }} disabled={locked}>
                            <InputLabel id="ob-prio">Default priority</InputLabel>
                            <Select
                                labelId="ob-prio"
                                label="Default priority"
                                value={form.default_priority}
                                onChange={set("default_priority")}
                            >
                                {PRIORITIES.map((c) => (
                                    <MenuItem key={c.value} value={c.value}>
                                        {c.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Stack>
                    <Stack direction="row" spacing={2}>
                        <FormControl size="small" sx={{ flex: 1 }} disabled={locked}>
                            <InputLabel id="ob-sys">Code system</InputLabel>
                            <Select labelId="ob-sys" label="Code system" value={form.code_system} onChange={set("code_system")}>
                                {CODE_SYSTEMS.map((c) => (
                                    <MenuItem key={c.value} value={c.value}>
                                        {c.label}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label="Code in that system"
                            size="small"
                            value={form.external_code}
                            onChange={set("external_code")}
                            disabled={locked}
                            helperText={form.code_system === "cpt" ? "CPT codes are entered by your clinic" : "e.g. the LOINC code"}
                            sx={{ flex: 1 }}
                        />
                    </Stack>
                    <TextField
                        label="Description"
                        size="small"
                        multiline
                        minRows={2}
                        value={form.description}
                        onChange={set("description")}
                        disabled={locked}
                    />
                    <FormControl size="small" disabled={locked}>
                        <InputLabel id="ob-form">Detail form (questions asked when ordering)</InputLabel>
                        <Select
                            labelId="ob-form"
                            label="Detail form (questions asked when ordering)"
                            value={form.detail_template}
                            onChange={set("detail_template")}
                        >
                            <MenuItem value="">
                                <em>None</em>
                            </MenuItem>
                            {forms.map((f) => (
                                <MenuItem key={f.id} value={f.id}>
                                    {f.name} ({f.code})
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                    {["medication", "nursing", "other", "procedure"].includes(form.category) && (
                        <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                            <FormControl size="small" fullWidth>
                                <InputLabel id="ob-tasks">Nurse tasks</InputLabel>
                                <Select
                                    labelId="ob-tasks"
                                    label="Nurse tasks"
                                    value={tasksToChoice(form.creates_tasks)}
                                    disabled={locked}
                                    onChange={(e) => setForm((f) => ({ ...f, creates_tasks: choiceToTasks(e.target.value) }))}
                                    inputProps={{ "data-testid": "ob-tasks" }}
                                >
                                    {TASK_CHOICES.map((c) => (
                                        <MenuItem key={c.value} value={c.value}>
                                            {c.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <FormControl size="small" sx={{ minWidth: 220 }}>
                                <InputLabel id="ob-freq">Usual frequency</InputLabel>
                                <Select
                                    labelId="ob-freq"
                                    label="Usual frequency"
                                    value={form.default_frequency || ""}
                                    disabled={locked}
                                    onChange={set("default_frequency")}
                                    inputProps={{ "data-testid": "ob-frequency" }}
                                >
                                    <MenuItem value="">
                                        <em>None</em>
                                    </MenuItem>
                                    {FREQUENCY_OPTIONS.map((f) => (
                                        <MenuItem key={f.value} value={f.value}>
                                            {f.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Stack>
                    )}
                    <Stack direction="row" spacing={2}>
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={form.requires_cosign}
                                    disabled={locked}
                                    onChange={(e) => setForm((f) => ({ ...f, requires_cosign: e.target.checked }))}
                                />
                            }
                            label="Always requires a cosign"
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={form.is_active}
                                    disabled={locked}
                                    onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                                />
                            }
                            label="Active"
                        />
                    </Stack>
                </Stack>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button variant="contained" onClick={save} disabled={saving || locked}>
                    Save
                </Button>
            </DialogActions>
        </Dialog>
    );
}

/**
 * The orderables catalog: search/filter, add/edit, and CSV upload/download.
 * Entries shared by all organizations are shown but only a system
 * administrator can change them (the server enforces that too).
 */
function OrderablesManager() {
    const [items, setItems] = useState(null);
    const [forms, setForms] = useState([]);
    const [error, setError] = useState("");
    const [banner, setBanner] = useState(null);
    const [uploadErrors, setUploadErrors] = useState([]);
    const [uploading, setUploading] = useState(false);
    const [search, setSearch] = useState("");
    const [category, setCategory] = useState("");
    const [limit, setLimit] = useState(PAGE_SIZE);
    const [editing, setEditing] = useState(null);
    const fileRef = useRef(null);

    const isSystemAdmin = useMemo(() => {
        try {
            return jwtDecode(localStorage.getItem("access_token")).role === "system_admin";
        } catch (e) {
            return false;
        }
    }, []);

    const load = useCallback(async () => {
        setError("");
        try {
            const config = await authConfig();
            const [o, f] = await Promise.all([
                api.get(apiEndpoints.orderablesAdmin, config),
                api.get(apiEndpoints.noteTemplatesAdmin, config),
            ]);
            setItems(listOf(o));
            setForms(listOf(f).filter((t) => t.kind === "order_detail" && t.is_active));
        } catch (e) {
            setError(errorText(e, "Couldn't load the catalog."));
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
        return (items || []).filter((o) => {
            if (category && o.category !== category) return false;
            const hay = `${o.name} ${o.code} ${o.external_code} ${o.description}`.toLowerCase();
            return terms.every((t) => hay.includes(t));
        });
    }, [items, search, category]);

    useEffect(() => setLimit(PAGE_SIZE), [search, category]);

    const formName = (id) => (forms.find((f) => f.id === id) || {}).name || "";
    const locked = (o) => o.organization === null && !isSystemAdmin;

    const download = async (url, name) => {
        setError("");
        try {
            await saveCsv(url, name);
        } catch (e) {
            let detail = "";
            try {
                detail = JSON.parse(await e.response.data.text()).detail;
            } catch (_) {
                /* none */
            }
            setError(detail || "Couldn't download the CSV.");
        }
    };

    const upload = async (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = "";
        if (!file) return;
        setError("");
        setBanner(null);
        setUploadErrors([]);
        setUploading(true);
        try {
            const body = new FormData();
            body.append("file", file);
            const res = await api.post(apiEndpoints.orderablesUploadCsv, body, await authConfig());
            setBanner({
                severity: "success",
                text: `Uploaded: ${res.data.created} added, ${res.data.updated} updated.`,
            });
            load();
        } catch (e) {
            const data = e?.response?.data;
            if (data && Array.isArray(data.errors)) {
                setUploadErrors(data.errors);
                setError(data.detail || "The CSV has problems. Nothing was saved.");
            } else {
                const code = e?.response?.status;
                setError(
                    errorText(
                        e,
                        code
                            ? `Couldn't upload that CSV (the server answered ${code}). Try 500 rows or fewer at a time, and check the file for unusual characters.`
                            : "Couldn't reach the server to upload that CSV. Check your connection and try again, or upload fewer rows."
                    )
                );
            }
        } finally {
            setUploading(false);
        }
    };

    const remove = async (o) => {
        if (!window.confirm(`Delete "${o.name}"? An orderable that has been ordered can only be deactivated.`)) return;
        try {
            await api.delete(apiEndpoints.orderableAdmin(o.id), await authConfig());
            setBanner({ severity: "success", text: `Deleted "${o.name}".` });
            load();
        } catch (e) {
            setError(errorText(e, "Couldn't delete that orderable."));
        }
    };

    const toggleActive = async (o) => {
        try {
            await api.patch(apiEndpoints.orderableAdmin(o.id), { is_active: !o.is_active }, await authConfig());
            load();
        } catch (e) {
            setError(errorText(e, "Couldn't change that orderable."));
        }
    };

    if (items === null && !error) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    const shown = filtered.slice(0, limit);

    return (
        <Box>
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
            {uploadErrors.length > 0 && (
                <Paper variant="outlined" sx={{ mb: 2, maxHeight: 280, overflow: "auto" }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell sx={{ width: 70 }}>Row</TableCell>
                                <TableCell sx={{ width: 170 }}>Column</TableCell>
                                <TableCell>Problem</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {uploadErrors.map((e, i) => (
                                <TableRow key={i}>
                                    <TableCell>{e.row ? e.row : "File"}</TableCell>
                                    <TableCell>{e.column || "-"}</TableCell>
                                    <TableCell>{e.message}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}

            <Stack direction={{ xs: "column", md: "row" }} spacing={1} justifyContent="space-between" sx={{ mb: 2 }}>
                <Stack direction="row" spacing={1} sx={{ flex: 1 }}>
                    <TextField
                        size="small"
                        placeholder="Search name, code, description..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        sx={{ flex: 1, maxWidth: 420 }}
                        slotProps={{
                            input: {
                                startAdornment: (
                                    <InputAdornment position="start">
                                        <SearchIcon fontSize="small" />
                                    </InputAdornment>
                                ),
                            },
                        }}
                    />
                    <FormControl size="small" sx={{ minWidth: 160 }}>
                        <InputLabel id="ob-filter-cat">Category</InputLabel>
                        <Select
                            labelId="ob-filter-cat"
                            label="Category"
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                        >
                            <MenuItem value="">All</MenuItem>
                            {CATEGORIES.map((c) => (
                                <MenuItem key={c.value} value={c.value}>
                                    {c.label}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                </Stack>
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    <Button
                        variant="outlined"
                        startIcon={<FileDownloadIcon />}
                        onClick={() => download(apiEndpoints.orderablesSampleCsv, "orderables_upload_template.csv")}
                    >
                        Sample CSV
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<FileDownloadIcon />}
                        onClick={() => download(apiEndpoints.orderablesDownloadCsv, "orderables.csv")}
                    >
                        Download mine
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={uploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
                        onClick={() => fileRef.current && fileRef.current.click()}
                        disabled={uploading}
                    >
                        Upload CSV
                    </Button>
                    <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={upload} />
                    <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({ ...EMPTY })}>
                        New orderable
                    </Button>
                </Stack>
            </Stack>

            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Category</TableCell>
                            <TableCell>Code</TableCell>
                            <TableCell>Detail form</TableCell>
                            <TableCell align="center">Cosign</TableCell>
                            <TableCell align="center">Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {shown.map((o) => (
                            <TableRow key={o.id} hover>
                                <TableCell>
                                    {o.name}
                                    {o.organization === null && (
                                        <Chip size="small" label="Shared" variant="outlined" sx={{ ml: 1 }} />
                                    )}
                                    <Typography variant="caption" display="block" color="text.secondary">
                                        <code>{o.code}</code>
                                    </Typography>
                                </TableCell>
                                <TableCell>{labelOf(CATEGORIES, o.category)}</TableCell>
                                <TableCell>
                                    {o.external_code ? `${labelOf(CODE_SYSTEMS, o.code_system).split(" (")[0]} ${o.external_code}` : "-"}
                                </TableCell>
                                <TableCell>{o.detail_template ? formName(o.detail_template) || "Yes" : "-"}</TableCell>
                                <TableCell align="center">{o.requires_cosign ? "Yes" : "-"}</TableCell>
                                <TableCell align="center">
                                    <Chip
                                        size="small"
                                        label={o.is_active ? "Active" : "Inactive"}
                                        color={o.is_active ? "success" : "default"}
                                        onClick={locked(o) ? undefined : () => toggleActive(o)}
                                        sx={{ cursor: locked(o) ? "default" : "pointer" }}
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <Tooltip title={locked(o) ? "View" : "Edit"}>
                                        <IconButton size="small" onClick={() => setEditing(o)}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    {!locked(o) && (
                                        <Tooltip title="Delete">
                                            <IconButton size="small" onClick={() => remove(o)}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {filtered.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7}>
                                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                        {(items || []).length === 0
                                            ? 'No orderables yet. Click "New orderable", or download the sample CSV, fill it in and upload it.'
                                            : "Nothing matches that search."}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
            {filtered.length > shown.length && (
                <Box sx={{ textAlign: "center", mt: 2 }}>
                    <Button onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                        Show more ({filtered.length - shown.length} more)
                    </Button>
                </Box>
            )}

            {editing && (
                <OrderableDialog
                    initial={editing}
                    forms={forms}
                    locked={editing.id && locked(editing)}
                    onClose={() => setEditing(null)}
                    onSaved={(text) => {
                        setEditing(null);
                        setBanner({ severity: "success", text });
                        load();
                    }}
                />
            )}
        </Box>
    );
}

export default OrderablesManager;
