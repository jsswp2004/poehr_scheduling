import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Button, Checkbox, Chip, FormControlLabel, List, ListItemButton, Stack, TextField, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { toast } from "../SimpleToast";
import ComposeDialog from "./ComposeDialog";
import ReadingPane from "./ReadingPane";
import { CARE_LABELS, FOLDERS, announceChange, badgeFor, folderCount, inboxGet, inboxPost, whenText } from "./inboxHelpers";

const UNREAD_DOT = { width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 };

function Row({ item, selected, onPick }) {
  const badge = badgeFor(item);
  return (
    <ListItemButton
      selected={selected}
      onClick={() => onPick(item)}
      data-testid={`inbox-row-${item.key}`}
      aria-current={selected ? "true" : undefined}
      sx={{ display: "block", borderBottom: 1, borderColor: "divider", py: 1.25, borderLeft: 4, borderLeftColor: item.severity === "critical" ? "error.main" : "transparent" }}
    >
      <Stack direction="row" spacing={1} alignItems="center">
        {item.unread && <Box sx={UNREAD_DOT} aria-label="Unread" />}
        <Chip size="small" label={badge.label} color={badge.color} variant={item.unread ? "filled" : "outlined"} />
        <Typography variant="body2" noWrap sx={{ flexGrow: 1, fontWeight: item.unread ? 700 : 500 }}>
          {item.from_name}
        </Typography>
        {item.overdue && <Chip size="small" color="error" label="Overdue" />}
        <Typography variant="caption" color="text.secondary" sx={{ whiteSpace: "nowrap" }}>
          {whenText(item.at)}
        </Typography>
      </Stack>
      <Typography variant="body2" noWrap sx={{ fontWeight: item.unread ? 700 : 400, mt: 0.25 }}>
        {item.title}
        {item.count > 1 ? ` (${item.count})` : ""}
      </Typography>
      <Typography variant="caption" color="text.secondary" noWrap component="div">
        {item.preview}
      </Typography>
      {item.patient && (
        <Typography variant="caption" component="div" sx={{ mt: 0.25 }}>
          <b>{item.patient.name}</b>
          {item.care ? ` · ${CARE_LABELS[item.care] || item.care}` : ""}
        </Typography>
      )}
    </ListItemButton>
  );
}

/**
 * The Inbox chart tab: everything sent to the signed-in person (messages, result alerts, notes and
 * orders to sign, co-sign requests), the same in every care setting. `careSetting` is the module the
 * Patients page is in; "This care setting only" narrows the list to patients seen in it.
 */
