import { useCallback, useState } from "react";
import MaintenancePage from "./MaintenancePage";
import EnvironmentProfilePage from "./EnvironmentProfilePage";
import UploadTab from "../components/UploadTab";
import BackButton from "../components/BackButton";
import PatientHeaderSettings from "../components/patientHeader/PatientHeaderSettings";
import TabManagementSettings from "../components/chartTabs/TabManagementSettings";
import ReferralSettings from "../components/referrals/ReferralSettings";
import TaskSettings from "../components/tasks/TaskSettings";
import DictationSettings from "../components/dictation/DictationSettings";
import FacilityPicker from "../components/facility/FacilityPicker";
import SingleFacilityOnly from "../components/facility/SingleFacilityOnly";
import { Box, Chip, Typography } from "@mui/material";
import { SettingsToolbarSlotContext } from "../components/settings/SettingsToolbarSlot";

const TABS = [
  { value: "maintenance", label: "Schedule Maintenance" },
  { value: "env", label: "Environment Profile" },
  { value: "uploads", label: "Uploads / Downloads" },
  { value: "patient-header", label: "Patient Header" },
  { value: "tab-management", label: "Tab Management" },
  { value: "referrals", label: "Referrals" },
  { value: "tasks", label: "Tasks" },
  { value: "dictation", label: "Dictation" },
];

function SettingsPage() {
  const [tab, setTab] = useState("maintenance");
  // The tab toolbar renders into this element, inside the pinned block (see SettingsToolbarSlot)
  const [toolbarSlot, setToolbarSlot] = useState(null);
  // Publish the pinned block's height so pinned tables and side panels can stack under it
  const pinRef = useCallback((node) => {
    if (!node) return;
    const publish = () => document.documentElement.style.setProperty("--settings-sticky-h", `${node.offsetHeight}px`);
    publish();
    if (typeof ResizeObserver !== "undefined") new ResizeObserver(publish).observe(node);
  }, []);

  return (
    <SettingsToolbarSlotContext.Provider value={toolbarSlot}>
      <Box sx={{ textAlign: "left", width: "100%", px: { xs: 2, md: 3 }, pb: 3 }}>
        {/* Pinned title, tabs and toolbar (stays put while the body scrolls) */}
        <Box
          ref={pinRef}
          sx={{
            position: "sticky", top: 64, zIndex: 1000, bgcolor: "background.paper",
            pt: "18px", mt: "-18px", borderBottom: "1px solid #dfe4ec",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography variant="h5" component="h1" sx={{ fontWeight: 500 }}>
              Settings
            </Typography>
            <Box sx={{ flex: 1 }} />
            <BackButton sx={{ mb: 0, py: 0.75 }} />
          </Box>
          <Typography variant="body2" sx={{ color: "text.secondary", fontSize: 12, mt: -0.25 }}>
            Clinic preferences for scheduling, charts and notes
          </Typography>
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", py: 1 }} role="tablist" aria-label="Settings">
            {TABS.map((t) => (
              <Chip
                key={t.value}
                size="small"
                clickable
                role="tab"
                aria-selected={tab === t.value}
                color={tab === t.value ? "primary" : "default"}
                variant={tab === t.value ? "filled" : "outlined"}
                label={t.label}
                onClick={() => setTab(t.value)}
                data-testid={`settings-tab-${t.value}`}
              />
            ))}
          </Box>
          <Box ref={setToolbarSlot} sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", "&:not(:empty)": { pb: 1 } }} />
        </Box>
        <FacilityPicker>
          <Box key={tab} sx={{ pt: 1.75, maxWidth: tab === "maintenance" ? "none" : 1180, mx: "auto" }}>
            {tab === "maintenance" && (
              <SingleFacilityOnly what="Provider schedules">
                <MaintenancePage />
              </SingleFacilityOnly>
            )}
            {tab === "env" && <EnvironmentProfilePage />}
            {tab === "uploads" && (
              <SingleFacilityOnly what="An upload">
                <UploadTab />
              </SingleFacilityOnly>
            )}
            {tab === "patient-header" && <PatientHeaderSettings />}
            {tab === "tab-management" && <TabManagementSettings />}
            {tab === "referrals" && <ReferralSettings />}
            {tab === "tasks" && <TaskSettings />}
            {tab === "dictation" && <DictationSettings />}
          </Box>
        </FacilityPicker>
      </Box>
    </SettingsToolbarSlotContext.Provider>
  );
}

export default SettingsPage;
