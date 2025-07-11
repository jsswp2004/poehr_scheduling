import React from 'react';
import {
    Box,
    Stack,
    Typography,
    TextField,
    IconButton,
    Collapse,
    Paper,
    CircularProgress,
} from '@mui/material';
import SearchIcon from '@mui/icons-material/Search';

/**
 * User search component for system admins
 */
const UserSearchSection = ({
    searchTerm,
    userSearchResults,
    searchLoading,
    showSearchResults,
    onSearchChange,
    onSearchSubmit,
    onSelectUser,
}) => {
    return (
        <Box sx={{ marginBottom: 4 }}>
            <Typography variant="h6" gutterBottom>
                Search Users
            </Typography>

            <Stack direction="row" spacing={2} alignItems="center">
                <TextField
                    fullWidth
                    label="Search users..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    placeholder="Type username, email, or name..."
                    onKeyPress={(e) => e.key === 'Enter' && onSearchSubmit()}
                />
                <IconButton
                    onClick={onSearchSubmit}
                    disabled={searchLoading}
                    color="primary"
                >
                    {searchLoading ? (
                        <CircularProgress size={24} />
                    ) : (
                        <SearchIcon />
                    )}
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
                                transition: "all 0.2s ease",
                                "&:hover": {
                                    backgroundColor: "#f0f0f0",
                                    elevation: 2,
                                },
                            }}
                            onClick={() => onSelectUser(user)}
                        >
                            <Typography variant="subtitle1" fontWeight="medium">
                                {user.first_name} {user.last_name} ({user.username})
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {user.email} - {user.roles?.join(", ")}
                            </Typography>
                        </Paper>
                    ))}
                </Box>
            </Collapse>

            {/* No Results Message */}
            {showSearchResults && userSearchResults.length === 0 && !searchLoading && searchTerm && (
                <Box sx={{ marginTop: 2, textAlign: 'center', py: 2 }}>
                    <Typography variant="body2" color="text.secondary">
                        No users found matching "{searchTerm}"
                    </Typography>
                </Box>
            )}
        </Box>
    );
};

export default UserSearchSection;
