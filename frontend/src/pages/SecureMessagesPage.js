import { useCallback, useState } from "react";
import { Box, Button, Paper, Typography, useMediaQuery, useTheme } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { useSearchParams } from "react-router-dom";
import ThreadList from "../components/secureMessages/ThreadList";
import Conversation from "../components/secureMessages/Conversation";
import NewConversationDialog from "../components/secureMessages/NewConversationDialog";
import useInbox from "../hooks/secureMessages/useInbox";
import { getCurrentUserFromToken } from "../utils/tokenManager";

export default function SecureMessagesPage() {
  const theme = useTheme();
  const narrow = useMediaQuery(theme.breakpoints.down("md"));
  const [params, setParams] = useSearchParams();
  const selected = params.get("thread") ? Number(params.get("thread")) : null;
  const { threads, loading, error, reload, upsert } = useInbox();
  const [creating, setCreating] = useState(false);
  const user = getCurrentUserFromToken() || {};
  const isAdmin = ["admin", "system_admin"].includes(user.role);

  const select = useCallback((id) => setParams(id ? { thread: String(id) } : {}), [setParams]);
  const showList = !narrow || !selected;
  const showChat = !narrow || !!selected;

  return (
    <Box sx={{ p: { xs: 1, md: 2 }, height: "calc(100vh - 90px)", display: "flex", flexDirection: "column" }}>
      <Typography variant="h5" sx={{ mb: 1 }}>
        Secure Messages
      </Typography>
      <Box sx={{ display: "flex", gap: 2, flexGrow: 1, minHeight: 0 }}>
        {showList && (
          <Paper variant="outlined" sx={{ width: narrow ? "100%" : 360, flexShrink: 0, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <Box sx={{ p: 1.5, borderBottom: 1, borderColor: "divider" }}>
              <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => setCreating(true)} data-testid="new-conversation">
                New
              </Button>
            </Box>
            <Box sx={{ overflowY: "auto", flexGrow: 1 }}>
              <ThreadList threads={threads} loading={loading} error={error} selectedId={selected} onSelect={select} />
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
