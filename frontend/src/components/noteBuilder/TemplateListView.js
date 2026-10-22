import { useEffect, useRef, useState } from "react";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    InputAdornment,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography,
    Alert,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import SearchIcon from "@mui/icons-material/Search";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";

// The shared `api` axios instance carries no Authorization header of its
// own (App.js's interceptors are only wired to the default `axios` import,
// not this instance) -- every call site attaches its own token, matching
// the pattern used by useDoctorsData/useOrganizationsData/etc.
const authConfig = async () => ({ headers: { Authorization: `Bearer ${await getValidToken()}` } });

/**
 * Lists every NoteTemplate (active and inactive) for the note-builder
 * configuration UI, with entry points to edit an existing one or start a
 * new one. Deactivating/deleting happens here too -- deleting is blocked
 * server-side (400) whenever the template has any notes on file, in which
 * case this offers to deactivate it instead.
 *
 * CSV: "Download Sample CSV" gives the ready-to-edit upload template (the
 * Admission Note), each row has a download icon that exports that template
 * in the same format, and "Upload CSV" creates or updates a template from a
 * file. The server validates the whole file first and saves nothing unless
 * every row is valid; problems come back as a list of {row, column,
 * message} that is shown below. See appointments/note_template_csv.py for
 * the format.
 */
// Soft badge colours for note types, cycled by the type's position in the dictionary.
const TYPE_COLORS = [
    { bg: "#e6f4ea", fg: "#14532d" },
    { bg: "#fdecec", fg: "#991b1b" },
    { bg: "#f1ecfb", fg: "#4c1d95" },
    { bg: "#e8efff", fg: "#1e40af" },
    { bg: "#fff4d6", fg: "#7a4b00" },
    { bg: "#e0f4f4", fg: "#0f4c5c" },
];
const NO_TYPE = "__none__";

