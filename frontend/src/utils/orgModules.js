import { jwtDecode } from 'jwt-decode';

// Which services the signed-in organization has switched on, read from the sign-in token.
// null / missing means "never configured": everything is on. The server enforces this too;
// this only hides menu entries so people are not offered what would be refused.
export const getEnabledModules = () => {
  try {
    const token = localStorage.getItem('access_token');
    if (!token) return null;
    const { modules, role } = jwtDecode(token);
    if (role === 'system_admin') return null;
    return Array.isArray(modules) ? modules : null;
  } catch (e) {
    return null;
  }
};

// `code` may be one service, or a list meaning "any of these".
// Registration is also part of Clinical Notes and the Patient Portal, so those keep it (same rule as the server).
const REGISTRATION_INCLUDED_WITH = ['clinical_documentation', 'patient_portal'];

/** The list with "registration" added when Notes or the Portal already includes it. */
export const withIncluded = (enabled) =>
  Array.isArray(enabled) && !enabled.includes('registration') && enabled.some((c) => REGISTRATION_INCLUDED_WITH.includes(c))
    ? [...enabled, 'registration']
    : enabled;

export const moduleEnabled = (code, enabled = getEnabledModules()) => {
  if (!code || (Array.isArray(code) && code.length === 0) || enabled === null) return true;
  const have = withIncluded(enabled);
  return Array.isArray(code) ? code.some((c) => have.includes(c)) : have.includes(code);
};
