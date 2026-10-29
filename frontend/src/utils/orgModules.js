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
export const moduleEnabled = (code, enabled = getEnabledModules()) => {
  if (!code || (Array.isArray(code) && code.length === 0) || enabled === null) return true;
  return Array.isArray(code) ? code.some((c) => enabled.includes(c)) : enabled.includes(code);
};
