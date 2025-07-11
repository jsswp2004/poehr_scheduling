import React from 'react';
import { Box } from '@mui/material';
import {
    useHolidaysAuth,
    useHolidaysData,
    useYearLoader,
    useHolidayDialog,
    useHolidaySearch,
    useHolidayUtils,
} from '../hooks/holidays';
import {
    HolidayHeader,
    HolidayTable,
    HolidayFormDialog,
    HolidayActions,
} from '../components/holidays';

function HolidaysPage() {
    // Custom hooks
    const { getAuthHeaders } = useHolidaysAuth();

    const {
        holidayList,
        buffered,
        loading,
        saving,
        status,
        deletingId,
        setStatus,
        loadHolidays,
        handleHolidayCheckbox,
        handleSave,
        handleDelete,
    } = useHolidaysData(getAuthHeaders);

    const {
        yearInput,
        setYearInput,
        loadingYear,
        handleLoadYear,
    } = useYearLoader(getAuthHeaders, loadHolidays, setStatus);

    const {
        showHolidayDialog,
        editingHoliday,
        holidayFormData,
        saving: dialogSaving,
        handleOpenHolidayDialog,
        handleCloseHolidayDialog,
        handleSaveHoliday,
        updateHolidayFormData,
    } = useHolidayDialog(getAuthHeaders, loadHolidays, setStatus);

    const {
        searchQuery,
        setSearchQuery,
        filteredHolidays,
        clearSearch,
    } = useHolidaySearch(holidayList);

    const { formatDate } = useHolidayUtils();

    return (
        <Box
            sx={{
                minHeight: '50vh',
                bgcolor: 'background.default',
                p: 3,
            }}
        >
            <Box sx={{ width: '100%' }}>
                <HolidayHeader
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    onClearSearch={clearSearch}
                    yearInput={yearInput}
                    onYearChange={setYearInput}
                    loadingYear={loadingYear}
                    onLoadYear={handleLoadYear}
                    onAddHoliday={() => handleOpenHolidayDialog(null)}
                />

                <HolidayTable
                    loading={loading}
                    filteredHolidays={filteredHolidays}
                    buffered={buffered}
                    deletingId={deletingId}
                    formatDate={formatDate}
                    onCheckboxChange={handleHolidayCheckbox}
                    onEdit={handleOpenHolidayDialog}
                    onDelete={handleDelete}
                />

                <HolidayActions
                    saving={saving}
                    loading={loading}
                    status={status}
                    onSave={handleSave}
                />

                <HolidayFormDialog
                    open={showHolidayDialog}
                    editingHoliday={editingHoliday}
                    holidayFormData={holidayFormData}
                    saving={dialogSaving}
                    onClose={handleCloseHolidayDialog}
                    onSave={handleSaveHoliday}
                    onUpdateFormData={updateHolidayFormData}
                />
            </Box>
        </Box>
    );
}

export default HolidaysPage;
