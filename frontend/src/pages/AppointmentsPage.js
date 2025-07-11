import React, { useEffect } from 'react';
import { Container, Grid } from '@mui/material';
import { useNavigate } from 'react-router-dom';

// Custom hooks
import { useAuth } from '../hooks/useAuth';
import { useAppointmentsList } from '../hooks/useAppointmentsList';
import { useTodaysAppointments } from '../hooks/useTodaysAppointments';
import { useAppointmentDetails } from '../hooks/useAppointmentDetails';
import { useAppointmentPageUtils } from '../hooks/useAppointmentPageUtils';

// Components
import {
    SummaryPanel,
    TodaysAppointmentsPanel,
    AppointmentsTable,
    AppointmentDetailsDialog
} from '../components/appointments';

/**
 * Refactored AppointmentsPage with modular components and hooks
 * 
 * Features:
 * - Role-based access control
 * - Today's appointments summary with status updates
 * - Searchable appointments table with pagination
 * - Appointment details modal
 * - Delete functionality
 */
function AppointmentsPage() {
    const navigate = useNavigate();
    const token = localStorage.getItem('access_token');

    // Authentication and role checking
    const { user, loading: authLoading } = useAuth();

    // Check authorization on mount
    useEffect(() => {
        if (!authLoading && (!token || !user)) {
            navigate('/login');
            return;
        }

        if (user && user.role) {
            const validRoles = ['doctor', 'registrar', 'admin', 'system_admin'];
            if (!validRoles.includes(user.role)) {
                navigate('/');
            }
        }
    }, [user, token, authLoading, navigate]);

    // Custom hooks for business logic
    const appointmentsList = useAppointmentsList(token);
    const todaysAppointments = useTodaysAppointments(token);
    const appointmentDetails = useAppointmentDetails();
    const utils = useAppointmentPageUtils(token);

    // Handle appointment status updates
    const handleStatusUpdate = async (appointmentId, field, value) => {
        const success = await todaysAppointments.updateAppointmentStatus(appointmentId, field, value);
        if (!success) {
            alert('Failed to update appointment status.');
        }
    };

    // Handle appointment deletion (also refresh today's appointments)
    const handleDeleteAppointment = async (appointmentId) => {
        const success = await appointmentsList.deleteAppointment(appointmentId);
        if (success) {
            // Refresh today's appointments if needed
            todaysAppointments.refreshTodaysAppointments();
        }
        return success;
    };

    // Handle back navigation
    const handleBackNavigation = (e) => {
        if (e) e.preventDefault();
        navigate(-1);
    };

    // Show loading state
    if (authLoading || !token) {
        return (
            <Container sx={{ display: 'flex', justifyContent: 'center', mt: 4 }}>
                Loading...
            </Container>
        );
    }

    return (
        <Container
            disableGutters
            sx={{
                ml: 0,
                mr: 0,
                pl: 0,
                pr: 0,
                minHeight: '100vh',
                width: '100vw',
                maxWidth: '100vw!important',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            <Grid container spacing={3}>
                {/* Summary Panel */}
                <SummaryPanel
                    userName={utils.userName}
                    greeting={utils.greeting}
                    totalToday={todaysAppointments.totalToday}
                    doctorPatientMap={todaysAppointments.doctorPatientMap}
                />

                {/* Today's Appointments Panel */}
                <TodaysAppointmentsPanel
                    todaysAppointments={todaysAppointments.todaysAppointments}
                    onStatusUpdate={handleStatusUpdate}
                    onAppointmentClick={appointmentDetails.openDetails}
                    formatPatientName={utils.formatPatientName}
                    formatProviderName={utils.formatProviderName}
                    formatAppointmentTime={utils.formatAppointmentTime}
                />

                {/* Main Appointments Table */}
                <AppointmentsTable
                    searchQuery={appointmentsList.searchQuery}
                    onSearchChange={appointmentsList.handleSearch}
                    appointments={appointmentsList.appointments}
                    onViewDetails={appointmentDetails.openDetails}
                    onDeleteAppointment={handleDeleteAppointment}
                    formatPatientName={utils.formatPatientName}
                    formatProviderName={utils.formatProviderName}
                    formatAppointmentDateTime={utils.formatAppointmentDateTime}
                    page={appointmentsList.page}
                    totalPages={appointmentsList.totalPages}
                    onPageChange={appointmentsList.setPage}
                    loading={appointmentsList.loading}
                />
            </Grid>

            {/* Appointment Details Dialog */}
            <AppointmentDetailsDialog
                open={appointmentDetails.detailsOpen}
                onClose={appointmentDetails.closeDetails}
                appointment={appointmentDetails.selectedAppointment}
                formatPatientName={utils.formatPatientName}
                formatProviderName={utils.formatProviderName}
                formatAppointmentDateTime={utils.formatAppointmentDateTime}
            />
        </Container>
    );
}

export default AppointmentsPage;
