import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Alert,
    Autocomplete,
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
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { jwtDecode } from "jwt-decode";
import { api } from "../../api/client";
import { apiEndpoints } from "../../config/api";
import { PRIORITIES, authConfig, errorText, listOf } from "./builderCommon";

function SetDialog({ initial, orderables, locked, onClose, onSaved }) {
    const isNew = !initial.id;
    const [code, setCode] = useState(initial.code || "");
    const [name, setName] = useState(initial.name || "");
    const [description, setDescription] = useState(initial.description || "");
    const [isActive, setIsActive] = useState(initial.is_active !== false);
    // Keep each item's default_detail so editing the set never wipes it.
    const [items, setItems] = useState(
        (initial.items || []).map((i) => ({
            orderable: i.orderable,
            name: i.orderable_name,
            default_priority: i.default_priority || "",
            default_detail: i.default_detail || {},
        }))
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [pickerText, setPickerText] = useState("");

    const available = useMemo(
        () => orderables.filter((o) => o.is_active && !items.some((i) => i.orderable === o.id)),
        [orderables, items]
    );

    const move = (index, delta) =>
        setItems((list) => {
            const next = [...list];
            const target = index + delta;
            if (target < 0 || target >= next.length) return list;
            [next[index], next[target]] = [next[target], next[index]];
            return next;
        });

    const save = async () => {
        setError("");
        if (!code.trim() || !name.trim()) {
            setError("Code and name are required.");
            return;
        }
        if (items.length === 0) {
            setError("Add at least one orderable to the set.");
            return;
        }
        setSaving(true);
        try {
            const payload = {
                code: code.trim(),
                name: name.trim(),
                description,
                is_active: isActive,
                items: items.map((i) => ({
                    orderable: i.orderable,
                    default_priority: i.default_priority,
                    default_detail: i.default_detail,
                })),
            };
            const config = await authConfig();
            if (isNew) await api.post(apiEndpoints.orderSetsAdmin, payload, config);
            else await api.put(apiEndpoints.orderSetAdmin(initial.id), payload, config);
            onSaved(isNew ? `Created "${payload.name}".` : `Saved "${payload.name}".`);
        } catch (e) {
            setError(errorText(e, "Couldn't save that order set."));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open onClose={onClose} fullWidth maxWidth="md">
            <DialogTitle>{isNew ? "New order set" : `Edit: ${initial.name}`}</DialogTitle>
            <DialogContent>
                <Stack spacing={2} sx={{ mt: 1 }}>
                    {error && <Alert severity="error">{error}</Alert>}
                    {locked && (
                        <Alert severity="info">
                            This order set is shared by all organizations. Only a system administrator can change it.
                        </Alert>
                    )}
                    <Stack direction="row" spacing={2}>
                        <TextField
                            label="Code"
                            size="small"
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            disabled={!isNew || locked}
                            helperText="Stable key, e.g. admission_labs"
                            sx={{ flex: 1 }}
                        />
                        <TextField
                            label="Name"
                            size="small"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            disabled={locked}
                            sx={{ flex: 2 }}
                        />
                    </Stack>
                    <TextField
                        label="Description"
                        size="small"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        disabled={locked}
                    />
                    <FormControlLabel
                        control={
                            <Checkbox checked={isActive} disabled={locked} onChange={(e) => setIsActive(e.target.checked)} />
                        }
                        label="Active"
                    />

                    <Typography variant="subtitle2">Orders in this set ({items.length})</Typography>
                    {!locked && (
                        <Autocomplete
                            size="small"
                            options={available}
                            value={null}
                            inputValue={pickerText}
                            onInputChange={(e, v, reason) => {
                                if (reason !== "reset") setPickerText(v);
                            }}
                            getOptionLabel={(o) => `${o.name} (${o.code})`}
                            onChange={(e, o) => {
                                if (!o) return;
                                setItems((list) => [
                                    ...list,
                                    { orderable: o.id, name: o.name, default_priority: "", default_detail: {} },
                                ]);
                                setPickerText("");
                            }}
                            noOptionsText="No matching active orderables"
                            renderInput={(params) => <TextField {...params} label="Add an orderable" />}
                        />
                    )}
                    <Paper variant="outlined">
                        {items.length === 0 ? (
                            <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                                Nothing in this set yet.
                            </Typography>
                        ) : (
                            items.map((item, index) => (
                                <Stack
                                    key={item.orderable}
                                    direction="row"
                                    spacing={1}
                                    alignItems="center"
                                    sx={{ p: 1, borderBottom: index < items.length - 1 ? 1 : 0, borderColor: "divider" }}
                                >
                                    <Typography variant="body2" sx={{ flex: 1 }}>
                                        {index + 1}. {item.name}
                                    </Typography>
                                    <FormControl size="small" sx={{ minWidth: 150 }} disabled={locked}>
                                        <InputLabel id={`sp-${item.orderable}`}>Priority</InputLabel>
                                        <Select
                                            labelId={`sp-${item.orderable}`}
                                            label="Priority"
                                            value={item.default_priority}
                                            onChange={(e) =>
                                                setItems((list) =>
                                                    list.map((x, i) =>
                                                        i === index ? { ...x, default_priority: e.target.value } : x
                                                    )
                                                )
                                            }
                                        >
                                            <MenuItem value="">
                                                <em>Orderable default</em>
                                            </MenuItem>
                                            {PRIORITIES.map((p) => (
                                                <MenuItem key={p.value} value={p.value}>
                                                    {p.label}
                                                </MenuItem>
                                            ))}
                                        </Select>
                                    </FormControl>
                                    {!locked && (
                                        <>
                                            <IconButton size="small" disabled={index === 0} onClick={() => move(index, -1)}>
                                                <ArrowUpwardIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                disabled={index === items.length - 1}
                                                onClick={() => move(index, 1)}
                                            >
                                                <ArrowDownwardIcon fontSize="small" />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={() => setItems((list) => list.filter((_, i) => i !== index))}
                                            >
                                                <CloseIcon fontSize="small" />
                                            </IconButton>
                                        </>
                                    )}
                                </Stack>
                            ))
                        )}
                    </Paper>
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

/** Order sets: named bundles of orderables placed together from a patient's Orders page. */
function OrderSetsManager() {
    const [sets, setSets] = useState(null);
    const [orderables, setOrderables] = useState([]);
    const [error, setError] = useState("");
    const [banner, setBanner] = useState(null);
    const [editing, setEditing] = useState(null);

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
            const [s, o] = await Promise.all([
                api.get(apiEndpoints.orderSetsAdmin, config),
                api.get(apiEndpoints.orderablesAdmin, config),
            ]);
            setSets(listOf(s));
            setOrderables(listOf(o));
        } catch (e) {
            setError(errorText(e, "Couldn't load order sets."));
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const locked = (s) => s.organization === null && !isSystemAdmin;

    const remove = async (s) => {
        if (!window.confirm(`Delete the order set "${s.name}"? Orders already placed from it are not affected.`)) return;
        try {
            await api.delete(apiEndpoints.orderSetAdmin(s.id), await authConfig());
            setBanner({ severity: "success", text: `Deleted "${s.name}".` });
            load();
        } catch (e) {
            setError(errorText(e, "Couldn't delete that order set."));
        }
    };

    if (sets === null && !error) {
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
            <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
                <Button
                    variant="contained"
                    startIcon={<AddIcon />}
                    onClick={() => setEditing({ items: [], is_active: true })}
                    disabled={orderables.length === 0}
                >
                    New order set
                </Button>
            </Box>
            {orderables.length === 0 && (
                <Alert severity="info" sx={{ mb: 2 }}>
                    Add some orderables first, then bundle them here.
                </Alert>
            )}
            <TableContainer component={Paper}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Name</TableCell>
                            <TableCell>Code</TableCell>
                            <TableCell align="center">Orders</TableCell>
                            <TableCell align="center">Status</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {(sets || []).map((s) => (
                            <TableRow key={s.id} hover>
                                <TableCell>
                                    {s.name}
                                    {s.organization === null && (
                                        <Chip size="small" label="Shared" variant="outlined" sx={{ ml: 1 }} />
                                    )}
                                    {s.description && (
                                        <Typography variant="caption" display="block" color="text.secondary">
                                            {s.description}
                                        </Typography>
                                    )}
                                </TableCell>
                                <TableCell>
                                    <code>{s.code}</code>
                                </TableCell>
                                <TableCell align="center">{s.items.length}</TableCell>
                                <TableCell align="center">
                                    <Chip
                                        size="small"
                                        label={s.is_active ? "Active" : "Inactive"}
                                        color={s.is_active ? "success" : "default"}
                                    />
                                </TableCell>
                                <TableCell align="right">
                                    <Tooltip title={locked(s) ? "View" : "Edit"}>
                                        <IconButton size="small" onClick={() => setEditing(s)}>
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                    {!locked(s) && (
                                        <Tooltip title="Delete">
                                            <IconButton size="small" onClick={() => remove(s)}>
                                                <DeleteIcon fontSize="small" />
                                            </IconButton>
                                        </Tooltip>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                        {sets && sets.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={5}>
                                    <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                                        No order sets yet.
                                    </Typography>
                                </TableCell>
                            </TableRow>
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {editing && (
                <SetDialog
                    initial={editing}
                    orderables={orderables}
                    locked={!!editing.id && locked(editing)}
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

export default OrderSetsManager;
