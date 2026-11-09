import { Box, Tab, Tabs } from "@mui/material";

/**
 * Acute Care's views, as tabs on the left just under the chart tabs: the patient list and the bed board.
 * `action` (optional) is a control shown at the right end of the same row, such as Surgery's Open Surgical Care.
 */
export default function AcuteViewTabs({ value, onChange, action = null }) {
  return (
    <Box sx={{ borderBottom: 1, borderColor: "divider", px: 1, display: "flex", alignItems: "center", gap: 1 }}>
      <Tabs
        value={value}
        onChange={(e, v) => onChange(v)}
        aria-label="Acute Care view"
        sx={{ minHeight: 34, flex: 1, "& .MuiTab-root": { minHeight: 34, py: 0.5, textTransform: "none", fontSize: "0.85rem" } }}
      >
        <Tab value="list" label="Patient List" data-testid="acute-tab-list" />
        <Tab value="beds" label="Bed Board" data-testid="acute-tab-beds" />
      </Tabs>
      {action}
    </Box>
  );
}
