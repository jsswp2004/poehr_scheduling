import React from 'react';
import {
    Table,
    TableHead,
    TableRow,
    TableCell,
    TableBody,
    Checkbox
} from '@mui/material';

// Days configuration
const DAYS = [
    { label: 'Mon', value: 1 },
    { label: 'Tue', value: 2 },
    { label: 'Wed', value: 3 },
    { label: 'Thu', value: 4 },
    { label: 'Fri', value: 5 },
    { label: 'Sat', value: 6 },
    { label: 'Sun', value: 0 },
];

/**
 * BlockedDaysTable Component
 * Renders the table for selecting blocked days with checkboxes
 */
const BlockedDaysTable = ({
    blockedDays,
    onDayToggle,
    loading,
    saving
}) => {
    return (
        <Table
            size="small"
            stickyHeader
            sx={{ bgcolor: '#f5faff', borderRadius: 2 }}
        >
            <TableHead>
                <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                    <TableCell
                        sx={{ fontWeight: 'bold', width: 180, fontSize: '1rem' }}
                    >
                        Setting
                    </TableCell>
                    {DAYS.map((d) => (
                        <TableCell
                            key={d.value}
                            sx={{
                                fontWeight: 'bold',
                                width: 80,
                                textAlign: 'center',
                                fontSize: '1rem',
                            }}
                        >
                            {d.label}
                        </TableCell>
                    ))}
                </TableRow>
            </TableHead>
            <TableBody>
                <TableRow sx={{ '&:nth-of-type(odd)': { bgcolor: '#f0f4ff' } }}>
                    <TableCell className="text-start">
                        <b>Organization Blocked Days</b>
                    </TableCell>
                    {DAYS.map((d) => (
                        <TableCell key={d.value} sx={{ textAlign: 'center' }}>
                            <Checkbox
                                checked={blockedDays.includes(d.value)}
                                onChange={() => onDayToggle(d.value)}
                                disabled={loading || saving}
                            />
                        </TableCell>
                    ))}
                </TableRow>
            </TableBody>
        </Table>
    );
};

export default BlockedDaysTable;
