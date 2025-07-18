import React from 'react';
import '../ContactPage/ContactPage.css';
import Header from '../components/Header';
import Footer from '../components/Footer';

// Import custom hooks
import {
    useEmailForm,
    useSmsForm,
    useContactModals,
    useContactSubmission
} from '../hooks/contact';

// Import components
import {
    PageHeader,
    ContactGrid,
    EmailModal,
    SmsModal
} from '../components/contact';

export const ContactPage = ({ className }) => {
    // Custom hooks for form management
    const {
        formData,
        formErrors,
        handleInputChange,
        validateForm,
        resetForm,
        setFormErrors
    } = useEmailForm();

    const {
        smsFormData,
        smsFormErrors,
        handleSmsInputChange,
        validateSmsForm,
        resetSmsForm,
        setSmsFormErrors
    } = useSmsForm();

    // Modal management
    const {
        isModalOpen,
        isSmsModalOpen,
        openEmailModal,
        closeEmailModal,
        openSmsModal,
        closeSmsModal
    } = useContactModals();

    // Submission handling
    const {
        isLoading,
        isSmsLoading,
        handleSendEmail,
        handleSendSms
    } = useContactSubmission();

    // Event handlers
    const handleEmailSubmit = async (e) => {
        e.preventDefault();

        if (!validateForm()) {
            return;
        }

        await handleSendEmail(formData, () => {
            closeEmailModal();
            resetForm();
        });
    };

    const handleSmsSubmit = async (e) => {
        e.preventDefault();

        if (!validateSmsForm()) {
            return;
        }

        await handleSendSms(smsFormData, () => {
            closeSmsModal();
            resetSmsForm();
        });
    };

    const handleEmailModalClose = () => {
        closeEmailModal();
        setFormErrors({});
    };

    const handleSmsModalClose = () => {
        closeSmsModal();
        setSmsFormErrors({});
    };

    return (
        <div className={`contact-page ${className || ''}`}>
            <Header />

            <PageHeader />

            <ContactGrid
                onEmailClick={openEmailModal}
                onSmsClick={openSmsModal}
            />

            <EmailModal
                isOpen={isModalOpen}
                formData={formData}
                formErrors={formErrors}
                isLoading={isLoading}
                onInputChange={handleInputChange}
                onSubmit={handleEmailSubmit}
                onClose={handleEmailModalClose}
            />

            <SmsModal
                isOpen={isSmsModalOpen}
                smsFormData={smsFormData}
                smsFormErrors={smsFormErrors}
                isSmsLoading={isSmsLoading}
                onInputChange={handleSmsInputChange}
                onSubmit={handleSmsSubmit}
                onClose={handleSmsModalClose}
            />

            <Footer pricingLink="/pricing" featuresLink="/features" />
        </div>
    );
};

export default ContactPage;
