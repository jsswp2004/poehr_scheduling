import React from 'react';
import { useCreateProfile } from '../hooks/create-profile';
import { CreateProfileContainer } from '../components/create-profile';

/**
 * CreateProfilePage - Refactored
 * 
 * Main page component for creating new user profiles.
 * This refactored version separates business logic into a custom hook
 * and UI logic into reusable components.
 * 
 * Features:
 * - User registration form with validation
 * - Organization and role selection
 * - Profile picture upload
 * - Form state management and submission
 * 
 * Hooks Used:
 * - useCreateProfile: Manages form state, organizations, and registration
 * 
 * Components Used:
 * - CreateProfileContainer: Main container with form layout
 */
function CreateProfilePage() {
    // All business logic handled by hook
    const createProfileLogic = useCreateProfile();

    return <CreateProfileContainer {...createProfileLogic} />;
}

export default CreateProfilePage;
