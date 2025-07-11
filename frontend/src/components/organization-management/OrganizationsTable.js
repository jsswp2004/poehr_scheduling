/**
 * OrganizationsTable component - Table displaying all organizations for system admins
 */
import React from 'react';
import {
    Paper,
    Typography,
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Avatar,
    IconButton,
    Tooltip,
    Box,
} from '@mui/material';
import { Edit, Delete, Business } from '@mui/icons-material';
import { getLogoUrl } from '../../utils/organization/organizationUtils';

const OrganizationsTable = ({
    organizations,
    isSystemAdmin,
    onEditClick,
    onDeleteClick,
}) => {
    if (!isSystemAdmin) {
        return null;
    }

    return (
        <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>
                All Organizations ({organizations.length})
            </Typography>

            {organizations.length === 0 ? (
                <Typography color="text.secondary" align="center" sx={{ py: 4 }}>
                    No organizations found.
                </Typography>
            ) : (
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>Logo</TableCell>
                            <TableCell>Name</TableCell>
                            <TableCell>ID</TableCell>
                            <TableCell>Created</TableCell>
                            <TableCell align="center">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {organizations.map((org) => (
                            <TableRow key={org.id} hover>
                                <TableCell>
                                    <Avatar
                                        src={getLogoUrl(org.logo)}
                                        sx={{ width: 40, height: 40 }}
                                    >
                                        <Business />
                                    </Avatar>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="subtitle2" fontWeight="bold">
                                        {org.name}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                        {org.id}
                                    </Typography>
                                </TableCell>
                                <TableCell>
                                    <Typography variant="body2" color="text.secondary">
                                        {new Date(org.created_at).toLocaleDateString()}
                                    </Typography>
                                </TableCell>
                                <TableCell align="center">
                                    <Box>
                                        <Tooltip title="Edit Organization">
                                            <IconButton
                                                color="primary"
                                                onClick={() => onEditClick(org)}
                                                size="small"
                                            >
                                                <Edit />
                                            </IconButton>
                                        </Tooltip>

                                        <Tooltip title="Delete Organization">
                                            <IconButton
                                                color="error"
                                                onClick={() => onDeleteClick(org)}
                                                size="small"
                                            >
                                                <Delete />
                                            </IconButton>
                                        </Tooltip>
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </Paper>
    );
};

export default OrganizationsTable;
