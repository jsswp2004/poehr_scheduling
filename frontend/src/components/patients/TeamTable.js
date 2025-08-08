import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    Box,
    Typography,
    TextField,
    Paper,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    IconButton,
    Tooltip,
    Pagination,
    CircularProgress,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
    faCommentDots,
    faEnvelope,
    faSms,
} from '@fortawesome/free-solid-svg-icons';

// StatusDot component removed for simplified chat system

function TeamTable({
    team,
    loadingTeam,
    teamSearch,
    setTeamSearch,
    teamPage,
    setTeamPage,
    teamTotalPages,
    onOpenChat,
    getUserOnlineStatus,
    getUnreadCountForUser,
    onSendText,
    onOpenEmailModal,
}) {
    // Local state for responsive search input
    const [localSearchValue, setLocalSearchValue] = useState(teamSearch || '');
    const searchTimeoutRef = useRef(null);

    // Sync local search with external teamSearch when it changes
    useEffect(() => {
        setLocalSearchValue(teamSearch || '');
    }, [teamSearch]);

    // Handle local search input changes with debouncing
    const handleSearchInputChange = useCallback((e) => {
        const value = e.target.value;
        setLocalSearchValue(value);

        // Clear existing timeout
        if (searchTimeoutRef.current) {
            clearTimeout(searchTimeoutRef.current);
        }

        // Debounce the external search update
        searchTimeoutRef.current = setTimeout(() => {
            setTeamSearch(value);
        }, 300);
    }, [setTeamSearch]);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (searchTimeoutRef.current) {
                clearTimeout(searchTimeoutRef.current);
            }
        };
    }, []);

    if (loadingTeam) {
        return (
            <Box sx={{ textAlign: 'center', py: 4 }}>
                <CircularProgress />
                <Typography sx={{ mt: 2 }}>Loading team members...</Typography>
            </Box>
        );
    }

    return (
        <Box>
            {/* Search Control */}
            <Box sx={{ mb: 3 }}>
                <TextField
                    label="Search team members..."
                    value={localSearchValue}
                    onChange={handleSearchInputChange}
                    variant="outlined"
                    size="small"
                    sx={{ minWidth: 300, mt: 2 }}
                />
            </Box>

            {/* Team Table */}
            <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                <Table stickyHeader>
                    <TableHead>
                        <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                            <TableCell sx={{ fontWeight: 'bold' }}>Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Role</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Phone</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Organization</TableCell>
                            <TableCell sx={{ fontWeight: 'bold', textAlign: 'center' }}>
                                Actions
                            </TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {team.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={6} sx={{ textAlign: 'center', py: 4 }}>
                                    No team members found
                                </TableCell>
                            </TableRow>
                        ) : (
                            team.map((member) => {
                                const unreadCount = getUnreadCountForUser ? getUnreadCountForUser(member.id) : 0;

                                return (
                                    <TableRow
                                        key={member.id}
                                        sx={{
                                            '&:hover': { bgcolor: '#f5f5f5' },
                                            cursor: 'pointer',
                                        }}
                                    >
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                                {member.full_name}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                                                {member.role || 'N/A'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">
                                                {member.email || 'N/A'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">
                                                {member.phone_number || 'N/A'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">
                                                {member.organization_name || 'No Organization'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell sx={{ textAlign: 'center' }}>
                                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                <Tooltip title="Send SMS">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => onSendText(member)}
                                                        sx={{ color: 'primary.main' }}
                                                    >
                                                        <FontAwesomeIcon icon={faSms} />
                                                    </IconButton>
                                                </Tooltip>

                                                <Tooltip title={`Send Message${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}>
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => onOpenChat(member)}
                                                        sx={{
                                                            color: unreadCount > 0 ? '#ff4444' : 'info.main',
                                                            position: 'relative',
                                                        }}
                                                    >
                                                        <FontAwesomeIcon icon={faCommentDots} />
                                                        {unreadCount > 0 && (
                                                            <Box
                                                                sx={{
                                                                    position: 'absolute',
                                                                    top: -2,
                                                                    right: -2,
                                                                    width: 12,
                                                                    height: 12,
                                                                    backgroundColor: '#ff4444',
                                                                    borderRadius: '50%',
                                                                    border: '1px solid white',
                                                                }}
                                                            />
                                                        )}
                                                    </IconButton>
                                                </Tooltip>

                                                <Tooltip title="Send Email">
                                                    <IconButton
                                                        size="small"
                                                        onClick={() => onOpenEmailModal(member)}
                                                        sx={{ color: 'success.main' }}
                                                    >
                                                        <FontAwesomeIcon icon={faEnvelope} />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Pagination */}
            {teamTotalPages > 1 && (
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3 }}>
                    <Pagination
                        count={teamTotalPages}
                        page={teamPage}
                        onChange={(e, newPage) => setTeamPage(newPage)}
                        color="primary"
                        showFirstButton
                        showLastButton
                    />
                </Box>
            )}
        </Box>
    );
}

export default TeamTable;
