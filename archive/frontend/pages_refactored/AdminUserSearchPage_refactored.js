import React from 'react';
import { Box } from '@mui/material';
import {
    useAdminAuth,
    useAppointmentSearch,
    usePagination,
    useAppointmentModal
} from '../hooks/admin-search';
import {
    PageHeader,
    SearchForm,
    AppointmentsTable,
    AppointmentModal,
    PaginationWrapper
} from '../components/admin-search';

/**
 * AdminUserSearchPage Component (Refactored)
 * Provides search functionality for appointments with admin access controls
 * 
 * Features:
 * - Admin/System Admin/Registrar authentication required
 * - Search appointments by patient, provider, date, or description
 * - View appointment details in modal
 * - Delete appointments with confirmation
 * - Paginated results display
 * - Responsive table layout
 */
function AdminUserSearchPage() {
    // Authentication and authorization
    const { getAuthToken } = useAdminAuth();

    // Search functionality
    const {
        query,
        setQuery,
        sortedResults,
        handleSearch,
        handleDeleteAppointment
    } = useAppointmentSearch(getAuthToken);

    // Pagination
    const {
        currentPage,
        paginatedItems: paginatedResults,
        handlePageChange,
        itemsPerPage
    } = usePagination(sortedResults, 10);

    // Modal management
    const {
        isOpen: detailsOpen,
        selectedItem: selectedAppointment,
        openModal: handleViewDetails,
        closeModal: handleCloseDetails
    } = useAppointmentModal();

    return (
        <Box sx={{ width: '100%', mt: 5, px: 3 }}>
            {/* Page Header */}
            <PageHeader />

            {/* Search Form */}
            <SearchForm
                query={query}
                onQueryChange={setQuery}
                onSearch={handleSearch}
            />

            {/* Appointments Table */}
            <AppointmentsTable
                appointments={paginatedResults}
                onViewDetails={handleViewDetails}
                onDeleteAppointment={handleDeleteAppointment}
            />

            {/* Pagination */}
            <PaginationWrapper
                totalItems={sortedResults.length}
                itemsPerPage={itemsPerPage}
                currentPage={currentPage}
                onPageChange={handlePageChange}
            />

            {/* Appointment Details Modal */}
            <AppointmentModal
                open={detailsOpen}
                onClose={handleCloseDetails}
                appointment={selectedAppointment}
            />
        </Box>
    );
}

export default AdminUserSearchPage;
