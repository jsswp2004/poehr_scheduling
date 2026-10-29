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
