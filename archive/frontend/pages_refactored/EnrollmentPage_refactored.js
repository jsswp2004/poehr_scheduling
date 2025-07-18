import React, { useRef } from 'react';
import {
    Container,
    Paper,
    Typography,
    Box
} from '@mui/material';
import Header from '../components/Header';
import Footer from '../components/Footer';
import StripeProvider from '../components/StripeProvider';

// Import custom hooks
import {
    useEnrollmentForm,
    useEnrollmentStepper,
    useEnrollmentSubmission,
    usePaymentMethod
} from '../hooks/enrollment';

// Import components
import {
    EnrollmentStepper,
    EnrollmentNavigation,
    StepContent
} from '../components/enrollment';

function EnrollmentPage() {
    const paymentFormRef = useRef();

    // Custom hooks for state management
    const {
        formData,
        handleChange,
        handleTierSelect
    } = useEnrollmentForm();

    const {
        paymentMethodReady,
        setPaymentMethodReady
    } = usePaymentMethod();

    const {
        steps,
        currentStep,
        handleNext,
        handleBack,
        canProceed
    } = useEnrollmentStepper(formData, paymentMethodReady);

    const {
        status,
        isSubmitting,
        handleSubmit
    } = useEnrollmentSubmission();

    // Event handlers
    const handleFormSubmit = async (e) => {
        e.preventDefault();
        await handleSubmit(formData, paymentFormRef);
    };

    const isProceedingAllowed = canProceed();

    return (
        <StripeProvider>
            <div className="enrollment-page">
                <Header />
                <Container maxWidth="md" sx={{ my: 4 }}>
                    <Paper elevation={4} sx={{ p: 4 }}>
                        <Typography variant="h5" sx={{ mb: 3, fontWeight: 700, textAlign: 'center' }}>
                            Create Your Account
                        </Typography>

                        {/* Progress Stepper and Status */}
                        <EnrollmentStepper
                            steps={steps}
                            activeStep={currentStep}
                            status={status}
                        />

                        {/* Step Content */}
                        <Box sx={{ mb: 4 }}>
                            <StepContent
                                ref={paymentFormRef}
                                currentStep={currentStep}
                                formData={formData}
                                onChange={handleChange}
                                onTierSelect={handleTierSelect}
                                isSubmitting={isSubmitting}
                                onPaymentMethodReady={setPaymentMethodReady}
                                status={status}
                            />
                        </Box>

                        {/* Navigation Buttons */}
                        <EnrollmentNavigation
                            currentStep={currentStep}
                            totalSteps={steps.length}
                            canProceed={isProceedingAllowed}
                            isSubmitting={isSubmitting}
                            status={status}
                            onBack={handleBack}
                            onNext={handleNext}
                            onSubmit={handleFormSubmit}
                        />
                    </Paper>
                </Container>
                <Footer pricingLink="/pricing" featuresLink="/features" />
            </div>
        </StripeProvider>
    );
}

export default EnrollmentPage;
