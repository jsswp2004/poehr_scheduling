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

export const moduleEnabled = (code, enabled = getEnabledModules()) => !code || enabled === null || enabled.includes(code);
