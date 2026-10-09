import { Badge, Box, Chip, List, ListItemButton, ListItemText, Skeleton, Typography } from "@mui/material";
import PersonIcon from "@mui/icons-material/Person";
import GroupIcon from "@mui/icons-material/Group";
import TagIcon from "@mui/icons-material/Tag";
import LocalHospitalIcon from "@mui/icons-material/LocalHospital";

export const timeLabel = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
};

const KindIcon = ({ kind }) => {
  const sx = { fontSize: 20, color: "text.secondary" };
  if (kind === "patient") return <LocalHospitalIcon sx={sx} />;
  if (kind === "group") return <GroupIcon sx={sx} />;
  if (kind === "channel") return <TagIcon sx={sx} />;
  return <PersonIcon sx={sx} />;
};

export default function ThreadList({ threads, loading, error, selectedId, onSelect }) {
  if (loading) {
    return (
      <Box sx={{ p: 2 }} data-testid="thread-list-loading">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={48} />
        ))}
      </Box>
    );
  }
  if (error) {
    return (
      <Typography color="error" sx={{ p: 2 }} role="alert">
        {error}
      </Typography>
    );
  }
  if (!threads.length) {
    return (
      <Typography color="text.secondary" sx={{ p: 2 }} data-testid="thread-list-empty">
        No conversations yet. Start one with the New button.
      </Typography>
    );
  }
  return (
    <List disablePadding data-testid="thread-list">
      {threads.map((t) => (
        <ListItemButton key={t.id} selected={t.id === selectedId} onClick={() => onSelect(t.id)} data-testid={`thread-${t.id}`} sx={{ alignItems: "flex-start", gap: 1.5 }}>
          <Box sx={{ pt: 0.5 }}>
            <Badge color={t.urgent_unread ? "error" : "primary"} badgeContent={t.unread} max={99}>
              <KindIcon kind={t.kind} />
            </Badge>
          </Box>
          <ListItemText
            disableTypography
            primary={
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                <Typography noWrap sx={{ fontWeight: t.unread ? 700 : 500 }}>
                  {t.title}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                  {timeLabel(t.last_message && t.last_message.at)}
                </Typography>
              </Box>
            }
            secondary={
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                {t.urgent_unread > 0 && <Chip size="small" color="error" label="Urgent" />}
                <Typography variant="body2" color="text.secondary" noWrap component="div">
                  {t.last_message ? `${t.last_message.sender}: ${t.last_message.preview}` : "No messages yet"}
                </Typography>
              </Box>
            }
          />
        </ListItemButton>
      ))}
    </List>
  );
}
