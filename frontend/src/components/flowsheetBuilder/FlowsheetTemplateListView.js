import { useEffect, useRef, useState } from "react";
import {
    Box,
    Button,
    Chip,
    CircularProgress,
    IconButton,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Tooltip,
    Typography,
    Alert,
} from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { getValidToken } from "../../utils/auth";

// The shared `api` axios instance carries no Authorization header of its
// own -- every call site attaches its own token, matching the pattern used
// throughout the note-builder UI this mirrors.
const authConfig = async () => ({ headers: { Authorization: `Bearer ${await getValidToken()}` } });

const rowCount = (tpl) =>
    (tpl.row_definitions || []).reduce((total, section) => total + section.rows.length, 0);

/**
 * Lists every FlowsheetTemplate (active and inactive) for the
 * flowsheet-builder configuration UI, with entry points to edit an existing
 * one or start a new one. Deleting is blocked server-side (400) whenever
 * the flowsheet type has any charted instances on file, in which case this
 * offers to deactivate it instead.
 */
function FlowsheetTemplateListView({ onEdit, onNew }) {
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
            const res = await api.post(apiEndpoints.flowsheetTemplatesUploadCsv, form, await authConfig());
            const d = res.data;
            const rowTotal = rowCount(d);
            let text;
            if (d.created) {
                text = `Created "${d.name}" (version ${d.version}) with ${rowTotal} rows.`;
            } else if (d.version_bumped) {
                text = `Updated "${d.name}" -- structural changes bumped it to version ${d.version}. ${
                    d.instances_count > 0
                        ? `${d.instances_count} charted flowsheet(s) are kept; a value for a removed row is simply no longer shown.`
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
            const res = await api.get(apiEndpoints.flowsheetTemplatesAdmin, await authConfig());
            setTemplates(res.data);
        } catch (e) {
            setError("Couldn't load flowsheet types.");
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
                apiEndpoints.flowsheetTemplateAdmin(tpl.code),
                { is_active: !tpl.is_active },
                await authConfig()
            );
            load();
        } catch (e) {
            setError("Couldn't update that flowsheet type's active status.");
        } finally {
            setBusyCode(null);
        }
    };

    const deleteTemplate = async (tpl) => {
        if (
            !window.confirm(
                `Delete "${tpl.name}"? This only works if no flowsheets have ever been charted against it.`
            )
        ) {
            return;
        }
        setBusyCode(tpl.code);
        try {
            await api.delete(apiEndpoints.flowsheetTemplateAdmin(tpl.code), await authConfig());
            load();
        } catch (e) {
            const detail = e?.response?.data?.detail;
            setError(
                detail ||
                    "Couldn't delete that flowsheet type -- it likely has charted flowsheets on file. Try deactivating it instead."
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
            <Box sx={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: 1, mb: 2 }}>
                <Button
                    variant="outlined"
                    startIcon={<FileDownloadIcon />}
                    onClick={() => saveCsv(apiEndpoints.flowsheetTemplatesSampleCsv, "flowsheet_template_upload_template.csv")}
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
                    New Flowsheet Type
                </Button>
            </Box>
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Code</TableCell>
                            <TableCell align="center">Version</TableCell>
                            <TableCell align="center">Rows</TableCell>
                            <TableCell align="center">Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {(templates || []).map((tpl) => (
                            <TableRow key={tpl.code} hover>
                                <TableCell>{tpl.name}</TableCell>
                                <TableCell>
                                    <code>{tpl.code}</code>
                                </TableCell>
                                <TableCell align="center">v{tpl.version}</TableCell>
                                <TableCell align="center">{rowCount(tpl)}</TableCell>
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
                                                saveCsv(apiEndpoints.flowsheetTemplateDownloadCsv(tpl.code), `${tpl.code}_flowsheet.csv`)
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
                        {templates && templates.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={6}>
                                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                        No flowsheet types yet -- click "New Flowsheet Type" to build one.
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

export default FlowsheetTemplateListView;
