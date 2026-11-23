import { jwtDecode } from 'jwt-decode';
import { withIncluded } from './orgModules';

// Where a person lands after signing in (no specific page asked for), from their role and the
// services their organization signed up for. Administrators keep the Management Portal.
// `modules` null means the organization was never configured: everything is on.
const SERVICE_LANDINGS = [
  ['clinical_documentation', '/patients'], // POWER Notes
  ['scheduling', '/patients?tab=appointments'],
  ['staffing', '/staffing'],
  ['telehealth', '/telehealth'],
  ['dictation', '/dictate'],
  ['registration', '/registration'], // Registration on its own
];

const CLINICAL_ROLES = ['doctor', 'nurse', 'registrar', 'receptionist'];

// POWER Pharmacy Portal: staff of an outside pharmacy only ever use the portal.
export const PORTAL_ROLES = ['ext_pharmacist', 'ext_pharmacy_admin'];
export const PORTAL_HOME = '/pharmacy-portal';
// POWER Lab Portal: staff of an outside laboratory only ever use the lab portal.
export const LAB_PORTAL_ROLES = ['ext_lab_tech', 'ext_lab_pathologist', 'ext_lab_admin'];
export const LAB_PORTAL_HOME = '/lab-portal';
/** The only page an outside pharmacy or lab login may open, or null for everyone else. */
export const portalHomeFor = (role) => {
  if (PORTAL_ROLES.includes(role)) return PORTAL_HOME;
  if (LAB_PORTAL_ROLES.includes(role)) return LAB_PORTAL_HOME;
  return null;
};

export const landingPath = (role, modules) => {
  if (portalHomeFor(role)) return portalHomeFor(role);
  if (role === 'admin' || role === 'system_admin') return '/admin';
  if (!role || role === 'patient') return '/dashboard';
  const all = !Array.isArray(modules);
  const have = withIncluded(modules);
  const has = (code) => all || have.includes(code);
  if (role === 'staff') return has('staffing') ? '/staffing' : '/dashboard';
  if (role === 'pharmacist' || role === 'pharmacy_tech') return has('pharmacy') ? '/patients?care=pharmacy' : '/dashboard';
  if (CLINICAL_ROLES.includes(role)) {
    const hit = SERVICE_LANDINGS.find(([code]) => has(code));
    return hit ? hit[1] : '/dashboard';
  }
  return '/dashboard';
};

/** Landing for the person signed in right now, or null when nobody is signed in. */
export const landingForCurrentUser = () => {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return null;
    const { role, modules, exp } = jwtDecode(token);
    if (exp && exp * 1000 < Date.now()) return null;
    return landingPath(role, modules);
  } catch (e) {
    return null;
  }
};

