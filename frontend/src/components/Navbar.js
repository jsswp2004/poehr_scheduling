import { useNavigate, useLocation } from "react-router-dom";
import { toast } from "../components/SimpleToast";
import logo from "../assets/POWER_Logo.png";
import { jwtDecode } from "jwt-decode";
import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { API_BASE_URL } from "../config/api";
import { getValidToken, clearAuthData } from "../utils/auth";
import { getAccessToken } from "../utils/tokenManager";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Box from "@mui/material/Box";
import Avatar from "@mui/material/Avatar";
import Tooltip from "@mui/material/Tooltip";
import Badge from "@mui/material/Badge";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Divider from "@mui/material/Divider";
import MenuIcon from "@mui/icons-material/Menu";
import useForceUpdate from "../utils/useForceUpdate";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import ChatIcon from "@mui/icons-material/Chat";
import DescriptionIcon from "@mui/icons-material/Description";
import HowToRegIcon from "@mui/icons-material/HowToReg";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import MedicalInformationIcon from "@mui/icons-material/MedicalInformation";
import GroupsIcon from "@mui/icons-material/Groups";
import VideocamIcon from "@mui/icons-material/Videocam";
import MicIcon from "@mui/icons-material/Mic";
import ScienceIcon from "@mui/icons-material/Science";
import PeopleIcon from "@mui/icons-material/People";
import BarChartIcon from "@mui/icons-material/BarChart";
import AssessmentIcon from "@mui/icons-material/Assessment";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import AccountCircleIcon from "@mui/icons-material/AccountCircle";
import ForumIcon from "@mui/icons-material/Forum";
import PolicyIcon from "@mui/icons-material/Policy";
import useSecureUnread from "../hooks/secureMessages/useSecureUnread";
import { moduleEnabled } from "../utils/orgModules";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faSignOutAlt } from "@fortawesome/free-solid-svg-icons";

// Roles that can use the clinical/staff modules (matches the login redirects
// and the Staffing page guard).
const STAFF_MODULE_ROLES = [
  "admin",
  "system_admin",
  "doctor",
  "nurse",
  "registrar",
];

// Module links shown in the header. `to` is where the link goes; `isActive`
// decides which one is highlighted for the current URL. Patients page tabs are
// kept in ?tab=, so Documentation and Scheduler share /patients and are told
// apart by that parameter.
// Views of the Patients page that have their own header icon (opened with ?tab=...).
const PATIENTS_PAGE_VIEWS = ["appointments", "team", "analytics", "register"];

// Roles that can use secure staff messaging (the server decides; this only hides the icon).
const SECURE_MESSAGE_ROLES = ["doctor", "nurse", "registrar", "receptionist", "admin"];

