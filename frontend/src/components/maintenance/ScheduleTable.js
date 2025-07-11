import React from 'react';
import {
    Box,
    Typography,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    IconButton,
    Tooltip,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash } from '@fortawesome/free-solid-svg-icons';

const ScheduleTable = ({
    schedules,
    doctors,
    isBlocked = false,
    tableRef,
    onEdit,
    onDelete,
}) => {
    const filteredSchedules = schedules.filter(s => s.is_blocked === isBlocked);
    const title = isBlocked ? '🚫 Blocked' : '✅ Availability';
    const titleColor = isBlocked ? 'error.main' : 'success.main';

    const formatScheduleDisplay = (schedule) => {
        const startTime = new Date(schedule.start_time).toLocaleString();
        const endTime = new Date(schedule.end_time).toLocaleString();
        let display = `${startTime} — ${endTime}`;

        if (isBlocked) {
            const doctor = doctors.find(d => d.id === schedule.doctor);
            const doctorName = doctor ? `Dr. ${doctor.first_name} ${doctor.last_name}` : '';
            display += ` | ${schedule.block_type || 'No Type'} | ${doctorName}`;
        }

        return display;
    };

    const tableContainerStyles = {
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        boxShadow: 'none',
        borderRadius: 0,
        minHeight: 200,
        maxHeight: '500px',
        border: '1px solid #e0e0e0',
        '&::-webkit-scrollbar': {
            width: '8px',
        },
        '&::-webkit-scrollbar-track': {
            background: '#f1f1f1',
        },
        '&::-webkit-scrollbar-thumb': {
            background: '#888',
            borderRadius: '4px',
        },
        '&::-webkit-scrollbar-thumb:hover': {
            background: '#555',
        },
    };

    const actionButtonStyles = {
        width: 36,
        height: 36,
        minWidth: 0,
        padding: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
    };

    return (
        <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <Typography color={titleColor} sx={{ mb: 1 }}>
                {title}
            </Typography>
            <TableContainer
                component={Paper}
                ref={tableRef}
                sx={tableContainerStyles}
            >
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>Date/Time</TableCell>
                            <TableCell align="right">Actions</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {filteredSchedules.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={2} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                    No {isBlocked ? 'blocked' : 'availability'} schedules found
                                </TableCell>
                            </TableRow>
                        ) : (
                            filteredSchedules.map(schedule => (
                                <TableRow key={schedule.id}>
                                    <TableCell>
                                        {formatScheduleDisplay(schedule)}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Box
                                            sx={{
                                                display: 'flex',
                                                flexDirection: 'row',
                                                justifyContent: 'center',
                                                gap: 1,
                                            }}
                                        >
                                            <Tooltip title="Edit schedule" placement="top">
                                                <IconButton
                                                    size="small"
                                                    color="primary"
                                                    sx={{ ...actionButtonStyles, mr: 1 }}
                                                    onClick={() => onEdit(schedule)}
                                                >
                                                    <FontAwesomeIcon icon={faEdit} />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete schedule" placement="top">
                                                <IconButton
                                                    size="small"
                                                    color="error"
                                                    sx={actionButtonStyles}
                                                    onClick={() => onDelete(schedule.id)}
                                                >
                                                    <FontAwesomeIcon icon={faTrash} />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default ScheduleTable;
