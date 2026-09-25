import { useEffect, useState } from "react";
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
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";

/**
 * Lists every NoteTemplate (active and inactive) for the note-builder
 * configuration UI, with entry points to edit an existing one or start a
 * new one. Deactivating/deleting happens here too -- deleting is blocked
 * server-side (400) whenever the template has any notes on file, in which
 * case this offers to deactivate it instead.
 */
function TemplateListView({ onEdit, onNew }) {
    const [templates, setTemplates] = useState(null);
    const [error, setError] = useState("");
    const [busyCode, setBusyCode] = useState(null);

    const load = () => {
        setError("");
        api
            .get(apiEndpoints.noteTemplatesAdmin)
            .then((res) => setTemplates(res.data))
            .catch(() => setError("Couldn't load note templates."));
    };

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleActive = async (tpl) => {
        setBusyCode(tpl.code);
        try {
            await api.patch(apiEndpoints.noteTemplateAdmin(tpl.code), {
                is_active: !tpl.is_active,
            });
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
            await api.delete(apiEndpoints.noteTemplateAdmin(tpl.code));
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

    return (
        <Box>
            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
                    {error}
                </Alert>
            )}
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                <Button variant="contained" startIcon={<AddIcon />} onClick={onNew}>
                    New Template
                </Button>
            </Box>
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Code</TableCell>
                            <TableCell align="center">Version</TableCell>
                            <TableCell align="center">Fields</TableCell>
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
                                        No templates yet -- click "New Template" to build one.
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
