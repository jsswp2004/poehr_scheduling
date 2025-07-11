import React from 'react';
import {
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    TableContainer,
    Checkbox,
    CircularProgress,
    IconButton,
    Tooltip,
    Box,
} from '@mui/material';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEdit, faTrash, faSpinner } from '@fortawesome/free-solid-svg-icons';

const HolidayTable = ({
    loading,
    filteredHolidays,
    buffered,
    deletingId,
    formatDate,
    onCheckboxChange,
    onEdit,
    onDelete
}) => {
    return (
        <TableContainer
            sx={{
                borderRadius: 2,
                boxShadow: 2,
                bgcolor: '#fff',
                mb: 3,
                maxHeight: '50vh',
                overflowY: 'auto',
            }}
        >
            <Table
                size="small"
                stickyHeader
                sx={{
                    '& .MuiTableCell-root': {
                        py: 0.25,
                        px: 1,
                        fontSize: '0.875rem',
                        lineHeight: 1.2,
                    },
                    '& .MuiTableRow-root': {
                        height: '32px',
                    },
                    '& .MuiTableHead-root .MuiTableCell-root': {
                        backgroundColor: '#f5f5f5',
                        borderBottom: '2px solid #e0e0e0',
                        position: 'sticky',
                        top: 0,
                        zIndex: 1,
                    },
                }}
            >
                <TableHead>
                    <TableRow>
                        <TableCell style={{ width: 180, fontWeight: 700, py: 0.25 }}>
                            Date
                        </TableCell>
                        <TableCell style={{ minWidth: 250, fontWeight: 700, py: 0.25 }}>
                            Holiday
                        </TableCell>
                        <TableCell style={{ width: 100, fontWeight: 700, py: 0.25 }}>
                            Recognized
                        </TableCell>
                        <TableCell style={{ width: 100, fontWeight: 700, py: 0.25 }}>
                            Actions
                        </TableCell>
                    </TableRow>
                </TableHead>
                <TableBody>
                    {loading ? (
                        <TableRow>
                            <TableCell colSpan={4} align="center">
                                <CircularProgress size={24} />
                            </TableCell>
                        </TableRow>
                    ) : filteredHolidays.length === 0 ? (
                        <TableRow>
                            <TableCell
                                colSpan={4}
                                align="center"
                                sx={{ color: 'text.secondary', py: 4 }}
                            >
                                No holidays found.
                            </TableCell>
                        </TableRow>
                    ) : (
                        filteredHolidays.map((h) => (
                            <TableRow key={h.id} hover>
                                <TableCell>{formatDate(h.date)}</TableCell>
                                <TableCell sx={{ fontWeight: 500 }}>{h.name}</TableCell>
                                <TableCell>
                                    <Checkbox
                                        checked={buffered[h.id] ?? h.is_recognized}
                                        onChange={() =>
                                            onCheckboxChange(
                                                h.id,
                                                !(buffered[h.id] ?? h.is_recognized)
                                            )
                                        }
                                    />
                                </TableCell>
                                <TableCell>
                                    <Box sx={{ display: 'flex', gap: 1 }}>
                                        <Tooltip title="Edit">
                                            <IconButton
                                                size="small"
                                                onClick={() => onEdit(h)}
                                            >
                                                <FontAwesomeIcon icon={faEdit} />
                                            </IconButton>
                                        </Tooltip>
                                        <Tooltip title="Delete">
                                            <IconButton
                                                size="small"
                                                color="error"
                                                onClick={() => onDelete(h.id)}
                                                disabled={deletingId === h.id}
                                            >
                                                {deletingId === h.id ? (
                                                    <FontAwesomeIcon icon={faSpinner} spin />
                                                ) : (
                                                    <FontAwesomeIcon icon={faTrash} />
                                                )}
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
    );
};

export default HolidayTable;