export default function InboxPanel({ careSetting, selectedPatient, onOpenChart }) {
  const [folder, setFolder] = useState("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [thisCare, setThisCare] = useState(false);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedKey, setSelectedKey] = useState(null);
  const [detail, setDetail] = useState(null);
  const [people, setPeople] = useState([]);
  const [compose, setCompose] = useState({ open: false, forwardOf: null });
  const [sending, setSending] = useState(false);
  const listSeq = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    const seq = ++listSeq.current;
    try {
      const params = { folder };
      if (unreadOnly) params.unread = 1;
      if (thisCare && careSetting) params.care = careSetting;
      if (query) params.q = query;
      const data = await inboxGet("", params);
      if (seq !== listSeq.current) return;
      setItems(data.items || []);
      setCounts(data.counts || null);
    } catch (err) {
      if (seq === listSeq.current) toast.error("Could not load your inbox.");
    } finally {
      if (seq === listSeq.current) setLoading(false);
    }
  }, [folder, unreadOnly, thisCare, careSetting, query]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    (async () => {
      try {
        setPeople(await inboxGet("people/"));
      } catch (err) {
        setPeople([]);
      }
    })();
  }, []);

  const selected = useMemo(() => items.find((i) => i.key === selectedKey) || null, [items, selectedKey]);

  const openDetail = useCallback(async (key) => {
    try {
      setDetail(await inboxGet("item/", { key }));
    } catch (err) {
      setDetail(null);
      toast.error(err?.response?.data?.detail || "Could not open that item.");
    }
  }, []);

  const pick = async (item) => {
    setSelectedKey(item.key);
    setDetail(null);
    await openDetail(item.key);
    announceChange();
    await load();
  };

  const changed = async () => {
    await load();
    if (selectedKey) await openDetail(selectedKey);
  };

  const markAllRead = async () => {
    const unread = items.filter((i) => i.unread);
    try {
      await Promise.all(unread.map((i) => inboxPost("read/", { key: i.key, read: true })));
      announceChange();
      await load();
    } catch (err) {
      toast.error("Could not mark everything read.");
    }
  };

  const send = async (form) => {
    setSending(true);
    try {
      const fwd = compose.forwardOf;
      const res = fwd
        ? await inboxPost(`messages/${fwd.key.split(":")[1]}/forward/`, { to: form.to, note: form.note })
        : await inboxPost("messages/", { to: form.to, subject: form.subject, body: form.body, patient: form.patient });
      toast.success(fwd ? "Message forwarded." : "Message sent.");
      setCompose({ open: false, forwardOf: null });
      announceChange();
      setFolder("sent");
      setSelectedKey(res.key);
      await openDetail(res.key);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not send that message.");
    } finally {
      setSending(false);
    }
  };

  const unreadInList = items.some((i) => i.unread);

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", minHeight: 0, height: "100%", bgcolor: "background.paper" }} data-testid="inbox-panel">
      {/* Folders */}
      <Box sx={{ width: { xs: "100%", md: 220 }, flexShrink: 0, borderRight: { md: 1 }, borderBottom: { xs: 1, md: 0 }, borderColor: "divider", p: 1.5 }}>
        <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => setCompose({ open: true, forwardOf: null })} sx={{ mb: 1.5, minHeight: 44 }} data-testid="inbox-compose">
          New message
        </Button>
        <Stack component="nav" aria-label="Inbox folders" spacing={0.25}>
          {FOLDERS.map((f) => {
            const n = folderCount(counts, f.key);
            return (
              <Button
                key={f.key}
                onClick={() => {
                  setFolder(f.key);
                  setSelectedKey(null);
                  setDetail(null);
                }}
                aria-pressed={folder === f.key}
                data-testid={`inbox-folder-${f.key}`}
                sx={{ justifyContent: "space-between", textTransform: "none", fontWeight: folder === f.key ? 700 : 400, bgcolor: folder === f.key ? "action.selected" : "transparent", color: "text.primary" }}
              >
                <span>{f.label}</span>
                {n > 0 && <Chip size="small" label={n} color={f.key === "cosign" || f.key === "sign" ? "default" : "primary"} />}
              </Button>
            );
          })}
        </Stack>
        <Typography variant="overline" color="text.secondary" sx={{ display: "block", mt: 2 }}>
          Show
        </Typography>
        <FormControlLabel control={<Checkbox size="small" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />} label="Unread only" sx={{ display: "flex" }} />
        <FormControlLabel
          control={<Checkbox size="small" checked={thisCare} onChange={(e) => setThisCare(e.target.checked)} />}
          label={`This care setting only`}
          sx={{ display: "flex" }}
        />
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
          The Inbox is the same in Ambulatory, Emergency and Acute care. Items for other care settings are included unless you tick this.
        </Typography>
      </Box>

      {/* List */}
      <Box sx={{ flex: "1 1 340px", minWidth: 300, maxWidth: { md: 520 }, borderRight: { md: 1 }, borderColor: "divider", display: "flex", flexDirection: "column", minHeight: 300 }}>
        <Stack direction="row" spacing={1} sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <TextField size="small" fullWidth placeholder="Search sender, subject or patient" value={search} onChange={(e) => setSearch(e.target.value)} inputProps={{ "aria-label": "Search the inbox" }} />
          <Button variant="outlined" onClick={markAllRead} disabled={!unreadInList} sx={{ whiteSpace: "nowrap" }}>
            Mark all read
          </Button>
        </Stack>
        <List disablePadding sx={{ flexGrow: 1, overflowY: "auto" }} aria-label="Inbox items" data-testid="inbox-list">
          {items.map((it) => (
            <Row key={it.key} item={it} selected={it.key === selectedKey} onPick={pick} />
          ))}
          {!loading && items.length === 0 && (
            <Typography color="text.secondary" sx={{ p: 4, textAlign: "center" }} data-testid="inbox-nothing">
              {folder === "done" ? "Nothing handled in the last 30 days." : "Nothing here. You are caught up."}
            </Typography>
          )}
        </List>
      </Box>

      {/* Reading pane */}
      <Box sx={{ flex: "2 1 420px", minWidth: 320, overflowY: "auto" }}>
        <ReadingPane
          item={selected}
          detail={detail}
          onChanged={changed}
          onForward={(d) => setCompose({ open: true, forwardOf: { key: d.key, title: d.title } })}
          onOpenChart={onOpenChart}
        />
      </Box>

      <ComposeDialog
        open={compose.open}
        forwardOf={compose.forwardOf}
        onClose={() => setCompose({ open: false, forwardOf: null })}
        onSend={send}
        people={people}
        saving={sending}
        aboutPatient={selectedPatient || null}
      />
    </Box>
  );
}