const MODULE_LINKS = [
  {
    key: "check-in",
    module: "scheduling",
    label: "Check-In",
    to: "/check-in",
    Icon: HowToRegIcon,
    roles: ["admin", "system_admin", "registrar"], // the roles the Check-In page allows
    isActive: (path) => path.startsWith("/check-in"),
  },
  {
    key: "documentation",
    module: "clinical_documentation",
    label: "Documentation",
    to: "/patients",
    Icon: DescriptionIcon,
    roles: STAFF_MODULE_ROLES,
    isActive: (path, tab) =>
      path.startsWith("/patients") &&
      !(path === "/patients" && PATIENTS_PAGE_VIEWS.includes(tab)),
  },
  {
    key: "scheduler",
    module: "scheduling",
    label: "Scheduler",
    to: "/patients?tab=appointments",
    Icon: CalendarMonthIcon,
    roles: STAFF_MODULE_ROLES,
    isActive: (path, tab) =>
      (path === "/patients" && tab === "appointments") ||
      path.startsWith("/appointments"),
  },
  {
    key: "team",
    module: "scheduling",
    label: "Team",
    to: "/patients?tab=team",
    Icon: PeopleIcon,
    roles: STAFF_MODULE_ROLES,
    isActive: (path, tab) => path === "/patients" && tab === "team",
  },
  {
    key: "analytics",
    module: "scheduling",
    label: "Analytics",
    to: "/patients?tab=analytics",
    Icon: BarChartIcon,
    roles: STAFF_MODULE_ROLES,
    isActive: (path, tab) => path === "/patients" && tab === "analytics",
  },
  {
    key: "register",
    module: "patient_portal",
    label: "Register",
    to: "/patients?tab=register",
    Icon: PersonAddIcon,
    roles: ["admin", "system_admin", "registrar"],
    isActive: (path, tab) => path === "/patients" && tab === "register",
  },
  {
    key: "portal",
    module: "patient_portal",
    label: "Patient Portal",
    to: "/dashboard",
    Icon: MedicalInformationIcon,
    roles: null, // every signed-in user ...
    notFor: ["staff"], // ... except Staffing-only logins, who have no business in the portal
    isActive: (path) => path === "/dashboard",
  },
  {
    key: "staffing",
    module: "staffing",
    label: "Staffing",
    to: "/staffing",
    Icon: GroupsIcon,
    roles: [...STAFF_MODULE_ROLES, "staff"], // Staffing-only logins use this module too
    isActive: (path) => path.startsWith("/staffing"),
  },
  {
    key: "telehealth",
    module: "telehealth",
    label: "Telehealth",
    to: "/telehealth",
    Icon: VideocamIcon,
    roles: ["doctor", "nurse", "receptionist", "registrar", "admin", "system_admin"],
    isActive: (path) => path.startsWith("/telehealth"),
  },
  {
    key: "dictate",
    module: "dictation",
    label: "Dictate",
    to: "/dictate",
    Icon: MicIcon,
    roles: ["doctor", "nurse", "admin", "system_admin"],
    isActive: (path) => path.startsWith("/dictate"),
  },
  {
    key: "lab-inbox",
    module: "orders_labs",
    label: "Lab Results",
    to: "/lab-inbox",
    Icon: ScienceIcon,
    roles: ["doctor", "nurse", "system_admin"], // the roles that review results
    isActive: (path) => path.startsWith("/lab-inbox"),
  },
  {
    key: "secure-messages",
    module: "communicator",
    label: "Secure Messages",
    to: "/secure-messages",
    Icon: ForumIcon,
    roles: SECURE_MESSAGE_ROLES,
    isActive: (path) => path.startsWith("/secure-messages") && !path.startsWith("/secure-messages/audit"),
  },
  {
    key: "secure-audit",
    module: "communicator",
    label: "Messaging Audit Log",
    to: "/secure-messages/audit",
    Icon: PolicyIcon,
    roles: ["admin", "system_admin"], // the roles that hold the audit right by default (the server decides)
    isActive: (path) => path.startsWith("/secure-messages/audit"),
  },
];

