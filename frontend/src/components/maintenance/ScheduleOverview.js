import React from 'react';
import { Box, Typography } from '@mui/material';
import ScheduleTable from './ScheduleTable';

const ScheduleOverview = ({
    schedules,
    doctors,
    availabilityTableRef,
    blockedTableRef,
    onEdit,
    onDelete,
}) => {
    return (
        <Box sx={{ p: 3, height: '100%', minWidth: 400, width: '100%', display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" gutterBottom>
                Schedule Overview
            </Typography>
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'row', gap: 2, minHeight: 0 }}>
                {/* Availability Section */}
                <ScheduleTable
                    schedules={schedules}
                    doctors={doctors}
                    isBlocked={false}
                    tableRef={availabilityTableRef}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    sx={{ flex: 1, minWidth: '500px' }}
                />

                {/* Blocked Section */}
                <ScheduleTable
                    schedules={schedules}
                    doctors={doctors}
                    isBlocked={true}
                    tableRef={blockedTableRef}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    sx={{ flex: 1, minWidth: '500px' }}
                />
            </Box>
        </Box>
    );
};

export default ScheduleOverview;
