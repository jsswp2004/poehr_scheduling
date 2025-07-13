import React, { useState } from 'react';
import {
    Box,
    Typography,
    Paper,
    Divider,
    Stack,
    TextField,
    Button,
    IconButton,
    Pagination,
    Tabs,
    Tab,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';
import DeleteIcon from '@mui/icons-material/Delete';
import PersonIcon from '@mui/icons-material/Person';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import { useNavigate } from 'react-router-dom';
import BackButton from '../../components/BackButton';
import UserSearchSection from '../../components/profile/UserSearchSection';
import ProfileForm from '../../components/profile/ProfileForm';
import PasswordForm from '../../components/profile/PasswordForm';
import DangerZone from '../../components/profile/DangerZone';
import LoadingSpinner from '../../components/common/LoadingSpinner';

/**
 * ProfilePageContainer Component
 * Main container for the profile page content with tabbed interface
 */
const ProfilePageContainer = ({
    currentUser,
    isSystemAdmin,
    profile,
    editingProfile,
    profileLoading,
    searchTerm,
    userSearchResults,
    searchLoading,
    showSearchResults,
    currentPage,
    totalPages,
    totalResults,
    showPasswordChange,
    passwordData,
    passwordLoading,
    availableRoles,
    fileInputRef,
    setProfile,
    setEditingProfile,
    setSearchTerm,
    setShowSearchResults,
    updatePasswordData,
    handleProfileSubmit,
    handleFileUpload,
    handleDeleteUser,
    handlePasswordSubmit,
    handleSearchChange,
    handleSearchSubmit,
    handleSelectUser,
    handleProfileCancel,
    handlePasswordCancel,
    handleResetToCurrentUser,
    handlePageChange,
    searchUsers,
    setShowPasswordChange
}) => {
    const navigate = useNavigate();

    // Tab state management
    const [activeTab, setActiveTab] = useState(0);

    // Debug logging
    console.log('🔍 ProfilePageContainer props:', {
        isSystemAdmin,
        userSearchResults: userSearchResults?.length,
        showSearchResults,
        searchTerm,
        activeTab
    });

    // Handle tab change and switch to My Profile when user is selected
    const handleTabChange = (event, newValue) => {
        console.log('🔄 Tab changed to:', newValue);
        setActiveTab(newValue);
    };

    // Enhanced handleSelectUser to switch to My Profile tab
    const enhancedHandleSelectUser = (user) => {
        console.log('👤 User selected, switching to My Profile tab:', user);
        handleSelectUser(user);
        setActiveTab(0); // Switch to My Profile tab
    };

    // Loading state
    if (!currentUser) {
        return <LoadingSpinner message="Loading profile..." />;
    }

    return (
        <Box sx={{ mt: 4, px: 3, width: "100%" }}>
            <Paper
                elevation={3}
                sx={{ p: { xs: 2, sm: 3 }, borderRadius: 2, width: "100%" }}
            >
                {/* Top Action Bar */}
                <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    mb={3}
                >
                    <Typography variant="h4" sx={{ fontWeight: 'bold' }}>
                        Profile Management
                    </Typography>
                    <BackButton />
                </Stack>

                {/* Tabs */}
                <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                    <Tabs
                        value={activeTab}
                        onChange={handleTabChange}
                        aria-label="profile tabs"
                    >
                        <Tab
                            icon={<PersonIcon />}
                            label="My Profile"
                            iconPosition="start"
                            sx={{ textTransform: 'none', fontSize: '1rem' }}
                        />
                        {isSystemAdmin && (
                            <Tab
                                icon={<SearchOutlinedIcon />}
                                label="Search/Create Profile"
                                iconPosition="start"
                                sx={{ textTransform: 'none', fontSize: '1rem' }}
                            />
                        )}
                    </Tabs>
                </Box>

                {/* Tab Panel 0: My Profile */}
                {activeTab === 0 && (
                    <Box>
                        {/* Show indicator if viewing another user's profile */}
                        {profile.id !== currentUser.id && (
                            <Box
                                sx={{
                                    backgroundColor: 'primary.light',
                                    color: 'primary.contrastText',
                                    padding: 2,
                                    borderRadius: 1,
                                    marginBottom: 3,
                                    textAlign: 'center'
                                }}
                            >
                                <Typography variant="body1">
                                    Currently viewing profile of: {profile.first_name} {profile.last_name} ({profile.username})
                                </Typography>
                                <Button
                                    variant="contained"
                                    color="secondary"
                                    onClick={handleResetToCurrentUser}
                                    sx={{ mt: 1 }}
                                >
                                    Return to My Profile
                                </Button>
                            </Box>
                        )}

                        {/* Profile Form Section */}
                        <ProfileForm
                            profile={profile}
                            editingProfile={editingProfile}
                            profileLoading={profileLoading}
                            isSystemAdmin={isSystemAdmin}
                            availableRoles={availableRoles}
                            currentUser={currentUser}
                            fileInputRef={fileInputRef}
                            onProfileChange={setProfile}
                            onEditToggle={() => setEditingProfile(true)}
                            onSave={handleProfileSubmit}
                            onCancel={handleProfileCancel}
                            onFileUpload={handleFileUpload}
                        />

                        <Divider sx={{ marginY: 3 }} />

                        <PasswordForm
                            showPasswordChange={showPasswordChange}
                            passwordData={passwordData}
                            passwordLoading={passwordLoading}
                            onTogglePasswordForm={() => setShowPasswordChange(!showPasswordChange)}
                            onPasswordDataChange={updatePasswordData}
                            onPasswordSubmit={handlePasswordSubmit}
                            onCancel={handlePasswordCancel}
                        />

                        {/* Danger Zone - only show for other users when admin */}
                        {isSystemAdmin && profile.id !== currentUser.id && (
                            <DangerZone
                                onDeleteUser={handleDeleteUser}
                                disabled={profileLoading}
                            />
                        )}
                    </Box>
                )}

                {/* Tab Panel 1: Search/Create Profile (Admin only) */}
                {isSystemAdmin && activeTab === 1 && (
                    <Box>
                        <Typography variant="h6" sx={{ mb: 3 }}>
                            Search and Create Profiles
                        </Typography>

                        {/* Search Section */}
                        <Stack
                            direction={{ xs: "column", sm: "row" }}
                            spacing={1}
                            alignItems={{ xs: "stretch", sm: "center" }}
                            mb={3}
                        >
                            <TextField
                                size="small"
                                variant="outlined"
                                placeholder="Search Profile 🔍 (empty = all users)"
                                value={searchTerm}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearchSubmit()}
                                sx={{ minWidth: { xs: "100%", sm: 300 } }}
                            />
                            <Button
                                variant="contained"
                                color="primary"
                                startIcon={<SearchIcon />}
                                onClick={handleSearchSubmit}
                                disabled={searchLoading}
                                sx={{ height: 40, minWidth: 100 }}
                            >
                                {searchLoading ? 'SEARCHING...' : 'SEARCH'}
                            </Button>
                            <Button
                                variant="contained"
                                color="success"
                                onClick={() => navigate("/create-profile")}
                                sx={{ height: 40, minWidth: 120 }}
                            >
                                CREATE PROFILE
                            </Button>
                        </Stack>
                        {/* Search Results */}
                        {userSearchResults && userSearchResults.length > 0 && (
                            <Box sx={{ marginBottom: 4 }}>
                                <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                                    Search Results ({totalResults} found) - Page {currentPage} of {totalPages}
                                </Typography>

                                <Box
                                    sx={{
                                        overflowX: 'auto',
                                        border: '1px solid #ddd',
                                        borderRadius: 1,
                                        backgroundColor: 'white',
                                    }}
                                >
                                    <table
                                        style={{
                                            width: '100%',
                                            minWidth: '800px',
                                            borderCollapse: 'collapse',
                                            fontSize: '0.875rem',
                                        }}
                                    >
                                        <thead>
                                            <tr style={{ backgroundColor: '#e3f2fd' }}>
                                                <th
                                                    style={{
                                                        padding: '8px 12px',
                                                        textAlign: 'left',
                                                        fontWeight: 600,
                                                        borderBottom: '2px solid #ddd',
                                                        minWidth: '120px',
                                                    }}
                                                >
                                                    Name
                                                </th>
                                                <th
                                                    style={{
                                                        padding: '8px 12px',
                                                        textAlign: 'left',
                                                        fontWeight: 600,
                                                        borderBottom: '2px solid #ddd',
                                                        minWidth: '100px',
                                                    }}
                                                >
                                                    Username
                                                </th>
                                                <th
                                                    style={{
                                                        padding: '8px 12px',
                                                        textAlign: 'left',
                                                        fontWeight: 600,
                                                        borderBottom: '2px solid #ddd',
                                                        minWidth: '150px',
                                                    }}
                                                >
                                                    Email
                                                </th>
                                                <th
                                                    style={{
                                                        padding: '8px 12px',
                                                        textAlign: 'left',
                                                        fontWeight: 600,
                                                        borderBottom: '2px solid #ddd',
                                                        minWidth: '80px',
                                                    }}
                                                >
                                                    Role
                                                </th>
                                                <th
                                                    style={{
                                                        padding: '8px 12px',
                                                        textAlign: 'center',
                                                        fontWeight: 600,
                                                        borderBottom: '2px solid #ddd',
                                                        minWidth: '70px',
                                                    }}
                                                >
                                                    Select
                                                </th>
                                                <th
                                                    style={{
                                                        padding: '8px 12px',
                                                        textAlign: 'center',
                                                        fontWeight: 600,
                                                        borderBottom: '2px solid #ddd',
                                                        minWidth: '60px',
                                                    }}
                                                >
                                                    Delete
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {userSearchResults.map((result, index) => (
                                                <tr
                                                    key={result.id}
                                                    style={{
                                                        backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa',
                                                        borderBottom: '1px solid #eee',
                                                    }}
                                                >
                                                    <td
                                                        style={{
                                                            padding: '8px 12px',
                                                            maxWidth: '120px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                        }}
                                                    >
                                                        {result.first_name} {result.last_name}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: '8px 12px',
                                                            maxWidth: '100px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            fontFamily: 'monospace',
                                                            fontSize: '0.8rem',
                                                        }}
                                                    >
                                                        {result.username}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: '8px 12px',
                                                            maxWidth: '150px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            color: '#0066cc',
                                                            textDecoration: 'underline',
                                                            fontSize: '0.8rem',
                                                        }}
                                                    >
                                                        {result.email}
                                                    </td>
                                                    <td
                                                        style={{
                                                            padding: '8px 12px',
                                                            maxWidth: '80px',
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            whiteSpace: 'nowrap',
                                                            fontWeight: 'bold',
                                                            color: result.role === 'Doctor' ? '#2e7d32' :
                                                                result.role === 'Admin' ? '#d32f2f' :
                                                                    result.role === 'system_admin' ? '#7b1fa2' : '#757575',
                                                        }}
                                                    >
                                                        {result.role}
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                        <Button
                                                            variant="outlined"
                                                            size="small"
                                                            onClick={() => enhancedHandleSelectUser(result)}
                                                            sx={{
                                                                minWidth: '60px',
                                                                fontSize: '0.7rem',
                                                                padding: '2px 8px',
                                                            }}
                                                        >
                                                            SELECT
                                                        </Button>
                                                    </td>
                                                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => handleDeleteUser(result)}
                                                            sx={{
                                                                color: '#d32f2f',
                                                                '&:hover': {
                                                                    backgroundColor: '#ffebee',
                                                                },
                                                            }}
                                                        >
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </Box>

                                {/* Pagination */}
                                {totalPages > 1 && (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>
                                        <Pagination
                                            count={totalPages}
                                            page={currentPage}
                                            onChange={(event, page) => handlePageChange(page)}
                                            color="primary"
                                            showFirstButton
                                            showLastButton
                                        />
                                    </Box>
                                )}
                            </Box>
                        )}

                        {/* No results message */}
                        {showSearchResults && (!userSearchResults || userSearchResults.length === 0) && (
                            <Box sx={{ textAlign: 'center', padding: 3 }}>
                                <Typography variant="body1" color="text.secondary">
                                    {searchTerm ? `No users found matching "${searchTerm}"` : 'No users found'}
                                </Typography>
                            </Box>
                        )}
                    </Box>
                )}
            </Paper>
        </Box>
    );
};

export default ProfilePageContainer;
