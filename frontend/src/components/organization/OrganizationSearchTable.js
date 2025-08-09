import React from 'react';
import {
    Paper,
    Typography,
    TextField,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    IconButton,
    Avatar,
    Box,
    InputAdornment
} from '@mui/material';
import { Search, Delete } from '@mui/icons-material';

/**
 * OrganizationSearchTable Component
 * Displays search functionality and table of all organizations for system admin
 */
const OrganizationSearchTable = ({
    searchQuery,
    filteredOrganizations,
    editingOrganization,
    onSearchChange,
    onEditOrganization,
    onDeleteClick,
    getLogoUrl
}) => {
    return (
        <Paper variant="outlined" sx={{ p: 3 }}>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
                All Organizations (System Admin)
            </Typography>

            <TextField
                label="Search Organizations"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                fullWidth
                sx={{ mb: 3 }}
                InputProps={{
                    startAdornment: (
                        <InputAdornment position="start">
                            <Search />
                        </InputAdornment>
                    ),
                }}
                placeholder="Search by organization name..."
            />

            <Table size="small">
                <TableHead>
                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                        <TableCell sx={{ fontWeight: 'bold' }}>Logo</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>Created</TableCell>
                        <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {filteredOrganizations.map((org) => (
                        <TableRow
                            key={org.id}
                            hover
                            sx={{
                                cursor: 'pointer',
                                backgroundColor: editingOrganization?.id === org.id ? '#e3f2fd' : 'inherit'
                            }}
                            onClick={() => onEditOrganization(org)}
                        >
                            <TableCell>
                                <Avatar
                                    src={getLogoUrl(org.logo)}
                                    sx={{ width: 40, height: 40 }}
                                    onError={(e) => {
                                        console.log(`Logo failed to load for ${org.name}:`, org.logo);
                                        console.log('Attempted URL:', getLogoUrl(org.logo));
                                        e.currentTarget.src = '';
                                    }}
                                >
                                    {org.name.charAt(0).toUpperCase()}
                                </Avatar>
                            </TableCell>
                            <TableCell>{org.name}</TableCell>
                            <TableCell>{new Date(org.created_at).toLocaleDateString()}</TableCell>
                            <TableCell>
                                <IconButton
                                    color="error"
                                    size="small"
                                    onClick={(e) => {
                                        e.stopPropagation(); // Prevent row click when clicking delete
                                        onDeleteClick(org);
                                    }}
                                >
                                    <Delete />
                                </IconButton>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {filteredOrganizations.length === 0 && (
                <Box sx={{ textAlign: 'center', py: 4 }}>
                    <Typography color="text.secondary">
                        {searchQuery ? 'No organizations found matching your search.' : 'No organizations found.'}
                    </Typography>
                </Box>
            )}
        </Paper>
    );
};

export default OrganizationSearchTable;
