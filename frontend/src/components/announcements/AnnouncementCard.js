import { Box, Chip, Paper, Stack, Typography } from "@mui/material";
import ImageIcon from "@mui/icons-material/Image";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import AttachFileIcon from "@mui/icons-material/AttachFile";
import { API_BASE_URL } from "../../config/api";
import { sanitizeHtml } from "../../utils/sanitizeHtml";

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp"];
const extOf = (name) => (name.includes(".") ? name.split(".").pop().toLowerCase() : "");
const fullUrl = (url) => (!url ? "" : /^https?:/i.test(url) ? url : `${API_BASE_URL}${url}`);

function FileIcon({ name }) {
  const ext = extOf(name);
  if (IMAGE_EXT.includes(ext)) return <ImageIcon fontSize="small" color="info" />;
  if (ext === "pdf") return <PictureAsPdfIcon fontSize="small" color="error" />;
  return <AttachFileIcon fontSize="small" color="action" />;
}

/**
 * One announcement as a patient or staff member sees it. Used on the dashboard and for the live preview
 * in the editor (where a file that is not uploaded yet has no link).
 */
export default function AnnouncementCard({ announcement }) {
  const files = announcement?.attachments || [];
  const images = files.filter((f) => f.url && IMAGE_EXT.includes(extOf(f.name)));
  const others = files.filter((f) => !images.includes(f));
  return (
    <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, bgcolor: "background.default", "&:hover": { borderColor: "primary.light" } }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600, color: "primary.main", mb: 1, fontSize: "0.95rem", overflowWrap: "anywhere" }}>
        {announcement?.title || "Title"}
      </Typography>
      <Box
        data-testid="announcement-html"
        sx={{ lineHeight: 1.5, fontSize: "0.85rem", color: "text.primary", overflowWrap: "anywhere", "& ul, & ol": { pl: 2.5, my: 0.5 }, "& a": { color: "primary.main" } }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(announcement?.body || "") }}
      />
      {images.map((f) => (
        <Box key={f.id} component="a" href={fullUrl(f.url)} target="_blank" rel="noopener noreferrer" sx={{ display: "block", mt: 1.5 }}>
          <Box component="img" src={fullUrl(f.url)} alt={f.name} sx={{ maxWidth: "100%", maxHeight: 160, borderRadius: 1, border: 1, borderColor: "divider", objectFit: "cover" }} />
        </Box>
      ))}
      {others.length > 0 && (
        <Stack spacing={0.75} sx={{ mt: 1.5 }} alignItems="flex-start">
          {others.map((f) => (
            <Chip
              key={f.id}
              size="small"
              variant="outlined"
              icon={<FileIcon name={f.name} />}
              label={f.name}
              component={f.url ? "a" : "div"}
              href={f.url ? fullUrl(f.url) : undefined}
              target={f.url ? "_blank" : undefined}
              rel={f.url ? "noopener noreferrer" : undefined}
              clickable={Boolean(f.url)}
              sx={{ maxWidth: "100%", height: "auto", "& .MuiChip-label": { whiteSpace: "normal", fontSize: "0.75rem" } }}
            />
          ))}
        </Stack>
      )}
    </Paper>
  );
}
