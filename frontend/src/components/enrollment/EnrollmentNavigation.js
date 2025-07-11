import React from 'react';
import {
    Box,
    Button,
    Divider
} from '@mui/material';

/**
 * EnrollmentNavigation Component
 * Navigation buttons for stepper with proper state handling
 */
const EnrollmentNavigation = ({
    currentStep,
    totalSteps,
    canProceed,
    isSubmitting,
    status,
    onBack,
    onNext,
    onSubmit
}) => {
    const isLastStep = currentStep === totalSteps - 1;

    return (
        <>
            <Divider sx={{ mb: 3 }} />

            <Box display="flex" justifyContent="space-between">
                <Button
                    onClick={onBack}
                    disabled={currentStep === 0 || isSubmitting}
                    variant="outlined"
                >
                    Back
                </Button>

                {isLastStep ? (
                    <Button
                        onClick={onSubmit}
                        disabled={!canProceed || isSubmitting}
                        variant="contained"
                        sx={{
                            backgroundColor: status.type === 'success' ? 'success.main' : 'primary.main',
                            '&:hover': {
                                backgroundColor: status.type === 'success' ? 'success.dark' : 'primary.dark',
                            }
                        }}
                    >
                        {isSubmitting ? 'Creating Account...' : status.type === 'success' ? 'Success!' : 'Complete Enrollment'}
                    </Button>
                ) : (
                    <Button
                        onClick={onNext}
                        disabled={!canProceed || isSubmitting}
                        variant="contained"
                    >
                        Next
                    </Button>
                )}
            </Box>
        </>
    );
};

export default EnrollmentNavigation;
