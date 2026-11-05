import { Box } from "@mui/material";
import { STATUS_META } from "./surgeryUtils";

/** A status as a small coloured label, in the colour the planner legend uses. */
export default function StatusChip({ status, label }) {
  const meta = STATUS_META[status] || STATUS_META.pending;
  return (
    <Box
      component="span"
      sx={{
        display: "inline-block",
        px: 1,
        py: 0.25,
        borderRadius: 1,
        fontSize: 12,
        fontWeight: 600,
        whiteSpace: "nowrap",
        backgroundColor: meta.bg,
        color: meta.fg,
        border: `1px solid ${meta.border}`,
      }}
    >
      {label || meta.label}
    </Box>
  );
}
