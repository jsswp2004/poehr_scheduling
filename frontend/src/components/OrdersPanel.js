import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Box,
  Paper,
  Typography,
  Button,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Chip,
  Stack,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
  Divider,
  CircularProgress,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import HistoryIcon from "@mui/icons-material/History";
import { jwtDecode } from "jwt-decode";
import { api } from "../api/client";
import { apiEndpoints } from "../config/api";
import { getValidToken } from "../utils/auth";
import { toast } from "./SimpleToast";
import DynamicNoteForm from "./DynamicNoteForm";

const authHeader = async () => {
  const token = await getValidToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token.access_token || token}` };
};

const listOf = (res) => (Array.isArray(res.data) ? res.data : res.data?.results || []);

const errorText = (err, fallback) =>
  err?.response?.data?.detail ||
  (err?.response?.data && typeof err.response.data === "object"
    ? Object.values(err.response.data).flat().join(" ")
    : null) ||
  fallback;

const PRIORITIES = [
  { value: "routine", label: "Routine" },
  { value: "urgent", label: "Urgent" },
  { value: "stat", label: "STAT" },
];

const STATUS_COLORS = {
  draft: "default",
  pending_cosign: "warning",
  active: "primary",
  in_progress: "info",
  completed: "success",
  discontinued: "default",
};

const PRIORITY_COLORS = { routine: "default", urgent: "warning", stat: "error" };

const TABS = [
  { key: "drafts", label: "Drafts", match: (o) => o.status === "draft" },
  { key: "pending", label: "Awaiting cosign", match: (o) => o.status === "pending_cosign" },
  {
    key: "active",
    label: "Active",
    match: (o) => o.status === "active" || o.status === "in_progress",
  },
  {
    key: "closed",
    label: "Completed / Discontinued",
    match: (o) => o.status === "completed" || o.status === "discontinued",
  },
  { key: "all", label: "All", match: () => true },
];

const dxToText = (codes) => (codes || []).map((d) => d.code).join(", ");
const textToDx = (text) =>
  text
    .split(/[,;\s]+/)
    .map((c) => c.trim())
    .filter(Boolean)
    .map((code) => ({ code }));

/**
 * Orders for a single patient: place from the catalog or an order set, edit
 * drafts, sign (individually or all at once), cosign, complete, discontinue,
 * replace, and see each order's history. Every rule (who may sign, cosign
 * requirements, locking after signing) is enforced by the backend; this
 * screen just shows the right buttons and relays the server's messages.
 */
function OrdersPanel({ patientId }) {
  const [me, setMe] = useState({ role: null, id: null });
  const [appointments, setAppointments] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderSets, setOrderSets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("drafts");

  const [appointmentId, setAppointmentId] = useState("");
  const [orderableOptions, setOrderableOptions] = useState([]);
  const [searchText, setSearchText] = useState("");
  const [searchLoading, setSearchLoading] = useState(false);
  const [orderSetCode, setOrderSetCode] = useState("");

  // Unsaved edits to drafts: { [orderId]: { priority, indication, dx, detail } }
  const [edits, setEdits] = useState({});

  const [dialog, setDialog] = useState(null); // { kind, order }
  const [dialogText, setDialogText] = useState("");

  const canPlace = ["doctor", "nurse", "admin", "system_admin"].includes(me.role);
  const canCosign = ["doctor", "admin", "system_admin"].includes(me.role);

  const loadAll = useCallback(async () => {
    if (!patientId) return;
    setLoading(true);
    try {
      const headers = await authHeader();
      const [apptRes, orderRes, setRes] = await Promise.all([
        api.get(`/api/appointments/?patient=${patientId}`, { headers }),
        api.get(apiEndpoints.orders, { headers, params: { patient: patientId } }),
        api.get(apiEndpoints.orderSets, { headers }),
      ]);
      const appts = listOf(apptRes);
      setAppointments(appts);
      setOrders(listOf(orderRes));
      setOrderSets(listOf(setRes));
      setAppointmentId((cur) => cur || (appts[0] ? appts[0].id : ""));
    } catch (err) {
      toast.error(errorText(err, "Could not load orders."));
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    (async () => {
      const token = await getValidToken();
      try {
        const decoded = jwtDecode(token.access_token || token);
        setMe({ role: decoded.role || null, id: decoded.user_id ?? null });
      } catch (e) {
        /* role stays null; server still enforces access */
      }
    })();
    loadAll();
  }, [loadAll]);

  // Catalog search (debounced)
  const searchTimer = useRef(null);
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const headers = await authHeader();
        const res = await api.get(apiEndpoints.orderables, {
          headers,
          params: { q: searchText, limit: 25 },
        });
        setOrderableOptions(listOf(res));
      } catch (err) {
        setOrderableOptions([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(searchTimer.current);
  }, [searchText]);

  const replaceOrder = (updated) =>
    setOrders((list) => list.map((o) => (o.id === updated.id ? updated : o)));

  const run = async (fn, successMessage) => {
    setBusy(true);
    try {
      const result = await fn(await authHeader());
      if (successMessage) toast.success(successMessage);
      return result;
    } catch (err) {
      toast.error(errorText(err, "That did not work."));
      return null;
    } finally {
      setBusy(false);
    }
  };

  // ---- placing --------------------------------------------------------
  const addOrderable = async (orderable) => {
    if (!orderable) return;
    if (!appointmentId) {
      toast.error("Select the visit this order belongs to first.");
      return;
    }
    const created = await run(async (headers) => {
      const res = await api.post(
        apiEndpoints.orders,
        { appointment: appointmentId, orderable: orderable.id },
        { headers }
      );
      return res.data;
    }, `${orderable.name} added to drafts.`);
    if (created) {
      setOrders((list) => [created, ...list]);
      setTab("drafts");
      setSearchText("");
    }
  };

  const addOrderSet = async () => {
    if (!orderSetCode || !appointmentId) {
      toast.error("Select a visit and an order set.");
      return;
    }
    const created = await run(async (headers) => {
      const res = await api.post(
        `/api/order-sets/${orderSetCode}/place/`,
        { appointment: appointmentId },
        { headers }
      );
      return res.data;
    }, "Order set added to drafts.");
    if (created) {
      setOrders((list) => [...created, ...list]);
      setTab("drafts");
      setOrderSetCode("");
    }
  };

  // ---- drafts ---------------------------------------------------------
  const draftValue = (order) =>
    edits[order.id] || {
      priority: order.priority,
      indication: order.indication || "",
      dx: dxToText(order.diagnosis_codes),
      detail: order.detail || {},
    };

  const setDraftField = (order, patch) =>
    setEdits((e) => ({ ...e, [order.id]: { ...draftValue(order), ...patch } }));

  const saveDraft = async (order, headers) => {
    const v = draftValue(order);
    const res = await api.patch(
      apiEndpoints.order(order.id),
      {
        priority: v.priority,
        indication: v.indication,
        diagnosis_codes: textToDx(v.dx),
        detail: v.detail,
      },
      { headers }
    );
    replaceOrder(res.data);
    setEdits((e) => {
      const next = { ...e };
      delete next[order.id];
      return next;
    });
    return res.data;
  };

  const handleSaveDraft = (order) => run((h) => saveDraft(order, h), "Draft saved.");

  const handleDeleteDraft = async (order) => {
    const ok = await run(async (headers) => {
      await api.delete(apiEndpoints.order(order.id), { headers });
      return true;
    });
    if (ok) setOrders((list) => list.filter((o) => o.id !== order.id));
  };

  const signIds = async (ids, headers) => {
    const res = await api.post(apiEndpoints.ordersSign, { ids }, { headers });
    res.data.forEach(replaceOrder);
    return res.data;
  };

  const handleSignAll = async () => {
    const drafts = orders.filter((o) => o.status === "draft");
    if (!drafts.length) return;
    const signed = await run(async (headers) => {
      for (const d of drafts) {
        if (edits[d.id]) await saveDraft(d, headers);
      }
      return signIds(drafts.map((d) => d.id), headers);
    });
    if (signed) {
      toast.success(
        `${signed.length} order${signed.length === 1 ? "" : "s"} signed` +
          (signed.some((o) => o.status === "pending_cosign") ? " (some await cosign)." : ".")
      );
      setTab(signed.some((o) => o.status === "pending_cosign") ? "pending" : "active");
    }
  };

  const handleSignOne = async (order) => {
    const signed = await run(async (headers) => {
      if (edits[order.id]) await saveDraft(order, headers);
      return signIds([order.id], headers);
    });
    if (signed) toast.success("Order signed.");
  };

  // ---- signed-order actions --------------------------------------------
  const handleCosign = (order) =>
    run(async (headers) => {
      const res = await api.post(apiEndpoints.orderAction(order.id, "cosign"), {}, { headers });
      replaceOrder(res.data);
    }, "Order cosigned.");

  const submitDialog = async () => {
    const { kind, order } = dialog;
    const body = kind === "complete" ? { result_text: dialogText } : { reason: dialogText };
    const result = await run(async (headers) => {
      const res = await api.post(apiEndpoints.orderAction(order.id, kind), body, { headers });
      return res.data;
    });
    if (!result) return;
    if (kind === "replace") {
      // the old order is now discontinued; the replacement is a new draft
      await loadAll();
      setTab("drafts");
      toast.success("Replacement draft created. Review it and sign.");
    } else {
      replaceOrder(result);
      toast.success(kind === "complete" ? "Order completed." : "Order discontinued.");
    }
    setDialog(null);
    setDialogText("");
  };

  const openDialog = (kind, order) => {
    setDialog({ kind, order });
    setDialogText("");
  };

  // ---- derived ---------------------------------------------------------
  const counts = useMemo(() => {
    const out = {};
    TABS.forEach((t) => {
      out[t.key] = orders.filter(t.match).length;
    });
    return out;
  }, [orders]);

  const visible = orders.filter(TABS.find((t) => t.key === tab).match);
  const drafts = orders.filter((o) => o.status === "draft");

  if (loading) {
    return (
      <Box sx={{ p: 4, textAlign: "center" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  if (me.role !== null && !canPlace) {
    return (
      <Typography color="text.secondary">
        Your role does not have access to orders.
      </Typography>
    );
  }

  const renderDraft = (order) => {
    const v = draftValue(order);
    const template = order.detail_template_snapshot;
    const hasForm = template && template.fields && template.fields.length > 0;
    return (
      <Paper key={order.id} variant="outlined" sx={{ p: 2 }}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="subtitle1" fontWeight={600}>
                {order.orderable_name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {order.orderable_category}
                {order.external_code ? ` · ${order.code_system.toUpperCase()} ${order.external_code}` : ""}
                {" · "}
                {order.placer_order_number}
              </Typography>
            </Box>
            <Tooltip title="Delete draft">
              <span>
                <IconButton size="small" disabled={busy} onClick={() => handleDeleteDraft(order)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <FormControl size="small" sx={{ minWidth: 150 }}>
              <InputLabel id={`prio-${order.id}`}>Priority</InputLabel>
              <Select
                labelId={`prio-${order.id}`}
                label="Priority"
                value={v.priority}
                onChange={(e) => setDraftField(order, { priority: e.target.value })}
              >
                {PRIORITIES.map((p) => (
                  <MenuItem key={p.value} value={p.value}>
                    {p.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              size="small"
              label="Indication / reason for order"
              value={v.indication}
              onChange={(e) => setDraftField(order, { indication: e.target.value })}
              fullWidth
            />
            <TextField
              size="small"
              label="Diagnosis codes (ICD-10)"
              placeholder="E11.9, I10"
              value={v.dx}
              onChange={(e) => setDraftField(order, { dx: e.target.value })}
              sx={{ minWidth: 220 }}
            />
          </Stack>

          {hasForm && (
            <Box>
              <Divider sx={{ mb: 2 }} />
              <DynamicNoteForm
                template={template}
                values={v.detail}
                onChange={(key, value) =>
                  setDraftField(order, { detail: { ...v.detail, [key]: value } })
                }
                disabled={busy}
              />
            </Box>
          )}

          <Stack direction="row" spacing={1} justifyContent="flex-end">
            <Button size="small" disabled={busy || !edits[order.id]} onClick={() => handleSaveDraft(order)}>
              Save draft
            </Button>
            <Button size="small" variant="outlined" disabled={busy} onClick={() => handleSignOne(order)}>
              Sign
            </Button>
          </Stack>
        </Stack>
      </Paper>
    );
  };

  const renderRow = (order) => {
    const open = ["pending_cosign", "active", "in_progress"].includes(order.status);
    const selfSigned = me.id !== null && order.signed_by === me.id;
    return (
      <TableRow key={order.id} hover>
        <TableCell>
          <Typography variant="body2" fontWeight={600}>
            {order.orderable_name}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {order.placer_order_number}
            {order.filler_order_number ? ` / ${order.filler_order_number}` : ""}
          </Typography>
          {order.diagnosis_codes && order.diagnosis_codes.length > 0 && (
            <Typography variant="caption" display="block" color="text.secondary">
              Dx: {dxToText(order.diagnosis_codes)}
            </Typography>
          )}
        </TableCell>
        <TableCell>{order.orderable_category}</TableCell>
        <TableCell>
          <Chip size="small" label={order.priority_display} color={PRIORITY_COLORS[order.priority]} />
        </TableCell>
        <TableCell>
          <Chip size="small" label={order.status_display} color={STATUS_COLORS[order.status]} />
          {order.interface_status !== "not_sent" && (
            <Chip size="small" variant="outlined" sx={{ ml: 0.5 }} label={`Interface: ${order.interface_status}`} />
          )}
        </TableCell>
        <TableCell>
          <Typography variant="body2">{order.ordering_provider_name}</Typography>
          <Typography variant="caption" color="text.secondary">
            {order.signed_at ? `Signed ${new Date(order.signed_at).toLocaleString()}` : "Not signed"}
            {order.cosigned_by_name ? ` · Cosigned by ${order.cosigned_by_name}` : ""}
          </Typography>
        </TableCell>
        <TableCell>
          {order.result_text && (
            <Typography variant="body2">{order.result_text}</Typography>
          )}
          {order.status === "discontinued" && (
            <Typography variant="caption" color="text.secondary">
              {order.discontinue_reason}
            </Typography>
          )}
        </TableCell>
        <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
          {order.status === "pending_cosign" && canCosign && !selfSigned && (
            <Button size="small" disabled={busy} onClick={() => handleCosign(order)}>
              Cosign
            </Button>
          )}
          {(order.status === "active" || order.status === "in_progress") && (
            <Button size="small" disabled={busy} onClick={() => openDialog("complete", order)}>
              Complete
            </Button>
          )}
          {open && (
            <>
              <Button size="small" disabled={busy} onClick={() => openDialog("replace", order)}>
                Replace
              </Button>
              <Button size="small" color="error" disabled={busy} onClick={() => openDialog("discontinue", order)}>
                Discontinue
              </Button>
            </>
          )}
          <Tooltip title="History">
            <IconButton size="small" onClick={() => setDialog({ kind: "history", order })}>
              <HistoryIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        </TableCell>
      </TableRow>
    );
  };

  const dialogTitle = {
    complete: "Complete order",
    discontinue: "Discontinue order",
    replace: "Replace order",
  };

  return (
    <Stack spacing={3}>
      {canPlace && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 2 }}>
            Place orders
          </Typography>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
            <FormControl size="small" sx={{ minWidth: 260 }}>
              <InputLabel id="orders-appt-label">Visit / Registration</InputLabel>
              <Select
                labelId="orders-appt-label"
                label="Visit / Registration"
                value={appointmentId}
                onChange={(e) => setAppointmentId(e.target.value)}
              >
                {appointments.map((a) => (
                  <MenuItem key={a.id} value={a.id}>
                    {a.title} - {new Date(a.appointment_datetime).toLocaleString()}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Autocomplete
              size="small"
              sx={{ flex: 1, minWidth: 260 }}
              options={orderableOptions}
              loading={searchLoading}
              value={null}
              inputValue={searchText}
              onInputChange={(e, text, reason) => {
                if (reason !== "reset") setSearchText(text);
              }}
              onChange={(e, option) => addOrderable(option)}
              filterOptions={(x) => x}
              getOptionLabel={(o) => o.name || ""}
              isOptionEqualToValue={(a, b) => a.id === b.id}
              noOptionsText="No matching orderables"
              renderOption={(props, o) => (
                <li {...props} key={o.id}>
                  <Box>
                    <Typography variant="body2">{o.name}</Typography>
                    <Typography variant="caption" color="text.secondary">
                      {o.category_display}
                      {o.external_code ? ` · ${o.code_system_display} ${o.external_code}` : ""}
                    </Typography>
                  </Box>
                </li>
              )}
              renderInput={(params) => (
                <TextField {...params} label="Search orderables (name, code)" />
              )}
            />

            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="orders-set-label">Order set</InputLabel>
              <Select
                labelId="orders-set-label"
                label="Order set"
                value={orderSetCode}
                onChange={(e) => setOrderSetCode(e.target.value)}
              >
                {orderSets.length === 0 && <MenuItem disabled>No order sets</MenuItem>}
                {orderSets.map((s) => (
                  <MenuItem key={s.code} value={s.code}>
                    {s.name} ({s.items.length})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button variant="outlined" disabled={busy || !orderSetCode} onClick={addOrderSet}>
              Add set
            </Button>
          </Stack>
          {appointments.length === 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
              This patient has no appointment or registration yet. Orders are placed against a visit.
            </Typography>
          )}
        </Paper>
      )}

      <Box>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Tabs value={tab} onChange={(e, v) => setTab(v)} variant="scrollable" scrollButtons="auto">
            {TABS.map((t) => (
              <Tab key={t.key} value={t.key} label={`${t.label} (${counts[t.key]})`} />
            ))}
          </Tabs>
          {tab === "drafts" && drafts.length > 0 && (
            <Button variant="contained" disabled={busy} onClick={handleSignAll}>
              Sign all ({drafts.length})
            </Button>
          )}
        </Stack>

        <Box sx={{ mt: 2 }}>
          {visible.length === 0 ? (
            <Typography color="text.secondary">Nothing here.</Typography>
          ) : tab === "drafts" ? (
            <Stack spacing={2}>{visible.map(renderDraft)}</Stack>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Order</TableCell>
                    <TableCell>Category</TableCell>
                    <TableCell>Priority</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Ordered by</TableCell>
                    <TableCell>Result / reason</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>{visible.map(renderRow)}</TableBody>
              </Table>
            </TableContainer>
          )}
        </Box>
      </Box>

      <Dialog
        open={!!dialog && dialog.kind !== "history"}
        onClose={() => setDialog(null)}
        fullWidth
        maxWidth="sm"
      >
        {dialog && dialog.kind !== "history" && (
          <>
            <DialogTitle>
              {dialogTitle[dialog.kind]}: {dialog.order.orderable_name}
            </DialogTitle>
            <DialogContent>
              <TextField
                autoFocus
                fullWidth
                multiline
                minRows={2}
                margin="dense"
                label={dialog.kind === "complete" ? "Result / comment (optional)" : "Reason (required)"}
                value={dialogText}
                onChange={(e) => setDialogText(e.target.value)}
              />
              {dialog.kind === "replace" && (
                <Typography variant="caption" color="text.secondary">
                  The current order is discontinued and a new draft with the same answers is created for you to
                  adjust and sign.
                </Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialog(null)}>Cancel</Button>
              <Button
                variant="contained"
                disabled={busy || (dialog.kind !== "complete" && !dialogText.trim())}
                onClick={submitDialog}
              >
                Confirm
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog
        open={!!dialog && dialog.kind === "history"}
        onClose={() => setDialog(null)}
        fullWidth
        maxWidth="sm"
      >
        {dialog && dialog.kind === "history" && (
          <>
            <DialogTitle>History: {dialog.order.orderable_name}</DialogTitle>
            <DialogContent>
              <Stack spacing={1}>
                {(dialog.order.events || []).map((ev) => (
                  <Box key={ev.id}>
                    <Typography variant="body2">
                      <strong>{ev.event_type.replace(/_/g, " ")}</strong>
                      {ev.to_status && ev.to_status !== ev.from_status ? ` → ${ev.to_status.replace(/_/g, " ")}` : ""}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {new Date(ev.created_at).toLocaleString()}
                      {ev.user_name ? ` · ${ev.user_name}` : ""}
                      {ev.source === "interface" ? " · via interface" : ""}
                      {ev.detail && ev.detail.reason ? ` · ${ev.detail.reason}` : ""}
                    </Typography>
                  </Box>
                ))}
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setDialog(null)}>Close</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Stack>
  );
}

export default OrdersPanel;
