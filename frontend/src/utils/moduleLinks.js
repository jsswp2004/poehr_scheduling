import HowToRegIcon from "@mui/icons-material/HowToReg";
import PersonIcon from "@mui/icons-material/Person";
import DescriptionIcon from "@mui/icons-material/Description";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import PeopleIcon from "@mui/icons-material/People";
import PersonAddIcon from "@mui/icons-material/PersonAdd";
import MedicalInformationIcon from "@mui/icons-material/MedicalInformation";
import GroupsIcon from "@mui/icons-material/Groups";
import VideocamIcon from "@mui/icons-material/Videocam";
import MicIcon from "@mui/icons-material/Mic";
import ScienceIcon from "@mui/icons-material/Science";
import ForumIcon from "@mui/icons-material/Forum";
import PolicyIcon from "@mui/icons-material/Policy";

// Roles that can use the clinical/staff modules (matches the login redirects
// and the Staffing page guard).
export const STAFF_MODULE_ROLES = [
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
export const PATIENTS_PAGE_VIEWS = ["appointments", "team", "register"];

// Roles that can use secure staff messaging (the server decides; this only hides the icon).
export const SECURE_MESSAGE_ROLES = ["doctor", "nurse", "registrar", "receptionist", "admin"];

export const MODULE_LINKS = [
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
    // The Patients page on its Patient List.
    key: "patients",
    module: "clinical_documentation",
    label: "Patients",
    to: "/patients",
    Icon: PersonIcon,
    roles: STAFF_MODULE_ROLES,
    isActive: (path, tab, chart) => path === "/patients" && !PATIENTS_PAGE_VIEWS.includes(tab) && chart !== "documents",
  },
  {
    // The same page, opened on the Documents tab (and the standalone chart pages under /patients/<id>).
    key: "documentation",
    module: "clinical_documentation",
    label: "Documentation",
    to: "/patients?chart=documents",
    Icon: DescriptionIcon,
    roles: STAFF_MODULE_ROLES,
    isActive: (path, tab, chart) =>
      path.startsWith("/patients/") ||
      (path === "/patients" && !PATIENTS_PAGE_VIEWS.includes(tab) && chart === "documents"),
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
    key: "register",
    module: "registration",
    label: "Register",
    to: "/patients?tab=register",
    standaloneTo: "/registration", // organizations with Registration but not Clinical Notes
    Icon: PersonAddIcon,
    roles: ["admin", "system_admin", "registrar"],
    isActive: (path, tab) => (path === "/patients" && tab === "register") || path.startsWith("/registration"),
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
    module: "clinical_documentation",
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


/** Where a header link goes for this organization: the standalone page when Clinical Notes is off. */
export const linkTarget = (m, hasNotes) => (m.standaloneTo && !hasNotes ? m.standaloneTo : m.to);
