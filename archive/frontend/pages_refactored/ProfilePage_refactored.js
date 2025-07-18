import React from 'react';
import { useProfilePageLogic } from '../hooks/profile-page';
import { ProfilePageContainer } from '../components/profile-page';

/**
 * ProfilePage - Refactored
 * 
 * Main page component for user profile management with admin capabilities.
 * This refactored version separates all business logic into a custom hook
 * and UI logic into a container component.
 * 
 * Features:
 * - User profile viewing and editing
 * - Profile picture upload
 * - Password change functionality
 * - System admin user search and management
 * - User deletion (admin only)
 * 
 * Hooks Used:
 * - useProfilePageLogic: Consolidates all profile page business logic
 * 
 * Components Used:
 * - ProfilePageContainer: Main UI container with all profile sections
 */
function ProfilePage() {
    // All business logic handled by consolidated hook
    const profilePageLogic = useProfilePageLogic();

    return <ProfilePageContainer {...profilePageLogic} />;
}

export default ProfilePage;