// The tiles on the Solutions page: what each one opens, the service it needs and the roles that may use it.
// Same rules the sign-in redirects have always applied. `modules` null means everything is on.
export const SOLUTIONS = [
  // Administrators only; not tied to a service, so it is always there for them.
  { key: 'management', label: 'Management Portal', module: null, path: '/admin', roles: ['admin', 'system_admin'] },
  { key: 'notes', label: 'POWER Notes', module: 'clinical_documentation', path: '/patients', roles: ['admin', 'system_admin', 'doctor', 'nurse', 'registrar', 'receptionist'] },
  // POWER Labs: lab orders sent to outside partner labs (POWER Lab Portal), the clinic's lab directory, and partner lab
  // approval for POWER administrators. Part of POWER Notes (orders and lab results live there), so it is a companion
  // tile: it never counts as someone's one solution to go straight into.
  { key: 'labs', label: 'POWER Labs', module: 'clinical_documentation', path: '/labs', roles: ['admin', 'system_admin', 'doctor', 'nurse'], companion: true },
  { key: 'registration', label: 'POWER Registration', module: 'registration', path: '/registration', roles: ['admin', 'system_admin', 'registrar'] },
  { key: 'scheduler', label: 'POWER Scheduler', module: 'scheduling', path: '/patients?tab=appointments', roles: ['admin', 'system_admin', 'doctor', 'nurse', 'registrar'] },
  { key: 'communicator', label: 'POWER Communicator', module: 'communicator', path: '/communicator', roles: ['admin', 'system_admin', 'registrar'] },
  { key: 'portal', label: 'POWER Patient Portal', module: 'patient_portal', path: '/dashboard', roles: ['admin', 'system_admin', 'patient'] },
  { key: 'staffing', label: 'POWER Staffing', module: 'staffing', path: '/staffing', roles: ['admin', 'system_admin', 'doctor', 'nurse', 'registrar', 'staff'] },
  { key: 'surgery', label: 'POWER Surgery', module: 'surgery', path: '/surgery', roles: ['admin', 'system_admin', 'doctor', 'nurse', 'registrar'] },
  { key: 'telehealth', label: 'POWER Telehealth', module: 'telehealth', path: '/telehealth', roles: ['admin', 'system_admin', 'doctor', 'nurse', 'registrar', 'receptionist'] },
  { key: 'dictate', label: 'POWER Dictate', module: 'dictation', path: '/dictate', roles: ['admin', 'system_admin', 'doctor', 'nurse'] },
  // POWER MDS runs as its own app (own database); sign-in and organization come from this site.
  { key: 'mds', label: 'POWER MDS', module: 'mds', path: '/mds', roles: ['admin', 'system_admin', 'doctor', 'nurse'] },
  // POWER Pharmacy is the Pharmacy care setting of the Patients page (?care= picks it).
  // Also anyone granted the 'pharmacy.view' right (sign-in claim pharmacy_view), e.g. a doctor, read-only.
  { key: 'pharmacy', label: 'POWER Pharmacy', module: 'pharmacy', path: '/patients?care=pharmacy', roles: ['admin', 'system_admin', 'pharmacist', 'pharmacy_tech'], right: 'pharmacy_view' },
];

/**
 * POWER Pharmacy: the roles that work in it, and whether this sign-in may open it. The 'pharmacy.view' right
 * travels as the pharmacy_view sign-in claim (a doctor granted it in Security Settings sees the module read-only);
 * a sign-in from before the claim existed falls back to the role.
 */
export const PHARMACY_STAFF_ROLES = ['admin', 'system_admin', 'pharmacist', 'pharmacy_tech'];
export const canViewPharmacy = (me = currentSignIn()) => {
  if (!me) return false;
  if (typeof me.pharmacy_view === 'boolean') return me.pharmacy_view;
  return PHARMACY_STAFF_ROLES.includes(me.role);
};
/** Granted the right without a pharmacy role (e.g. a doctor): Verification Queue, Med Profile and Formulary, read-only. */
export const pharmacyReadOnly = (me = currentSignIn()) => canViewPharmacy(me) && !PHARMACY_STAFF_ROLES.includes(me?.role);

/** The solutions a person may open: their organization has the service and their role may use it. */
export const solutionsFor = (role, modules, claims = {}) => {
  const all = !Array.isArray(modules);
  const have = withIncluded(modules);
  const mayOpen = (t) => (t.right && typeof claims[t.right] === 'boolean' ? claims[t.right] : t.roles.includes(role));
  return SOLUTIONS.filter((t) => mayOpen(t) && (t.module === null || all || have.includes(t.module)));
};

/**
 * Where a person goes right after signing in: patients to their dashboard, someone with a single available
 * solution straight into it, everyone else (administrators included, who also have the Management Portal tile)
 * to the Solutions page.
 */
export const postLoginPath = (role, modules, claims = {}) => {
  if (portalHomeFor(role)) return portalHomeFor(role);
  if (!role || role === 'patient') return '/dashboard';
  const list = solutionsFor(role, modules, claims);
  const main = list.filter((t) => !t.companion);
  if (list.length === 0) return '/dashboard';
  if (list.length === 1) return list[0].path;
  if (main.length === 1) return main[0].path;
  return '/solutions';
};

/** Role and services of the person signed in right now, or null when nobody is. */
export const currentSignIn = () => {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return null;
    const { role, modules, exp, pharmacy_view } = jwtDecode(token);
    if (exp && exp * 1000 < Date.now()) return null;
    return { role, modules, pharmacy_view };
  } catch (e) {
    return null;
  }
};

/** Post-login destination for the person signed in right now, or null when nobody is. */
export const postLoginForCurrentUser = () => {
  const me = currentSignIn();
  return me ? postLoginPath(me.role, me.modules, me) : null;
};
