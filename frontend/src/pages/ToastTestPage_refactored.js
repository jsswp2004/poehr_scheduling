import React from 'react';
import 'react-toastify/dist/ReactToastify.css';
import { useToastTest } from '../hooks/toast-test';
import { ToastTestContainer } from '../components/toast-test';

/**
 * ToastTestPage - Refactored
 * 
 * Main page component for testing toast notifications.
 * This refactored version separates testing logic into a custom hook
 * and UI components for better maintainability.
 * 
 * Features:
 * - Test regular toast API notifications
 * - Test custom toast utility notifications
 * - Test both success and error toast types
 * - Validation of toast timing and behavior
 * 
 * Hooks Used:
 * - useToastTest: Manages toast testing methods and configurations
 * 
 * Components Used:
 * - ToastTestContainer: Main page layout with test sections
 */
function ToastTestPage() {
    // All toast testing logic handled by hook
    const { toastTestSections } = useToastTest();

    return <ToastTestContainer toastTestSections={toastTestSections} />;
}

export default ToastTestPage;
