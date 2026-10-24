/**
 * Side panel for the Staffing calendar's month view: the selected day at a
 * glance (each shift staffed / needed, and what is still to fill), with the
 * actions for it. The full explanation stays in the day dialog ("Open day").
 */
import { Box, Button, Chip, Divider, Paper, Stack, Typography } from "@mui/material";
import moment from "moment";
import { COVERAGE_STATUS } from "../../pages/staffingCoverage";
import { SHIFT_NAME, summarizeShifts, toFillList } from "../../utils/calendar/staffingSummary";

export default function StaffingDayPanel({
  iso,
  info,
  isAdmin = false,
  canFill = false,
  fillLabel = "Assign",
  onFill,
  onOpenDay,
  onAdd,
}) {
  const meta = info && COVERAGE_STATUS[info.status];
  const shifts = summarizeShifts(info);
  const toFill = toFillList(info);

  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }} aria-label="Selected day">
      <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, flex: 1 }}>
          {moment(iso).format("ddd, MMM D")}
        </Typography>
        {meta && info.status !== "unknown" && (
          <Chip
            size="small"
            label={`${meta.icon} ${meta.label}`}
            sx={{ bgcolor: meta.bg, color: meta.color, fontWeight: 600 }}
          />
        )}
      </Stack>

      {info?.open_emergencies > 0 && (
        <Typography variant="body2" color="error" sx={{ mb: 1 }}>
          {info.open_emergencies} emergency call-out{info.open_emergencies === 1 ? "" : "s"} waiting for cover
        </Typography>
      )}

      {shifts.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No coverage requirement applies to this day.
        </Typography>
      ) : (
        <Stack spacing={0.75}>
          {shifts.map((s) => {
            const m = COVERAGE_STATUS[s.status] || COVERAGE_STATUS.unknown;
            return (
              <Box key={s.shift_type} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Typography variant="body2" sx={{ width: 64 }}>
                  {SHIFT_NAME[s.shift_type] || s.shift_type}
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 700, color: m.color, flex: 1 }}>
                  {s.status === "unknown" ? "No census" : `${s.assigned} of ${s.required}`}
                </Typography>
                <Typography variant="caption" sx={{ color: m.color, fontWeight: 600 }}>
                  {m.icon} {m.label}
                </Typography>
              </Box>
            );
          })}
        </Stack>
      )}

      {toFill.length > 0 && (
        <>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="overline" color="text.secondary">
            To fill
          </Typography>
          <Stack spacing={1} sx={{ mt: 0.5 }}>
            {toFill.map((item) => (
              <Box key={item.key} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {item.unit_name || "Whole organization"} · {item.shift_label}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {item.kind === "rn"
                      ? `${item.need} more RN${item.need === 1 ? "" : "s"} needed`
                      : `${item.need} more needed`}
                  </Typography>
                </Box>
                {canFill && (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => onFill && onFill(item)}
                    aria-label={`${fillLabel} ${item.unit_name || "organization"} ${item.shift_label}`}
                  >
                    {fillLabel}
                  </Button>
                )}
              </Box>
            ))}
          </Stack>
        </>
      )}

      <Divider sx={{ my: 1.5 }} />
      <Stack direction="row" spacing={1}>
        <Button size="small" variant="outlined" onClick={onOpenDay} sx={{ flex: 1 }}>
          Open day
        </Button>
        {isAdmin && onAdd && (
          <Button size="small" variant="contained" onClick={onAdd} sx={{ flex: 1 }}>
            + Add shift
          </Button>
        )}
      </Stack>
    </Paper>
  );
}
