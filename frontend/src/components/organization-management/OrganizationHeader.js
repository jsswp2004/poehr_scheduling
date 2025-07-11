/**
 * OrganizationHeader component - Header section with search and create button
 */
import React from 'react';
import {
    Box,
    Typography,
    TextField,
    Button,
    InputAdornment,
    Stack,
} from '@mui/material';
import { Search, Add } from '@mui/icons-material';

const OrganizationHeader = ({
    isSystemAdmin,
    searchQuery,
    onSearchChange,
    onCreateClick,
}) => {
    return (
        <Box sx={{ mb: 3 }}>
            <Typography variant="h4" gutterBottom>
                Organization Management
            </Typography>

            {isSystemAdmin && (
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
                    <TextField
                        placeholder="Search organizations..."
                        value={searchQuery}
                        onChange={(e) => onSearchChange(e.target.value)}
                        variant="outlined"
                        size="small"
                        sx={{ flexGrow: 1, minWidth: 250 }}
                        InputProps={{
                            startAdornment: (
                                <InputAdornment position="start">
                                    <Search />
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={onCreateClick}
                        sx={{ minWidth: 180 }}
                    >
                        Create Organization
                    </Button>
                </Stack>
            )}
        </Box>
    );
};

export default OrganizationHeader;
