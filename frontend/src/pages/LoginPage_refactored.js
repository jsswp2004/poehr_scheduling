import React from 'react';
import { useLogin } from '../hooks/login';
import { LoginContainer } from '../components/login';

/**
 * LoginPage - Refactored
 * 
 * Main page component for user authentication and login.
 * This refactored version separates authentication logic into a custom hook
 * and UI components for better maintainability.
 * 
 * Features:
 * - User authentication with username/password
 * - Role-based navigation after login
 * - Redirect parameter support for specific pages
 * - Form validation and loading states
 * - Links to forgot password and registration
 * 
 * Hooks Used:
 * - useLogin: Manages authentication logic and navigation
 * 
 * Components Used:
 * - LoginContainer: Main page layout and form container
 */
function LoginPage() {
    // All authentication logic handled by hook
    const loginLogic = useLogin();

    return <LoginContainer {...loginLogic} />;
}

export default LoginPage;
