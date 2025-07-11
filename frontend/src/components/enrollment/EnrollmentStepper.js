import React from 'react';
import {
    Stepper,
    Step,
    StepLabel,
    Box,
    Alert
} from '@mui/material';

/**
 * EnrollmentStepper Component
 * Displays progress stepper and status alerts
 */
const EnrollmentStepper = ({
    steps,
    activeStep,
    status
}) => {
    return (
        <>
            {/* Progress Stepper */}
            <Stepper activeStep={activeStep} sx={{ mb: 4 }}>
                {steps.map((label) => (
                    <Step key={label}>
                        <StepLabel>{label}</StepLabel>
                    </Step>
                ))}
            </Stepper>

            {/* Status Alert */}
            {status.message && (
                <Box sx={{ mb: 3 }}>
                    <Alert
                        severity={status.type}
                        sx={{
                            borderRadius: 1,
                            '& .MuiAlert-message': {
                                fontWeight: 500
                            }
                        }}
                    >
                        {status.message}
                    </Alert>
                </Box>
            )}
        </>
    );
};

export default EnrollmentStepper;
