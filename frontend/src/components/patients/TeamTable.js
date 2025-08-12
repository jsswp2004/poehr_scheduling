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
    faSms,
    faEnvelope,
} from '@fortawesome/free-solid-svg-icons';
import MessagesButton from '../MessagesButton';

// StatusDot component removed for simplified chat system

function TeamTable({
    team,
    loadingTeam,
    teamSearch,
    setTeamSearch,
    teamPage,
    setTeamPage,
    teamTotalPages,
    onSendText,
    onOpenEmailModal,
    onOpenMessages,
    totalUnreadCount = 0,
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
        <Box sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            {/* Search Control and Messages Button */}
            <Box
                sx={{
                    display: 'flex',
                    gap: 2,
                    mb: 3,
                    mt: 2,
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexShrink: 0,
                }}
            >
                <TextField
                    label="Search team members..."
                    value={localSearchValue}
                    onChange={handleSearchInputChange}
                    variant="outlined"
                    size="small"
                    sx={{ minWidth: 300 }}
                />
                {onOpenMessages && (
                    <MessagesButton
                        onClick={onOpenMessages}
                        totalUnreadCount={totalUnreadCount}
                    />
                )}
            </Box>

            {/* Team Table */}
            <TableContainer component={Paper} sx={{ flex: 1, minHeight: 0 }}>
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
                <Box sx={{ display: 'flex', justifyContent: 'center', mt: 3, flexShrink: 0 }}>
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
