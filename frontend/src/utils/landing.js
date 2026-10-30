import { jwtDecode } from 'jwt-decode';

// Where a person lands after signing in (no specific page asked for), from their role and the
// services their organization signed up for. Administrators keep the Management Portal.
// `modules` null means the organization was never configured: everything is on.
const SERVICE_LANDINGS = [
  ['clinical_documentation', '/patients'], // POWER Notes
  ['scheduling', '/patients?tab=appointments'],
  ['staffing', '/staffing'],
  ['telehealth', '/telehealth'],
  ['dictation', '/dictate'],
];

const CLINICAL_ROLES = ['doctor', 'nurse', 'registrar', 'receptionist'];

export const landingPath = (role, modules) => {
  if (role === 'admin' || role === 'system_admin') return '/admin';
  if (!role || role === 'patient') return '/dashboard';
  const all = !Array.isArray(modules);
  const has = (code) => all || modules.includes(code);
  if (role === 'staff') return has('staffing') ? '/staffing' : '/dashboard';
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
  { key: 'notes', label: 'POWER Notes', module: 'clinical_documentation', path: '/patients', roles: ['admin', 'system_admin', 'doctor', 'nurse', 'registrar', 'receptionist'] },
  { key: 'scheduler', label: 'POWER Scheduler', module: 'scheduling', path: '/patients?tab=appointments', roles: ['admin', 'system_admin', 'doctor', 'nurse', 'registrar'] },
  { key: 'communicator', label: 'POWER Communicator', module: 'communicator', path: '/communicator', roles: ['admin', 'system_admin', 'registrar'] },
  { key: 'portal', label: 'POWER Patient Portal', module: 'patient_portal', path: '/dashboard', roles: ['admin', 'system_admin', 'patient'] },
  { key: 'staffing', label: 'POWER Staffing', module: 'staffing', path: '/staffing', roles: ['admin', 'system_admin', 'doctor', 'nurse', 'registrar', 'staff'] },
  { key: 'telehealth', label: 'POWER Telehealth', module: 'telehealth', path: '/telehealth', roles: ['admin', 'system_admin', 'doctor', 'nurse', 'registrar', 'receptionist'] },
  { key: 'dictate', label: 'POWER Dictate', module: 'dictation', path: '/dictate', roles: ['admin', 'system_admin', 'doctor', 'nurse'] },
];

/** The solutions a person may open: their organization has the service and their role may use it. */
export const solutionsFor = (role, modules) => {
  const all = !Array.isArray(modules);
  return SOLUTIONS.filter((t) => t.roles.includes(role) && (all || modules.includes(t.module)));
};

/**
 * Where a person goes right after signing in: administrators to the Management Portal, patients to their
 * dashboard, someone with a single available solution straight into it, everyone else to the Solutions page.
 */
export const postLoginPath = (role, modules) => {
  if (role === 'admin' || role === 'system_admin') return '/admin';
  if (!role || role === 'patient') return '/dashboard';
  const list = solutionsFor(role, modules);
  if (list.length === 0) return '/dashboard';
  if (list.length === 1) return list[0].path;
  return '/solutions';
};

/** Role and services of the person signed in right now, or null when nobody is. */
export const currentSignIn = () => {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return null;
    const { role, modules, exp } = jwtDecode(token);
    if (exp && exp * 1000 < Date.now()) return null;
    return { role, modules };
  } catch (e) {
    return null;
  }
};

/** Post-login destination for the person signed in right now, or null when nobody is. */
export const postLoginForCurrentUser = () => {
  const me = currentSignIn();
  return me ? postLoginPath(me.role, me.modules) : null;
};
