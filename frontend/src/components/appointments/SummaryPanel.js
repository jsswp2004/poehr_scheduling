import React from 'react';
import {
    Paper,
    Typography,
    Box,
    Grid
} from '@mui/material';
import TodayIcon from '@mui/icons-material/Today';

/**
 * Summary panel showing greeting message and daily statistics
 */
const SummaryPanel = ({ userName, greeting, totalToday, doctorPatientMap }) => {
    return (
        <Grid item xs={12}>
            <Paper
                sx={{
                    p: 2,
                    borderRadius: 2,
                    boxShadow: 2,
                    mb: 2,
                    minWidth: 420,
                    minHeight: 320,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                }}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                    <TodayIcon color="secondary" sx={{ mr: 1 }} />
                    <Typography variant="h5" fontWeight={600}>
                        Summary
                    </Typography>
                </Box>

                <Box
                    sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        py: 2,
                    }}
                >
                    <Typography
                        variant="h5"
                        fontWeight={700}
                        color="primary.main"
                        gutterBottom
                    >
                        {greeting}
                        {userName ? `, ${userName}` : ''}! 🌞
                    </Typography>

                    <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
                        Wishing you a wonderful day at POWER Scheduling!
                    </Typography>

                    <Typography variant="h6" fontWeight={600} sx={{ mt: 1 }}>
                        Total Appointments Today: {totalToday}
                    </Typography>

                    <Box sx={{ mt: 2, width: '100%' }}>
                        <Typography variant="subtitle1" fontWeight={600} sx={{ mb: 1 }}>
                            Patients per Doctor:
                        </Typography>
                        {Object.keys(doctorPatientMap).length === 0 ? (
                            <Typography color="text.secondary">
                                No appointments scheduled for today.
                            </Typography>
                        ) : (
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                {Object.entries(doctorPatientMap).map(([doctor, count]) => (
                                    <li key={doctor}>
                                        <Typography variant="body2" color="text.primary">
                                            {doctor}: {count} patient{count > 1 ? 's' : ''}
                                        </Typography>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </Box>
                </Box>
            </Paper>
        </Grid>
    );
};

export default SummaryPanel;