function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [role, setRole] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false); // Make it stateful
  const [logoUrl, setLogoUrl] = useState(null);
  const [profilePic, setProfilePic] = useState(null);
  const forceUpdate = useForceUpdate();
  // Compact menu (below the lg breakpoint the icon row collapses into this).
  const [menuAnchor, setMenuAnchor] = useState(null);
  const closeMenu = () => setMenuAnchor(null);

  // Update authentication state when tokens change
  useEffect(() => {
    const updateAuthState = () => {
      const token = getAccessToken();
      setIsAuthenticated(!!token);
    };

    // Set initial state
    updateAuthState();

    // Listen for storage changes
    const handleStorageChange = (e) => {
      if (e.key === "access_token") {
        updateAuthState();
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);
  // Function to fetch user data and update state
  const fetchUserData = useCallback(async () => {
    try {
      // Don't fetch if not authenticated
      if (!isAuthenticated) {
        setUsername("");
        setRole("");
        setLogoUrl(null);
        setOrganizationName("");
        setProfilePic(null);
        return;
      }

      const token = await getValidToken();
      if (!token) {
        setUsername("");
        setRole("");
        setLogoUrl(null);
        setOrganizationName("");
        setProfilePic(null);
        return;
      }

      const decoded = jwtDecode(token);
      const userId = decoded.user_id;
      const firstName = decoded.first_name || decoded.username || "";
      setUsername(firstName);
      setRole(decoded.role || "");

      const response = await axios.get(`${API_BASE_URL}/api/users/${userId}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // Get organization logo directly from the organization data
      const orgLogo = response.data.organization_logo;
      if (orgLogo) {
        // The organization_logo field from UserSerializer already includes the full URL
        setLogoUrl(
          orgLogo.startsWith("http") ? orgLogo : `${API_BASE_URL}${orgLogo}`
        );
      } else {
        setLogoUrl(null);
      }
      setOrganizationName(response.data.organization_name || "");
      // Fix: Only set profilePic if the value is not empty/null and is a valid string
      if (
        response.data.profile_picture &&
        typeof response.data.profile_picture === "string" &&
        response.data.profile_picture.trim() !== ""
      ) {
        setProfilePic(
          response.data.profile_picture.startsWith("http")
            ? response.data.profile_picture
            : `${API_BASE_URL}${response.data.profile_picture}`
        );
      } else {
        setProfilePic(null);
      }
    } catch (err) {
      console.error("Failed to load user data:", err);
      // If there's an authentication error, clear the auth data
      if (err.response?.status === 401) {
        clearAuthData();
        setUsername("");
        setRole("");
        setLogoUrl(null);
        setOrganizationName("");
        setProfilePic(null);
      }
    }
  }, [isAuthenticated]); // Run fetchUserData on component mount and when authentication changes
  useEffect(() => {
    if (isAuthenticated) {
      fetchUserData();
    } else {
      // Clear user data when not authenticated
      setUsername("");
      setRole("");
      setLogoUrl(null);
      setOrganizationName("");
      setProfilePic(null);
    }

    // Listen for custom profile update events
    const handleProfileUpdate = () => {
      if (isAuthenticated) {
        fetchUserData();
        forceUpdate(); // Force the navbar to re-render
      }
    };

    window.addEventListener("profile-updated", handleProfileUpdate);

    // Force a refresh when authenticated and periodically
    let interval = null;
    if (isAuthenticated) {
      interval = setInterval(() => {
        fetchUserData();
      }, 300000); // Refresh every 5 minutes (300000ms) to reduce API calls
    }

    return () => {
      window.removeEventListener("profile-updated", handleProfileUpdate);
      if (interval) clearInterval(interval);
    };
  }, [isAuthenticated, forceUpdate, fetchUserData]);
  const handleLogoClick = (e) => {
    e.preventDefault(); // Prevent default link behavior

    // Show confirmation toast instead of browser alert
    toast.warning(
      <div>
        <p>
          <strong>Are you sure you want to log out?</strong>
        </p>
        <div style={{ marginTop: "10px" }}>
          <button
            onClick={() => performLogout()}
            style={{
              marginRight: "10px",
              padding: "5px 15px",
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Yes, Log Out
          </button>
          <button
            onClick={() => toast.dismiss()}
            style={{
              padding: "5px 15px",
              backgroundColor: "#64748b",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>,
      { duration: 0 } // Keep toast open until user decides
    );
  };

  const performLogout = () => {
    // Dismiss any open toasts
    toast.dismiss();

    // Clear all authentication data using the centralized function
    clearAuthData();

    // Also clear any legacy token storage that might exist
    localStorage.removeItem("access_token"); // Old format key
    localStorage.removeItem("refresh_token"); // Old format key
    localStorage.removeItem("user_data");
    sessionStorage.clear();

    // Update authentication state immediately
    setIsAuthenticated(false);

    // Clear user data immediately
    setUsername("");
    setRole("");
    setLogoUrl(null);
    setOrganizationName("");
    setProfilePic(null);

    // Dispatch storage event to notify other components
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: "access_token",
        newValue: null,
      })
    );

    toast.success("Logged out successfully! 👋");

    // Add a small delay to ensure the toast is visible, then refresh the page
    setTimeout(() => {
      // Force a complete page refresh to clear all cached state
      window.location.href = "/solutions";
    }, 1000);
  };
  const handleLogout = () => {
    // Show confirmation toast instead of browser alert
    toast.warning(
      <div>
        <p>
          <strong>Are you sure you want to log out?</strong>
        </p>
        <div style={{ marginTop: "10px" }}>
          <button
            onClick={() => performLogout()}
            style={{
              marginRight: "10px",
              padding: "5px 15px",
              backgroundColor: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Yes, Log Out
          </button>
          <button
            onClick={() => toast.dismiss()}
            style={{
              padding: "5px 15px",
              backgroundColor: "#64748b",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>,
      { duration: 0 } // Keep toast open until user decides
    );
  };

  // Lab results waiting for review (and results waiting for a patient): a badge on the Lab Results icon.
  const [labWaiting, setLabWaiting] = useState({ count: 0, critical: 0, unmatched: 0 });
  const canSeeLab = ["doctor", "nurse", "system_admin"].includes(role);

  const refreshLabWaiting = useCallback(async () => {
    const token = getAccessToken();
    if (!token) return;
    try {
      const res = await axios.get(`${API_BASE_URL}/api/lab-reports/inbox/`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { summary: 1 },
      });
      setLabWaiting({
        count: Number(res.data.count) || 0,
        critical: Number(res.data.critical) || 0,
        unmatched: Number(res.data.unmatched) || 0,
      });
    } catch (err) {
      // No access, offline, or the add-on is off: show no badge rather than an error.
      setLabWaiting({ count: 0, critical: 0, unmatched: 0 });
    }
  }, []);
  useEffect(() => {
    if (!isAuthenticated || !canSeeLab) return undefined;
    refreshLabWaiting();
    const timer = setInterval(refreshLabWaiting, 120000);
    window.addEventListener("focus", refreshLabWaiting);
    window.addEventListener("lab-inbox-changed", refreshLabWaiting);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refreshLabWaiting);
      window.removeEventListener("lab-inbox-changed", refreshLabWaiting);
    };
  }, [isAuthenticated, canSeeLab, refreshLabWaiting, location.pathname]);

  const isSystemAdmin = role === "system_admin";

  // Unread secure messages: a badge on the Secure Messages icon.
  const secureUnread = useSecureUnread(isAuthenticated && SECURE_MESSAGE_ROLES.includes(role));

  // Module links this user may see, with the current page flagged.
  const currentTab = new URLSearchParams(location.search).get("tab");
  const moduleLinks = MODULE_LINKS.filter(
    (m) =>
      (!m.roles || m.roles.includes(role)) &&
      !(m.notFor && m.notFor.includes(role)) &&
      moduleEnabled(m.module)
  ).map((m) => ({ ...m, active: m.isActive(location.pathname, currentTab) }));

  // Waiting-item count per module, shown next to the label in the compact menu.
  const menuBadge = (key) =>
    key === "lab-inbox"
      ? labWaiting.count + labWaiting.unmatched
      : key === "secure-messages"
      ? secureUnread.unread
      : 0;
  const anyWaiting = moduleLinks.some((m) => menuBadge(m.key) > 0);
  const showCommunicator =
    (role === "system_admin" || role === "admin" || role === "registrar") &&
    location.pathname !== "/communicator" &&
    location.pathname !== "/dashboard";
  const showAdminPortal =
    (role === "admin" || role === "registrar" || role === "receptionist" || role === "system_admin") &&
    location.pathname !== "/dashboard";
  const showAccount = role === "admin" || role === "system_admin";
  const showReports = STAFF_MODULE_ROLES.includes(role) && moduleEnabled("staffing");
  const goTo = (path) => {
    closeMenu();
    navigate(path);
  };

  // Add greeting function
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 18) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <AppBar position="fixed" color="primary" sx={{ zIndex: 1201 }}>
      <Toolbar
        sx={{ display: "flex", justifyContent: "space-between", minHeight: 64, gap: 1 }}
      >
        {" "}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flex: 1,
            minWidth: 0,
            cursor: "pointer",
          }}
          onClick={handleLogoClick}
        >
          <Avatar
            src={logoUrl || logo}
            alt="Logo"
            sx={{
              height: 40,
              width: 40,
              bgcolor: "white",
              mr: 1,
              borderRadius: 1,
              p: 0.5,
            }}
            variant="rounded"
            onError={(e) => {
              console.warn(
                "Failed to load organization logo, falling back to default logo"
              );
              e.target.src = logo;
            }}
          />{" "}
          <Typography
            variant="h6"
            noWrap
            sx={{
              color: "white",
              fontWeight: 450,
              letterSpacing: 1,
              fontFamily: "inherit",
              fontSize: { xs: "1rem", md: "1.25rem" },
              minWidth: 0,
            }}
          >
            {location.pathname === "/communicator"
              ? `${organizationName || "POWER"} Communicator`
              : location.pathname === "/dashboard"
              ? `${organizationName || "POWER"} Portal`
              : `${organizationName || "POWER"}`}
          </Typography>
          {/*{organizationName && (
            <Typography
              variant="h6"
              noWrap
              sx={{
                color: "white",
                fontWeight: 450,
                ml: 2,
                flex: 1,
                textAlign: "center",
                fontFamily: "inherit",
              }}
            >
              {organizationName}
            </Typography>
          )}
          */}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          {isAuthenticated && (
            <>
              {/* Module links: Documentation, Scheduler, Patient Portal, Staffing */}
              {role && moduleLinks.length > 0 && (
                <Box
                  component="nav"
                  aria-label="Modules"
                  sx={{
                    display: { xs: "none", lg: "flex" },
                    alignItems: "center",
                    mr: 1,
                    pr: 1,
                    borderRight: "1px solid rgba(255,255,255,0.35)",
                  }}
                >
                  {moduleLinks.map(({ key, label, to, Icon, active }) => (
                    <Tooltip
                      key={key}
                      title={
                        key === "lab-inbox" && labWaiting.count + labWaiting.unmatched > 0
                          ? `${label}: ${labWaiting.count} to review${
                              labWaiting.critical > 0 ? ` (${labWaiting.critical} critical)` : ""
                            }${labWaiting.unmatched > 0 ? `, ${labWaiting.unmatched} waiting for a patient` : ""}`
                          : key === "secure-messages" && secureUnread.unread > 0
                          ? `${label}: ${secureUnread.unread} unread${secureUnread.urgent > 0 ? ` (${secureUnread.urgent} urgent)` : ""}`
                          : label
                      }
                    >
                      <IconButton
                        color="inherit"
                        sx={{
                          mr: 0.5,
                          borderRadius: 1,
                          bgcolor: active
                            ? "rgba(255,255,255,0.22)"
                            : "transparent",
                          boxShadow: active
                            ? "inset 0 -3px 0 0 #fff"
                            : "none",
                          "&:hover": {
                            bgcolor: active
                              ? "rgba(255,255,255,0.28)"
                              : "rgba(255,255,255,0.12)",
                          },
                        }}
                        onClick={() => navigate(to)}
                        aria-label={label}
                        aria-current={active ? "page" : undefined}
                        data-testid={`nav-module-${key}`}
                      >
                        {key === "lab-inbox" && labWaiting.count + labWaiting.unmatched > 0 ? (
                          <Badge
                            badgeContent={labWaiting.count + labWaiting.unmatched}
                            max={99}
                            color={labWaiting.critical > 0 ? "error" : "warning"}
                            data-testid="lab-waiting-badge"
                          >
                            <Icon sx={{ color: "white" }} />
                          </Badge>
                        ) : key === "secure-messages" && secureUnread.unread > 0 ? (
                          <Badge
                            badgeContent={secureUnread.unread}
                            max={99}
                            color={secureUnread.urgent > 0 ? "error" : "warning"}
                            data-testid="secure-unread-badge"
                          >
                            <Icon sx={{ color: "white" }} />
                          </Badge>
                        ) : (
                          <Icon sx={{ color: "white" }} />
                        )}
                      </IconButton>
                    </Tooltip>
                  ))}
                </Box>
              )}

              {/* Compact menu: replaces the icon row below the lg breakpoint */}
              {role && (
                <>
                  <IconButton
                    color="inherit"
                    aria-label="Open menu"
                    aria-haspopup="true"
                    aria-expanded={Boolean(menuAnchor)}
                    onClick={(e) => setMenuAnchor(e.currentTarget)}
                    sx={{ display: { xs: "inline-flex", lg: "none" }, mr: 0.5 }}
                    data-testid="nav-compact-menu"
                  >
                    <Badge color="warning" variant="dot" invisible={!anyWaiting}>
                      <MenuIcon sx={{ color: "white" }} />
                    </Badge>
                  </IconButton>
                  <Menu
                    anchorEl={menuAnchor}
                    open={Boolean(menuAnchor)}
                    onClose={closeMenu}
                    PaperProps={{ sx: { minWidth: 240, maxHeight: "70vh" } }}
                  >
                    {moduleLinks.map(({ key, label, to, Icon, active }) => (
                      <MenuItem
                        key={key}
                        selected={active}
                        onClick={() => goTo(to)}
                        aria-current={active ? "page" : undefined}
                      >
                        <ListItemIcon>
                          <Icon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>{label}</ListItemText>
                        {menuBadge(key) > 0 && (
                          <Box
                            component="span"
                            sx={{
                              ml: 1,
                              minWidth: 20,
                              height: 20,
                              px: 0.75,
                              borderRadius: 10,
                              display: "inline-flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 12,
                              fontWeight: 700,
                              color: "#fff",
                              bgcolor: "warning.dark",
                            }}
                          >
                            {menuBadge(key) > 99 ? "99+" : menuBadge(key)}
                          </Box>
                        )}
                      </MenuItem>
                    ))}
                    {(showReports || showCommunicator || showAdminPortal || showAccount) && <Divider />}
                    {showReports && (
                      <MenuItem onClick={() => goTo("/reports")}>
                        <ListItemIcon>
                          <AssessmentIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Reports</ListItemText>
                      </MenuItem>
                    )}
                    {showCommunicator && (
                      <MenuItem onClick={() => goTo("/communicator")}>
                        <ListItemIcon>
                          <ChatIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Communicator</ListItemText>
                      </MenuItem>
                    )}
                    {showAdminPortal && (
                      <MenuItem onClick={() => goTo("/admin/")}>
                        <ListItemIcon>
                          <AdminPanelSettingsIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Management Portal</ListItemText>
                      </MenuItem>
                    )}
                    {showAccount && (
                      <MenuItem onClick={() => goTo("/account")}>
                        <ListItemIcon>
                          <AccountCircleIcon fontSize="small" />
                        </ListItemIcon>
                        <ListItemText>Account Settings</ListItemText>
                      </MenuItem>
                    )}
                  </Menu>
                </>
              )}

              {/* Reports Icon Link - everyone who can use the Staffing reports */}
              {showReports && (
                <Tooltip title="Reports">
                  <IconButton
                    color="inherit"
                    sx={{
                      mr: 1,
                      display: { xs: "none", lg: "inline-flex" },
                      bgcolor: location.pathname.startsWith("/reports") ? "rgba(255,255,255,0.2)" : "transparent",
                    }}
                    onClick={() => navigate("/reports")}
                    aria-label="Reports"
                  >
                    <AssessmentIcon sx={{ color: "white" }} />
                  </IconButton>
                </Tooltip>
              )}

              {/* Communicator Icon Link - only for system_admin, admin, and registrar roles */}
              {(role === "system_admin" ||
                role === "admin" ||
                role === "registrar") &&
                location.pathname !== "/communicator" &&
                location.pathname !== "/dashboard" && (
                  <Tooltip title="POWER Communicator">
                    <IconButton
                      color="inherit"
                      sx={{ mr: 1, display: { xs: "none", lg: "inline-flex" } }}
                      onClick={() => navigate("/communicator")}
                      aria-label="Communicator"
                    >
                      <ChatIcon sx={{ color: "white" }} />
                    </IconButton>
                  </Tooltip>
                )}

              {/* Admin Icon Link - only for admin, registrar, receptionist, system_admin and not on dashboard page */}
              {(role === "admin" ||
                role === "registrar" ||
                role === "receptionist" ||
                role === "system_admin") &&
                location.pathname !== "/dashboard" && (
                  <Tooltip title="Management Portal">
                    <IconButton
                      color="inherit"
                      sx={{ mr: 1, display: { xs: "none", lg: "inline-flex" } }}
                      onClick={() => navigate("/admin/")}
                      aria-label="Admin Panel"
                    >
                      <AdminPanelSettingsIcon sx={{ color: "white" }} />
                    </IconButton>
                  </Tooltip>
                )}

              {/* Account Icon Link - only for admin and system_admin */}
              {(role === "admin" || role === "system_admin") && (
                <Tooltip title="Account Settings">
                  <IconButton
                    color="inherit"
                    sx={{ mr: 1, display: { xs: "none", lg: "inline-flex" } }}
                    onClick={() => navigate("/account")}
                    aria-label="Account Settings"
                  >
                    <AccountCircleIcon sx={{ color: "white" }} />
                  </IconButton>
                </Tooltip>
              )}
              <Button
                color="inherit"
                sx={{
                  textTransform: "none",
                  fontWeight: 450,
                  fontSize: "1rem",
                  mr: { xs: 0.5, md: 2 },
                  pl: 1,
                  pr: 1,
                  minWidth: 0,
                  color: "white",
                  "& .MuiAvatar-root": {
                    bgcolor: "primary.light",
                    color: "primary.contrastText",
                  },
                  "& .navbar-username": { color: "white" },
                }}
                endIcon={
                  <Avatar
                    sx={{
                      width: 28,
                      height: 28,
                      bgcolor: "primary.light",
                      color: "primary.contrastText",
                    }}
                    src={profilePic || undefined}
                  >
                    {!profilePic && (username?.[0]?.toUpperCase() || "?")}
                  </Avatar>
                }
                disableRipple
                disabled
              >
                <Box
                  component="span"
                  className="navbar-username"
                  sx={{ display: { xs: "none", md: "inline" } }}
                >
                  {getGreeting()}, {username}
                </Box>
                {isSystemAdmin && (
                  <Box
                    component="span"
                    sx={{
                      background: "white",
                      color: "#2563eb",
                      fontWeight: 700,
                      fontSize: "0.95em",
                      borderRadius: "7px",
                      px: 1.5,
                      ml: 1.5,
                      border: "2px solid",
                      borderColor: "#2563eb",
                      display: { xs: "none", md: "inline-block" },
                    }}
                  >
                    System Admin
                  </Box>
                )}
              </Button>
              <IconButton
                onClick={handleLogout}
                color="inherit"
                sx={{
                  ml: 1,
                  color: "white",
                  border: "2px solid #2563eb",
                  borderRadius: 1,
                  p: 1,
                  transition: "background 0.2s, color 0.2s, border-color 0.2s",
                  "&:hover": {
                    background: "rgba(211, 47, 47, 0.10)", // red tint
                    color: "#dc2626", // MUI error.main
                    borderColor: "#dc2626",
                    boxShadow: "0 0 0 2px #d32f2f33",
                    cursor: "pointer",
                  },
                }}
                title="Logout"
              >
                <FontAwesomeIcon icon={faSignOutAlt} size="lg" />
              </IconButton>
            </>
          )}
        </Box>
      </Toolbar>
    </AppBar>
  );
}

export default Navbar;
