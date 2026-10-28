import { useCallback, useMemo, useState } from "react";
import { Box, Button, Chip, InputBase, Paper, Typography, useMediaQuery, useTheme } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { useSearchParams } from "react-router-dom";
import BackButton from "../components/BackButton";
import ThreadList from "../components/secureMessages/ThreadList";
import Conversation from "../components/secureMessages/Conversation";
import NewConversationDialog from "../components/secureMessages/NewConversationDialog";
import useInbox from "../hooks/secureMessages/useInbox";
import { getCurrentUserFromToken } from "../utils/tokenManager";

const FILTERS = [
  ["all", "All"],
  ["unread", "Unread"],
  ["urgent", "Urgent"],
  ["patients", "Patients"],
  ["groups", "Groups"],
];

const matchesFilter = (t, filter) => {
  if (filter === "unread") return t.unread > 0;
  if (filter === "urgent") return t.urgent_unread > 0;
  if (filter === "patients") return t.kind === "patient";
  if (filter === "groups") return t.kind === "group" || t.kind === "channel";
  return true;
};

export default function SecureMessagesPage() {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("md"));
  const [params, setParams] = useSearchParams();
  const selected = params.get("thread") ? Number(params.get("thread")) : null;
  const { threads, loading, error, reload, upsert } = useInbox();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const user = getCurrentUserFromToken() || {};
  const isAdmin = ["admin", "system_admin"].includes(user.role);

  const select = useCallback((id) => setParams(id ? { thread: String(id) } : {}), [setParams]);
  const showList = !narrow || !selected;
  const showChat = !narrow || !!selected;

  const unreadTotal = useMemo(() => threads.reduce((n, t) => n + (t.unread || 0), 0), [threads]);
  const urgentTotal = useMemo(() => threads.reduce((n, t) => n + (t.urgent_unread || 0), 0), [threads]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return threads.filter((t) => {
      if (!matchesFilter(t, filter)) return false;
      if (!q) return true;
      const last = t.last_message ? `${t.last_message.sender || ""} ${t.last_message.preview || ""}` : "";
      return `${t.title || ""} ${last}`.toLowerCase().includes(q);
    });
  }, [threads, filter, query]);
  const filtering = filter !== "all" || query.trim() !== "";

  return (
    <Box
      sx={{
        px: { xs: 1, md: 2 },
        py: 1.5,
        height: "calc(100vh - 80px)",
        minHeight: 460,
        bgcolor: "background.paper",
        borderRadius: 2,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Frozen block: title row and toolbar stay under the navy bar while the page scrolls (same as Staffing Center) */}
      <Box sx={{ position: "sticky", top: 64, zIndex: 1000, bgcolor: "background.paper", pt: "18px", mt: "-18px" }}>
      {/* Title row: same look as the Staffing Center */}
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, mb: 1 }}>
        <Typography variant="h5">Secure Messages</Typography>
        {unreadTotal > 0 && <Chip size="small" color="primary" label={`${unreadTotal} unread`} />}
        {urgentTotal > 0 && <Chip size="small" color="error" label={`${urgentTotal} urgent`} />}
        <Box sx={{ flex: 1 }} />
        <BackButton sx={{ mb: 0, py: 0.75 }} />
      </Box>

      {/* Frozen toolbar: only the panes below scroll */}
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1, mb: 1.5 }}>
        <Box
          sx={{
            display: "flex", alignItems: "center", gap: 0.75, flex: "1 1 220px", minWidth: 0, maxWidth: 420,
            border: 1, borderColor: "divider", borderRadius: 2, px: 1.25, py: 0.25, bgcolor: "background.paper",
          }}
        >
          <SearchIcon fontSize="small" color="action" />
          <InputBase
            fullWidth
            placeholder="Search people, patients, messages"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputProps={{ "aria-label": "Search conversations", "data-testid": "thread-search" }}
          />
        </Box>
        {FILTERS.map(([key, label]) => (
          <Chip
            key={key}
            clickable
            size="small"
            label={label}
            aria-pressed={filter === key}
            color={filter === key ? "primary" : "default"}
            variant={filter === key ? "filled" : "outlined"}
            onClick={() => setFilter(key)}
            data-testid={`filter-${key}`}
            sx={{ fontWeight: 600 }}
          />
        ))}
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} data-testid="new-conversation" sx={{ textTransform: "none", fontWeight: 600 }}>
          New message
        </Button>
      </Box>

      </Box>

      <Box sx={{ display: "flex", gap: 2, flexGrow: 1, minHeight: 0 }}>
        {showList && (
          <Paper variant="outlined" sx={{ width: narrow ? "100%" : 360, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Box sx={{ overflowY: "auto", flexGrow: 1 }}>
              {filtering && !loading && !error && threads.length > 0 && shown.length === 0 ? (
                <Typography color="text.secondary" sx={{ p: 2 }} data-testid="thread-list-nomatch">
                  No conversations match. Clear the search or choose All.
                </Typography>
              ) : (
                <ThreadList threads={shown} loading={loading} error={error} selectedId={selected} onSelect={select} />
              )}
            </Box>
          </Paper>
        )}
        {showChat && (
          <Paper variant="outlined" sx={{ flexGrow: 1, minWidth: 0, minHeight: 0 }}>
            <Conversation
              key={selected || "none"}
              threadId={selected}
              onBack={narrow ? () => select(null) : undefined}
              onLeft={() => {
                select(null);
                reload();
              }}
            />
          </Paper>
        )}
      </Box>
      <NewConversationDialog
        open={creating}
        isAdmin={isAdmin}
        onClose={() => setCreating(false)}
        onCreated={(t) => {
          setCreating(false);
          upsert(t);
          select(t.id);
        }}
      />
    </Box>
  );
}
