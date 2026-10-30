import { useState, useEffect, useCallback, useRef } from "react";
import { Alert, Box, Button, CircularProgress, Tabs, Tab, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";
import axios from "axios";
import { StaffingHeaderSlotContext } from "../components/staffing/StaffingTabHeader";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import BackButton from "../components/BackButton";
import { getAccessToken } from "../utils/tokenManager";
import { ownOrgIdFromToken, useActingOrg } from "../utils/actingOrg";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import {
  clearSelectedOrg,
  installStaffingOrgInterceptor,
  setSelectedOrgId,
} from "../utils/staffingOrg";
import StaffingCalendarTab from "./StaffingCalendarTab";
import StaffingUploadTab from "./StaffingUploadTab";
import StaffingAssignTab from "./StaffingAssignTab";
import StaffingRosterTab from "./StaffingRosterTab";
import StaffingReportsTab from "./StaffingReportsTab";
import StaffingUnitsTab from "./StaffingUnitsTab";
import StaffingTimeOffTab from "./StaffingTimeOffTab";
import StaffingRulesTab from "./StaffingRulesTab";
import StaffingMasterTab from "./StaffingMasterTab";
import StaffingAssistantDock from "../components/StaffingAssistantDock";
import StaffingStaffView from "./StaffingStaffView";

const ADMIN_ROLES = ["admin", "system_admin"];
const ALLOWED_ROLES = ["admin", "system_admin", "doctor", "nurse", "registrar", "staff"];

function StaffingPage() {
  // /staffing?tab=reports opens the Reports tab (the Reports home links straight to a report).
  const [tab, setTab] = useState(() =>
    new URLSearchParams(window.location.search).get("tab") === "reports" ? "reports" : "calendar"
  );
  const [assignSection, setAssignSection] = useState("schedules");
  const [headerSlot, setHeaderSlot] = useState(null);
  // Publish the frozen header's height so a tab can pin its own title row just beneath it.
  const stickyObserver = useRef(null);
  const stickyRef = useCallback((node) => {
    if (stickyObserver.current) {
      stickyObserver.current.disconnect();
      stickyObserver.current = null;
    }
    if (!node) return;
    // On the root so any tab content (a sibling of this block) can read it.
    const publish = () => document.documentElement.style.setProperty("--staffing-sticky-h", `${node.getBoundingClientRect().height}px`);
    publish();
    if (typeof ResizeObserver !== "undefined") {
      stickyObserver.current = new ResizeObserver(publish);
      stickyObserver.current.observe(node);
    }
  }, []);
  const [staffTab, setStaffTab] = useState("shifts");
  // Set by the Calendar's "Assign" button: {unit_id, date, shift_type}. Assign Schedule uses it once to open its add panel.
  const [assignPrefill, setAssignPrefill] = useState(null);
  const startAssign = useCallback((prefill) => {
    setAssignPrefill(prefill);
    setTab("assign");
  }, []);
  const clearAssignPrefill = useCallback(() => setAssignPrefill(null), []);
  const [role, setRole] = useState("");
  // Organization switcher (system admin only). Everyone else is ready at once.
  const [orgId, setOrgId] = useState("");
  const [orgReady, setOrgReady] = useState(false);
  const [timeOffCounts, setTimeOffCounts] = useState({ open_emergencies: 0, pending_requests: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    const token = getAccessToken();
    if (!token) {
      navigate("/login?redirect=staffing");
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const userRole = decoded.role || "";
      if (!ALLOWED_ROLES.includes(userRole)) {
        navigate("/solutions");
        return;
      }
      setRole(userRole);
    } catch (err) {
      navigate("/login?redirect=staffing");
    }
  }, [navigate]);

  // A system admin works in the organization chosen in the header (their own until they switch). The
  // choice is set before any tab loads data, and the tabs reload when it changes.
  const acting = useActingOrg();
  useEffect(() => {
    if (!role) return undefined;
    if (role !== "system_admin") {
      clearSelectedOrg();
      setOrgReady(true);
      return undefined;
    }
    installStaffingOrgInterceptor();
    const own = ownOrgIdFromToken();
    const pick = acting?.id || own;
    setSelectedOrgId(pick || null);
    setOrgId(pick ? String(pick) : "");
    setTimeOffCounts({ open_emergencies: 0, pending_requests: 0 });
    setOrgReady(true);
    return undefined;
  }, [role, acting?.id]);

  // Light poll so an open emergency call-out is visible from any tab.
  useEffect(() => {
    if (!role || !orgReady || role === "staff") return undefined;
    let cancelled = false;
    const check = async () => {
      try {
        const res = await axios.get(apiEndpoints.staffingTimeOff, {
          headers: getAuthHeaders(getAccessToken()),
          params: { status: "open,pending" },
        });
        if (!cancelled) {
          setTimeOffCounts({
            open_emergencies: res.data.open_emergencies || 0,
            pending_requests: res.data.pending_requests || 0,
          });
        }
      } catch (err) {
        // The badge is a convenience; ignore failures.
      }
    };
    check();
    const t = setInterval(check, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [role, orgReady, orgId]);

  const isAdmin = ADMIN_ROLES.includes(role);
  const isStaff = role === "staff";

  // Staff accounts get their own schedule, time off and assistant -- the web twin of the phone app.
  if (isStaff) {
    return (
      <Box sx={{ height: "100%", px: 2, py: 1.5, bgcolor: "background.paper", borderRadius: 2 }}>
        <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, mb: 0.5 }}>
          <Typography variant="h5">Staffing</Typography>
          <Box sx={{ flex: 1 }} />
          <BackButton to="/solutions" sx={{ mb: 0 }} />
        </Box>
        <StaffingStaffView tab={staffTab} onTabChange={setStaffTab} />
        <StaffingAssistantDock mode="staff" onNavigate={setStaffTab} />
      </Box>
    );
  }

  return (
    <Box sx={{ minHeight: "100%", px: 2, py: 1.5, bgcolor: "background.paper", borderRadius: 2 }}>
      <Box ref={stickyRef} sx={{ position: "sticky", top: 64, zIndex: 1000, bgcolor: "background.paper", pb: 0.5, pt: "18px", mt: "-18px" }}>
      <Box sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 1.5, mb: 0.5 }}>
        <Typography variant="h5">Staffing Center</Typography>
        <Box sx={{ flex: 1 }} />
        <BackButton to="/solutions" sx={{ mb: 0 }} />
      </Box>

      {orgReady && (
      <>
      {timeOffCounts.open_emergencies > 0 && tab !== "timeoff" && (
        <Alert
          severity="error"
          sx={{ mb: 1, py: 0 }}
          action={
            <Button color="inherit" size="small" onClick={() => setTab("timeoff")}>
              Find cover
            </Button>
          }
        >
          {timeOffCounts.open_emergencies} emergency call-out
          {timeOffCounts.open_emergencies === 1 ? "" : "s"} waiting for cover.
        </Alert>
      )}

      <Tabs
        value={tab}
        onChange={(e, val) => setTab(val)}
        sx={{
          mb: 1.5, minHeight: 40, borderBottom: 1, borderColor: "divider",
          "& .MuiTab-root": { minHeight: 40, py: 0.5 },
        }}
      >
        <Tab value="calendar" label="Calendar" />
        <Tab value="master" label="Master Schedule" />
        <Tab value="roster" label="Roster" />
        {isAdmin && <Tab value="assign" label="Assign Schedule" />}
        <Tab value="units" label="Units & Census" />
        <Tab
          value="timeoff"
          label={
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
              Time Off
              {timeOffCounts.open_emergencies + timeOffCounts.pending_requests > 0 && (
                <Box
                  component="span"
                  sx={{
                    minWidth: 20, height: 20, px: 0.75, borderRadius: 10,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    fontSize: 12, fontWeight: 700, lineHeight: 1, color: "#fff",
                    bgcolor: timeOffCounts.open_emergencies > 0 ? "error.main" : "warning.dark",
                  }}
                >
                  {timeOffCounts.open_emergencies + timeOffCounts.pending_requests}
                </Box>
              )}
            </Box>
          }
        />
        {isAdmin && <Tab value="upload" label="Upload CSV" />}
        <Tab value="reports" label="Reports" />
        <Tab value="rules" label="Staffing Standards" />
      </Tabs>
      {tab === "assign" && isAdmin && (
        <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 2, pb: 1.5 }}>
          <Typography variant="h5" component="h2" sx={{ fontWeight: 600 }}>
            Assign Schedule
          </Typography>
          <ToggleButtonGroup
            exclusive
            size="small"
            color="primary"
            value={assignSection}
            onChange={(e, v) => v && setAssignSection(v)}
            aria-label="What are you managing"
          >
            <ToggleButton value="schedules" sx={{ minHeight: 44, px: 2.5 }}>
              Recurring schedules
            </ToggleButton>
            <ToggleButton value="coverage" sx={{ minHeight: 44, px: 2.5 }}>
              Coverage requirements
            </ToggleButton>
            <ToggleButton value="labor" sx={{ minHeight: 44, px: 2.5 }}>
              Labor Hours
            </ToggleButton>
          </ToggleButtonGroup>
        </Box>
      )}
      <Box ref={setHeaderSlot} />
      </>
      )}
      </Box>

      {!orgReady ? (
        <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
          <CircularProgress />
        </Box>
      ) : (
      <StaffingHeaderSlotContext.Provider value={headerSlot}>
      {/* Room under the frozen header so floating field labels (date pickers, selects) are not clipped by it. */}
      <Box key={orgId || "own"} sx={{ pt: 1.25 }}>

      {tab === "calendar" && <StaffingCalendarTab isAdmin={isAdmin} onAssign={startAssign} onNavigate={setTab} />}
      {tab === "roster" && <StaffingRosterTab isAdmin={isAdmin} />}
      {tab === "units" && <StaffingUnitsTab isAdmin={isAdmin} />}
      {tab === "timeoff" && <StaffingTimeOffTab isAdmin={isAdmin} />}
      {tab === "upload" && isAdmin && <StaffingUploadTab />}
      {tab === "master" && <StaffingMasterTab isAdmin={isAdmin} />}
      {tab === "assign" && isAdmin && <StaffingAssignTab prefill={assignPrefill} onPrefillUsed={clearAssignPrefill} onNavigate={setTab} section={assignSection} />}
      {tab === "reports" && <StaffingReportsTab />}
      {tab === "rules" && <StaffingRulesTab isAdmin={isAdmin} />}
      </Box>
      </StaffingHeaderSlotContext.Provider>
      )}
      {role && orgReady && <StaffingAssistantDock mode="manager" onNavigate={setTab} />}
    </Box>
  );
}

export default StaffingPage;
