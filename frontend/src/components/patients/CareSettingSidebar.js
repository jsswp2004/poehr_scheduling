import { useState } from "react";
import { Box, List, ListItemButton, ListItemIcon, ListItemText, IconButton, Tooltip, Typography } from "@mui/material";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import PeopleIcon from "@mui/icons-material/People";
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";
import EmergencyIcon from "@mui/icons-material/Emergency";
import HotelIcon from "@mui/icons-material/Hotel";

export const CARE_SETTINGS = [
  { key: "", label: "All patients", Icon: PeopleIcon },
  { key: "ambulatory", label: "Ambulatory Care", Icon: MedicalServicesIcon },
  { key: "emergency", label: "Emergency Care", Icon: EmergencyIcon },
  { key: "acute", label: "Acute Care", Icon: HotelIcon },
];

export const COLLAPSED_KEY = "powerCareSidebarCollapsed";
export const SELECTED_KEY = "powerCareSetting";

const readStored = (key) => {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    return null; // private window or blocked storage: just don't remember
  }
};

const writeStored = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch (err) {
    // not remembered; nothing else to do
  }
};

/** The care setting remembered from last time ("" = all patients). */
export const storedCareSetting = () => {
  const value = readStored(SELECTED_KEY);
  return CARE_SETTINGS.some((c) => c.key === value) ? value : "";
};

export const rememberCareSetting = (value) => writeStored(SELECTED_KEY, value || "");

/**
 * Collapsible sidebar on the Patients page. Picking a care setting narrows the
 * patient list to patients whose latest visit is in that setting. It folds down
 * to an icon strip, and remembers whether it was open.
 */
function CareSettingSidebar({ value = "", onChange }) {
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === "1");

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    writeStored(COLLAPSED_KEY, next ? "1" : "0");
  };

  return (
    <Box
      component="nav"
      aria-label="Care settings"
      data-testid="care-setting-sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      sx={{
        width: collapsed ? 56 : 210,
        flexShrink: 0,
        transition: "width 0.2s",
        borderRight: 1,
        borderColor: "divider",
        bgcolor: "#f5faff",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between", px: collapsed ? 0 : 1.5, py: 0.5 }}>
        {!collapsed && (
          <Typography variant="overline" color="text.secondary">
            Care setting
          </Typography>
        )}
        <Tooltip title={collapsed ? "Expand sidebar" : "Collapse sidebar"} placement="right">
          <IconButton size="small" onClick={toggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!collapsed}>
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
      </Box>
      <List dense disablePadding>
        {CARE_SETTINGS.map(({ key, label, Icon }) => {
          const selected = value === key;
          return (
            <Tooltip key={key || "all"} title={collapsed ? label : ""} placement="right">
              <ListItemButton
                selected={selected}
                onClick={() => onChange(key)}
                aria-label={label}
                aria-current={selected ? "true" : undefined}
                data-testid={`care-setting-${key || "all"}`}
                sx={{ justifyContent: collapsed ? "center" : "flex-start", px: collapsed ? 0 : 1.5, borderLeft: 4, borderLeftColor: selected ? "primary.main" : "transparent" }}
              >
                <ListItemIcon sx={{ minWidth: collapsed ? 0 : 36, justifyContent: "center", color: selected ? "primary.main" : "inherit" }}>
                  <Icon fontSize="small" />
                </ListItemIcon>
                {!collapsed && <ListItemText primary={label} primaryTypographyProps={{ fontWeight: selected ? 700 : 500 }} />}
              </ListItemButton>
            </Tooltip>
          );
        })}
      </List>
    </Box>
  );
}

export default CareSettingSidebar;
