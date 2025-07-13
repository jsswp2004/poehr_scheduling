import React from 'react';
import {
    Box,
    Typography,
    Button,
    IconButton,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import { USER_ROLES } from '../../config/constants';

/**
 * User search results table component for system admins
 */
const UserSearchTable = ({
    searchResults,
    searchTerm,
    currentUserRole,
    onSelectUser,
    onDeleteUser,
}) => {
    if (!searchResults || searchResults.length === 0) {
        return null;
    }

    return (
        <Box sx={{ marginBottom: 4 }}>
            <Typography variant="h6" gutterBottom sx={{ color: 'primary.main', fontWeight: 'bold' }}>
                Search Results ({searchResults.length} found)
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
                        minWidth: currentUserRole === USER_ROLES.SYSTEM_ADMIN ? '800px' : '600px',
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
                            {(currentUserRole === USER_ROLES.ADMIN ||
                                currentUserRole === USER_ROLES.SYSTEM_ADMIN) && (
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
                                )}
                        </tr>
                    </thead>
                    <tbody>
                        {searchResults.map((result, index) => (
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
                                        onClick={() => onSelectUser(result)}
                                        sx={{
                                            minWidth: '60px',
                                            fontSize: '0.7rem',
                                            padding: '2px 8px',
                                        }}
                                    >
                                        SELECT
                                    </Button>
                                </td>
                                {(currentUserRole === USER_ROLES.ADMIN ||
                                    currentUserRole === USER_ROLES.SYSTEM_ADMIN) && (
                                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                                            <IconButton
                                                size="small"
                                                onClick={() => onDeleteUser(result)}
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
                                    )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </Box>
        </Box>
    );
};

export default UserSearchTable;
