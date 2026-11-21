import { Navigate, useLocation } from 'react-router-dom';
import { jwtDecode } from 'jwt-decode';
import { PORTAL_HOME, PORTAL_ROLES } from '../utils/landing';

// blockRoles/blockedTo: roles that may be signed in but must not open this page
// (for example Staffing-only "staff" logins and the patient portal).
function PrivateRoute({ children, blockRoles = [], blockedTo = '/solutions' }) {
  const token = localStorage.getItem('access_token');
  const location = useLocation();
  console.log('🛡️ PrivateRoute: Checking authentication, token exists:', !!token);

  if (!token) {
    console.log('❌ PrivateRoute: No token found, redirecting to login');
    return <Navigate to="/login" />;
  }

  // POWER Pharmacy Portal accounts never open an internal page: always back to the portal (the server refuses them too).
  let signedInRole = '';
  try {
    signedInRole = jwtDecode(token).role || '';
  } catch (err) {
    signedInRole = '';
  }
  if (PORTAL_ROLES.includes(signedInRole) && !(location.pathname || '').startsWith(PORTAL_HOME)) {
    return <Navigate to={PORTAL_HOME} replace />;
  }

  if (blockRoles.length > 0) {
    let role = '';
    try {
      role = jwtDecode(token).role || '';
    } catch (err) {
      role = '';
    }
    if (blockRoles.includes(role)) {
      console.log('⛔ PrivateRoute: role not allowed on this page, redirecting');
      return <Navigate to={blockedTo} replace />;
    }
  }

  console.log('✅ PrivateRoute: Token found, allowing access');
  return children;
}

export default PrivateRoute;
// This component checks if the user is authenticated by checking for a token in localStorage.
// If the token exists, it renders the children components (the protected route).
// If not, it redirects the user to the login page using the Navigate component from react-router-dom.
// This is a simple way to protect routes in a React application using React Router.
// You can use this component in your App.js or wherever you define your routes to wrap around the components that need protection.
// For example:
// <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
// This way, only authenticated users can access the DashboardPage component.
// Make sure to import this component in your App.js or wherever you define your routes.
// You can also customize the redirection path by passing a `to` prop to the Navigate component if you want to redirect to a different page.
// For example: <Navigate to="/custom-login" />
// This will redirect the user to the "/custom-login" page if they are not authenticated.
// You can also add additional logic to handle different user roles or permissions if needed.
// Just ensure that you have the necessary logic in place to check for those roles or permissions before rendering the protected components.
// This will help you create a more secure and user-friendly application by ensuring that only authorized users can access certain parts of your app.
// You can also add a loading state to show a loading spinner or message while checking the authentication status.
// This can improve the user experience by providing feedback during the authentication check process.