function TemplateListView({ onEdit, onNew, onManageNoteTypes, kind = "note" }) {
    const isOrderForm = kind === "order_detail";
    const [noteTypes, setNoteTypes] = useState([]);
    const [typeFilter, setTypeFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [templates, setTemplates] = useState(null);
    const [error, setError] = useState("");
    const [busyCode, setBusyCode] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [banner, setBanner] = useState(null);
    const [uploadErrors, setUploadErrors] = useState([]);
    const fileInputRef = useRef(null);

    // Downloads go through axios (not a plain link) so the auth header is sent.
    const saveCsv = async (url, fallbackName) => {
        setError("");
        try {
            const res = await api.get(url, { ...(await authConfig()), responseType: "blob" });
            const disposition = (res.headers && res.headers["content-disposition"]) || "";
            const match = /filename="?([^";]+)"?/i.exec(disposition);
            const blobUrl = window.URL.createObjectURL(new Blob([res.data], { type: "text/csv" }));
            const link = document.createElement("a");
            link.href = blobUrl;
            link.download = match ? match[1] : fallbackName;
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(blobUrl);
        } catch (e) {
            // With responseType "blob" an error body arrives as a Blob -- read its JSON detail.
            let detail = "";
            try {
                detail = JSON.parse(await e.response.data.text()).detail;
            } catch (_) {
                /* no readable detail */
            }
            setError(detail || "Couldn't download the CSV.");
        }
    };

    const handleUploadFile = async (event) => {
        const file = event.target.files && event.target.files[0];
        event.target.value = ""; // so picking the same file again still fires onChange
        if (!file) return;
        setError("");
        setBanner(null);
        setUploadErrors([]);
        setUploading(true);
        try {
            const form = new FormData();
            form.append("file", file);
            const res = await api.post(
                isOrderForm ? `${apiEndpoints.noteTemplatesUploadCsv}?kind=order_detail` : apiEndpoints.noteTemplatesUploadCsv,
                form,
                await authConfig()
            );
            const d = res.data;
            let text;
            if (d.created) {
                text = `Created "${d.name}" (version ${d.version}) with ${d.fields.length} fields.`;
            } else if (d.version_bumped) {
                text = `Updated "${d.name}" -- structural changes bumped it to version ${d.version}. ${
                    d.signed_notes_count > 0
                        ? `${d.signed_notes_count} previously signed note(s) are unaffected -- they keep displaying exactly as signed.`
                        : ""
                }`;
            } else {
                text = `Updated "${d.name}" (version ${d.version}) -- no structural changes.`;
            }
            setBanner({ severity: "success", text });
            load();
        } catch (e) {
            const data = e?.response?.data;
            if (data && Array.isArray(data.errors)) {
                setUploadErrors(data.errors);
                setError(data.detail || "The CSV has problems. Nothing was saved.");
            } else {
                setError((data && data.detail) || "Couldn't upload that CSV.");
            }
        } finally {
            setUploading(false);
        }
    };

    const load = async () => {
        setError("");
        try {
            const res = await api.get(apiEndpoints.noteTemplatesAdmin, await authConfig());
            // Note types and order detail forms share one table; each builder shows its own kind.
            setTemplates(res.data.filter((t) => (t.kind || "note") === kind));
        } catch (e) {
            setError("Couldn't load note templates.");
        }
        if (kind === "note") {
            // The note types dictionary supplies the filter chips (and their order). Not fatal if it fails.
            try {
                const dres = await api.get(apiEndpoints.dictionariesAdmin, await authConfig());
                const dic = (dres.data || []).find((d) => d.code === "note_types");
                setNoteTypes(dic ? dic.items : []);
            } catch (e) {
                setNoteTypes([]);
            }
        }
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleActive = async (tpl) => {
        setBusyCode(tpl.code);
        try {
            await api.patch(
                apiEndpoints.noteTemplateAdmin(tpl.code),
                { is_active: !tpl.is_active },
                await authConfig()
            );
            load();
        } catch (e) {
            setError("Couldn't update that template's active status.");
        } finally {
            setBusyCode(null);
        }
    };

    const deleteTemplate = async (tpl) => {
        if (
            !window.confirm(
                `Delete "${tpl.name}"? This only works if no notes have ever been created against it.`
            )
        ) {
            return;
        }
        setBusyCode(tpl.code);
        try {
            await api.delete(apiEndpoints.noteTemplateAdmin(tpl.code), await authConfig());
            load();
        } catch (e) {
            const detail = e?.response?.data?.detail;
            setError(
                detail ||
                    "Couldn't delete that template -- it likely has notes on file. Try deactivating it instead."
            );
        } finally {
            setBusyCode(null);
        }
    };

    if (templates === null && !error) {
        return (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
                <CircularProgress />
            </Box>
        );
    }

    const all = templates || [];
    const countFor = (value) => all.filter((t) => (t.note_type || "") === value).length;
    const notSetCount = all.filter((t) => !t.note_type).length;
    const terms = search.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = all.filter((t) => {
        if (!isOrderForm) {
            if (typeFilter === NO_TYPE && t.note_type) return false;
            if (typeFilter !== "all" && typeFilter !== NO_TYPE && t.note_type !== typeFilter) return false;
        }
        const hay = `${t.name} ${t.code}`.toLowerCase();
        return terms.every((term) => hay.includes(term));
    });
    const typeBadge = (tpl) => {
        if (!tpl.note_type) {
            return (
                <Chip size="small" variant="outlined" label="Not set" sx={{ borderStyle: "dashed", color: "#9a3412", borderColor: "#c2410c" }} />
            );
        }
        const idx = Math.max(0, noteTypes.findIndex((i) => i.value === tpl.note_type));
        const c = TYPE_COLORS[idx % TYPE_COLORS.length];
        return <Chip size="small" label={tpl.note_type_label || tpl.note_type} sx={{ bgcolor: c.bg, color: c.fg, fontWeight: 500 }} />;
    };

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
                                <TableCell sx={{ width: 140 }}>Column</TableCell>
                                <TableCell>Problem</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {uploadErrors.map((err, i) => (
                                <TableRow key={i}>
                                    <TableCell>{err.row ? err.row : "File"}</TableCell>
                                    <TableCell>{err.column || "-"}</TableCell>
                                    <TableCell>{err.message}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Paper>
            )}
            <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 2 }}>
                <TextField
                    size="small"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name or code"
                    sx={{ minWidth: 260 }}
                    slotProps={{
                        htmlInput: { "aria-label": "Search templates" },
                        input: {
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon fontSize="small" />
                                </InputAdornment>
                            ),
                        },
                    }}
                />
                <Box sx={{ flexGrow: 1 }} />
                <Button
                    variant="outlined"
                    startIcon={<FileDownloadIcon />}
                    onClick={() => saveCsv(apiEndpoints.noteTemplatesSampleCsv, "note_template_upload_template.csv")}
                >
                    Download Sample CSV
                </Button>
                <Button
                    variant="outlined"
                    startIcon={uploading ? <CircularProgress size={16} /> : <UploadFileIcon />}
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    disabled={uploading}
                >
                    Upload CSV
                </Button>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" hidden onChange={handleUploadFile} />
                <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
                    {isOrderForm ? "New Detail Form" : "New Template"}
                </Button>
            </Box>
            {!isOrderForm && all.length > 0 && (
                <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" sx={{ mr: 0.5 }}>
                        Note type
                    </Typography>
                    <Chip
                        label={`All · ${all.length}`}
                        color={typeFilter === "all" ? "primary" : "default"}
                        variant={typeFilter === "all" ? "filled" : "outlined"}
                        onClick={() => setTypeFilter("all")}
                    />
                    {noteTypes.map((i) => (
                        <Chip
                            key={i.value}
                            label={`${i.label} · ${countFor(i.value)}`}
                            color={typeFilter === i.value ? "primary" : "default"}
                            variant={typeFilter === i.value ? "filled" : "outlined"}
                            onClick={() => setTypeFilter(i.value)}
                        />
                    ))}
                    {notSetCount > 0 && (
                        <Chip
                            label={`Not set · ${notSetCount}`}
                            color={typeFilter === NO_TYPE ? "primary" : "default"}
                            variant={typeFilter === NO_TYPE ? "filled" : "outlined"}
                            onClick={() => setTypeFilter(NO_TYPE)}
                            sx={typeFilter === NO_TYPE ? undefined : { borderStyle: "dashed", color: "#9a3412", borderColor: "#c2410c" }}
                        />
                    )}
                    <Box sx={{ flexGrow: 1 }} />
                    {onManageNoteTypes && (
                        <Button size="small" onClick={onManageNoteTypes}>
                            Manage note types
                        </Button>
                    )}
                </Box>
            )}
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Code</TableCell>
                            {!isOrderForm && <TableCell>Note type</TableCell>}
                            <TableCell align="center">Version</TableCell>
                            <TableCell align="center">Fields</TableCell>
                            <TableCell align="center">Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {shown.map((tpl) => (
                            <TableRow key={tpl.code} hover>
                                <TableCell>{tpl.name}</TableCell>
                                <TableCell>
                                    <code>{tpl.code}</code>
                                </TableCell>
                                {!isOrderForm && <TableCell>{typeBadge(tpl)}</TableCell>}
                                <TableCell align="center">v{tpl.version}</TableCell>
                                <TableCell align="center">{tpl.fields.length}</TableCell>
                                <TableCell align="center">
                                    <Chip
                                        size="small"
                                        label={tpl.is_active ? "Active" : "Inactive"}
                                        color={tpl.is_active ? "success" : "default"}
                                        onClick={() => toggleActive(tpl)}
                                        disabled={busyCode === tpl.code}
                                        sx={{ cursor: "pointer" }}
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <Tooltip title="Download CSV">
                                        <IconButton
                                            size="small"
                                            onClick={() =>
                                                saveCsv(apiEndpoints.noteTemplateDownloadCsv(tpl.code), `${tpl.code}_template.csv`)
                                            }
                                        >
                                            <FileDownloadIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Edit">
                                        <IconButton size="small" onClick={() => onEdit(tpl.code)}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    <Tooltip title="Delete">
                                        <IconButton
                                            size="small"
                                            onClick={() => deleteTemplate(tpl)}
                                            disabled={busyCode === tpl.code}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </TableCell>
                            </TableRow>
                        ))}
                        {templates && templates.length > 0 && shown.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7}>
                                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                        No templates match.{" "}
                                        <Button size="small" onClick={() => { setSearch(""); setTypeFilter("all"); }}>
                                            Clear filters
                                        </Button>
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                        {templates && templates.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7}>
                                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                        {isOrderForm ? 'No detail forms yet -- click "New Detail Form" to build one.' : 'No templates yet -- click "New Template" to build one.'}
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
}

export default TemplateListView;
