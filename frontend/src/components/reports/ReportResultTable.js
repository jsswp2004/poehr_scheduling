import { Box, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { formatCell, isNumeric } from "./reportUtils";

/**
 * The rows of a custom report. The header row sticks under the pinned title block (`stickyTop`), and rows
 * that match the report's highlight rule are tinted red. Used by the viewer and the builder's live preview.
 * With `onOpenRow`, a row that points at a record (`_ref`) can be clicked to open it.
 */
export default function ReportResultTable({ result, stickyTop = "64px", emptyText = "No rows match this report for these dates.", onOpenRow = null }) {
  if (!result) return null;
  const { columns, rows, totals } = result;
  const head = {
    position: "sticky",
    top: stickyTop,
    zIndex: 2,
    bgcolor: "background.default",
    fontWeight: 600,
    whiteSpace: "nowrap",
    borderBottom: "1px solid",
    borderColor: "divider",
  };
  return (
    <Box sx={{ overflowX: { xs: "auto", md: "clip" } }}>
      <Table size="small" aria-label="Report results">
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.key} align={isNumeric(c.type) ? "right" : "left"} sx={head}>
                {c.label}
              </TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={columns.length}>
                <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
                  {emptyText}
                </Typography>
              </TableCell>
            </TableRow>
          )}
          {rows.map((r, i) => (
            <TableRow
              key={i}
              hover
              onClick={onOpenRow && r._ref ? () => onOpenRow(r) : undefined}
              onKeyDown={onOpenRow && r._ref ? (e) => (e.key === "Enter" ? onOpenRow(r) : undefined) : undefined}
              tabIndex={onOpenRow && r._ref ? 0 : undefined}
              title={onOpenRow && r._ref ? "Open the whole document" : undefined}
              sx={{
                ...(onOpenRow && r._ref ? { cursor: "pointer" } : {}),
                ...(r._flag ? { bgcolor: (t) => alpha(t.palette.error.main, 0.08), "& td": { color: "error.main", fontWeight: 600 } } : {}),
              }}
            >
              {columns.map((c) => (
                <TableCell
                  key={c.key}
                  align={isNumeric(c.type) ? "right" : "left"}
                  sx={{ whiteSpace: "nowrap", fontVariantNumeric: isNumeric(c.type) ? "tabular-nums" : undefined }}
                >
                  {formatCell(r[c.key], c.type)}
                </TableCell>
              ))}
            </TableRow>
          ))}
          {totals && rows.length > 0 && (
            <TableRow sx={{ "& td": { fontWeight: 700, borderTop: "2px solid", borderColor: "divider" } }}>
              {columns.map((c) => (
                <TableCell key={c.key} align={isNumeric(c.type) ? "right" : "left"} sx={{ whiteSpace: "nowrap" }}>
                  {totals[c.key] === null || totals[c.key] === undefined ? "" : formatCell(totals[c.key], c.type)}
                </TableCell>
              ))}
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );
}
