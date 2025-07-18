import { useState, useRef } from "react";
import {
    Box,
    Stack,
    Typography,
    Button,
    TextField,
    IconButton,
    Avatar,
    Collapse,
    FormControl,
    InputLabel,
    Select as MUISelect,
    MenuItem,
    CircularProgress,
    Divider,
    Paper,
} from "@mui/material";
import BackButton from "../components/BackButton";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import SearchIcon from "@mui/icons-material/Search";
import LockResetIcon from "@mui/icons-material/LockReset";
import DeleteIcon from "@mui/icons-material/Delete";
import { toast } from "../components/SimpleToast";
import { useNavigate } from "react-router-dom";
import CreatableSelect from "react-select/creatable";
import { apiEndpoints } from "../config/api";
import { USER_ROLES } from "../config/constants";
import { useAuth } from "../hooks/useAuth";
import { useProfile } from "../hooks/useProfile";
import { useSearch } from "../hooks/useSearch";
import { usePasswordChange } from "../hooks/usePasswordChange";

function ProfilePage() {
    const navigate = useNavigate();
    const fileInputRef = useRef(null);

    // Custom hooks
    const { currentUser, isSystemAdmin } = useAuth();
    const {
        profile,
        editingProfile,
        profileLoading,
        setEditingProfile,
        updateProfile,
        uploadProfilePicture,
        deleteUser
    } = useProfile();
    const {
        searchTerm,
        userSearchResults,
        searchLoading,
        showSearchResults,
        setSearchTerm,
        setShowSearchResults,
        searchUsers,
        selectUser
    } = useSearch();
    const {
        showPasswordChange,
        passwordData,
        passwordLoading,
        setShowPasswordChange,
        updatePasswordData,
        changePassword
    } = usePasswordChange();

    // Local state for UI
    const [availableRoles] = useState([
        { value: USER_ROLES.ADMIN, label: "Admin" },
        { value: USER_ROLES.THERAPIST, label: "Therapist" },
        { value: USER_ROLES.PATIENT, label: "Patient" },
    ]);

    // Handlers
    const handleProfileSubmit = async () => {
        try {
            await updateProfile();
            toast.success("Profile updated successfully!");
        } catch (error) {
            console.error("Error updating profile:", error);
            toast.error("Failed to update profile");
        }
    };

    const handleFileUpload = async (event) => {
        const file = event.target.files[0];
        if (file) {
            try {
                await uploadProfilePicture(file);
                toast.success("Profile picture updated successfully!");
            } catch (error) {
                console.error("Error uploading profile picture:", error);
                toast.error("Failed to upload profile picture");
            }
        }
    };

    const handleDeleteUser = async () => {
        if (window.confirm("Are you sure you want to delete this user? This action cannot be undone.")) {
            try {
                await deleteUser();
                toast.success("User deleted successfully!");
                navigate("/");
            } catch (error) {
                console.error("Error deleting user:", error);
                toast.error("Failed to delete user");
            }
        }
    };

    const handlePasswordSubmit = async () => {
        try {
            await changePassword();
            toast.success("Password updated successfully!");
            setShowPasswordChange(false);
        } catch (error) {
            console.error("Error changing password:", error);
            toast.error("Failed to change password");
        }
    };

    const handleSearchChange = (value) => {
        setSearchTerm(value);
        setShowSearchResults(true);
        searchUsers(value);
    };

    const handleSelectUser = (user) => {
        selectUser(user);
        setShowSearchResults(false);
    };

    if (!currentUser) {
        return (
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    height: "100vh",
                }}
            >
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box
            sx={{
                maxWidth: 800,
                margin: "0 auto",
                padding: 3,
                minHeight: "100vh",
                backgroundColor: "#f5f5f5",
            }}
        >
            <BackButton />

            <Paper elevation={3} sx={{ padding: 4, marginBottom: 3 }}>
                <Typography variant="h4" gutterBottom align="center">
                    Profile Management
                </Typography>

                {/* System Admin Search Section */}
                {isSystemAdmin && (
                    <Box sx={{ marginBottom: 4 }}>
                        <Typography variant="h6" gutterBottom>
                            Search Users
                        </Typography>
                        <Stack direction="row" spacing={2} alignItems="center">
                            <TextField
                                fullWidth
                                label="Search users..."
                                value={searchTerm}
                                onChange={(e) => handleSearchChange(e.target.value)}
                                placeholder="Type username, email, or name..."
                            />
                            <IconButton onClick={() => searchUsers(searchTerm)} disabled={searchLoading}>
                                {searchLoading ? <CircularProgress size={24} /> : <SearchIcon />}
                            </IconButton>
                        </Stack>

                        {/* Search Results */}
                        <Collapse in={showSearchResults && userSearchResults.length > 0}>
                            <Box sx={{ marginTop: 2, maxHeight: 300, overflow: "auto" }}>
                                {userSearchResults.map((user) => (
                                    <Paper
                                        key={user.id}
                                        sx={{
                                            padding: 2,
                                            marginBottom: 1,
                                            cursor: "pointer",
                                            "&:hover": { backgroundColor: "#f0f0f0" },
                                        }}
                                        onClick={() => handleSelectUser(user)}
                                    >
                                        <Typography variant="subtitle1">
                                            {user.first_name} {user.last_name} ({user.username})
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {user.email} - {user.roles?.join(", ")}
                                        </Typography>
                                    </Paper>
                                ))}
                            </Box>
                        </Collapse>
                    </Box>
                )}

                {/* Profile Section */}
                <Box sx={{ marginBottom: 4 }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ marginBottom: 2 }}>
                        <Typography variant="h6">Profile Information</Typography>
                        <Stack direction="row" spacing={1}>
                            {editingProfile ? (
                                <>
                                    <IconButton onClick={handleProfileSubmit} disabled={profileLoading} color="primary">
                                        {profileLoading ? <CircularProgress size={20} /> : <SaveIcon />}
                                    </IconButton>
                                    <IconButton onClick={() => setEditingProfile(false)} color="secondary">
                                        <CancelIcon />
                                    </IconButton>
                                </>
                            ) : (
                                <IconButton onClick={() => setEditingProfile(true)} color="primary">
                                    <EditIcon />
                                </IconButton>
                            )}
                        </Stack>
                    </Stack>

                    {/* Profile Picture */}
                    <Box sx={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
                        <Avatar
                            src={profile.profile_picture}
                            sx={{ width: 80, height: 80, marginRight: 2 }}
                        >
                            {profile.first_name?.[0]}{profile.last_name?.[0]}
                        </Avatar>
                        <Button
                            variant="outlined"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={!editingProfile}
                        >
                            Change Picture
                        </Button>
                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: "none" }}
                            accept="image/*"
                            onChange={handleFileUpload}
                        />
                    </Box>

                    {/* Profile Form */}
                    <Stack spacing={3}>
                        <Stack direction="row" spacing={2}>
                            <TextField
                                fullWidth
                                label="First Name"
                                value={profile.first_name}
                                onChange={(e) => setProfile(prev => ({ ...prev, first_name: e.target.value }))}
                                disabled={!editingProfile}
                            />
                            <TextField
                                fullWidth
                                label="Last Name"
                                value={profile.last_name}
                                onChange={(e) => setProfile(prev => ({ ...prev, last_name: e.target.value }))}
                                disabled={!editingProfile}
                            />
                        </Stack>

                        <TextField
                            fullWidth
                            label="Username"
                            value={profile.username}
                            onChange={(e) => setProfile(prev => ({ ...prev, username: e.target.value }))}
                            disabled={!editingProfile}
                        />

                        <TextField
                            fullWidth
                            label="Email"
                            type="email"
                            value={profile.email}
                            onChange={(e) => setProfile(prev => ({ ...prev, email: e.target.value }))}
                            disabled={!editingProfile}
                        />

                        {/* Roles Selection (System Admin only) */}
                        {isSystemAdmin && (
                            <FormControl fullWidth disabled={!editingProfile}>
                                <InputLabel>Roles</InputLabel>
                                <CreatableSelect
                                    isMulti
                                    value={availableRoles.filter(role => profile.roles?.includes(role.value))}
                                    onChange={(selectedRoles) =>
                                        setProfile(prev => ({
                                            ...prev,
                                            roles: selectedRoles.map(role => role.value)
                                        }))
                                    }
                                    options={availableRoles}
                                    isDisabled={!editingProfile}
                                />
                            </FormControl>
                        )}

                        <TextField
                            fullWidth
                            label="Organization"
                            value={profile.organization}
                            disabled
                        />

                        {/* Active Status (System Admin only) */}
                        {isSystemAdmin && (
                            <FormControl fullWidth disabled={!editingProfile}>
                                <InputLabel>Status</InputLabel>
                                <MUISelect
                                    value={profile.is_active ? "active" : "inactive"}
                                    onChange={(e) => setProfile(prev => ({
                                        ...prev,
                                        is_active: e.target.value === "active"
                                    }))}
                                    label="Status"
                                >
                                    <MenuItem value="active">Active</MenuItem>
                                    <MenuItem value="inactive">Inactive</MenuItem>
                                </MUISelect>
                            </FormControl>
                        )}
                    </Stack>
                </Box>

                <Divider sx={{ marginY: 3 }} />

                {/* Password Change Section */}
                <Box>
                    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ marginBottom: 2 }}>
                        <Typography variant="h6">Security</Typography>
                        <Button
                            variant="outlined"
                            startIcon={<LockResetIcon />}
                            onClick={() => setShowPasswordChange(!showPasswordChange)}
                        >
                            Change Password
                        </Button>
                    </Stack>

                    <Collapse in={showPasswordChange}>
                        <Stack spacing={3} sx={{ marginTop: 2 }}>
                            <TextField
                                fullWidth
                                type="password"
                                label="Current Password"
                                value={passwordData.current_password}
                                onChange={(e) => updatePasswordData("current_password", e.target.value)}
                            />
                            <TextField
                                fullWidth
                                type="password"
                                label="New Password"
                                value={passwordData.new_password}
                                onChange={(e) => updatePasswordData("new_password", e.target.value)}
                            />
                            <TextField
                                fullWidth
                                type="password"
                                label="Confirm New Password"
                                value={passwordData.confirm_password}
                                onChange={(e) => updatePasswordData("confirm_password", e.target.value)}
                            />
                            <Stack direction="row" spacing={2} justifyContent="flex-end">
                                <Button
                                    variant="outlined"
                                    onClick={() => setShowPasswordChange(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    variant="contained"
                                    onClick={handlePasswordSubmit}
                                    disabled={passwordLoading}
                                >
                                    {passwordLoading ? <CircularProgress size={20} /> : "Update Password"}
                                </Button>
                            </Stack>
                        </Stack>
                    </Collapse>
                </Box>

                {/* Danger Zone (System Admin only) */}
                {isSystemAdmin && profile.id !== currentUser.id && (
                    <>
                        <Divider sx={{ marginY: 3 }} />
                        <Box>
                            <Typography variant="h6" color="error" gutterBottom>
                                Danger Zone
                            </Typography>
                            <Button
                                variant="outlined"
                                color="error"
                                startIcon={<DeleteIcon />}
                                onClick={handleDeleteUser}
                            >
                                Delete User
                            </Button>
                        </Box>
                    </>
                )}
            </Paper>
        </Box>
    );
}

export default ProfilePage;
