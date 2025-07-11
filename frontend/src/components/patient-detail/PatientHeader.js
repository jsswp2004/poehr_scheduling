import React from 'react';
import { Box, Typography } from '@mui/material';
import BackButton from '../BackButton';

function PatientHeader({ patient }) {
    return (
        <>
            {/* Header with BackButton inline */}
            <Box
                sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    mb: 2,
                }}
            >
                <Typography variant="h5">Patient Details</Typography>
                <BackButton to="/patients" />
            </Box>

            {/* Show profile picture if available */}
            {patient?.profile_picture && (
                <div className="mb-3 text-center">
                    <img
                        src={
                            patient.profile_picture.startsWith('http')
                                ? patient.profile_picture
                                : `http://127.0.0.1:8000${patient.profile_picture}`
                        }
                        alt="Profile"
                        style={{
                            width: 120,
                            height: 120,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid #ccc',
                        }}
                    />
                </div>
            )}
        </>
    );
}

export default PatientHeader;
