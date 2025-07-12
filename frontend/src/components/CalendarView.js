/**
 * Refactored CalendarView component
 * 
 * This is a much more maintainable version of the original 1438-line CalendarView.js
 * - Business logic extracted into custom hooks
 * - UI components modularized
 * - Utilities extracted for reusability
 * - Better separation of concerns
 */
import React, { useCallback } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Box, CircularProgress, Typography } from "@mui/material";

// Components
import BackButton from "./BackButton";
import CustomToolbar from "./calendar/CustomToolbar";
import AppointmentModal from "./calendar/AppointmentModal";
import AvailabilityModal from "./calendar/AvailabilityModal";

// Hooks
import { useCalendarData } from "../hooks/calendar/useCalendarData";
import { useAppointmentModal } from "../hooks/calendar/useAppointmentModal";
import { useAvailabilityModal } from "../hooks/calendar/useAvailabilityModal";

const localizer = momentLocalizer(moment);

function CalendarView({ onUpdate, showBackButton = true }) {
  // Custom hooks for data and functionality
  const {
    events,
    doctors,
    availabilityEvents,
    holidays,
    clinicEvents,
    environmentSettings,
    currentDate,
    setCurrentDate,
    currentView,
    setCurrentView,
    searchQuery,
    setSearchQuery,
    loading,
    userRole,
    token,
    refetchData,
  } = useCalendarData();

  const appointmentModal = useAppointmentModal(onUpdate || refetchData, token);
  const availabilityModal = useAvailabilityModal(availabilityEvents);

  // Calendar event handlers
  const handleSelectSlot = useCallback(
    ({ start, end }) => {
      appointmentModal.openNewAppointmentModal(start, end);
    },
    [appointmentModal]
  );

  const handleSelectEvent = useCallback(
    (event) => {
      if (event.resource?.type === "appointment") {
        appointmentModal.openEditAppointmentModal(event);
      } else if (event.resource?.type === "availability") {
        availabilityModal.openAvailabilityModal(new Date(event.start));
      }
    },
    [appointmentModal, availabilityModal]
  );

  // Day prop getter for blocked days styling
  const dayPropGetter = useCallback((date) => {
    // Debug logging for blocked days
    console.log('DayPropGetter called for date:', date.toDateString());
    console.log('Day of week:', date.getDay()); // 0 = Sunday, 6 = Saturday
    console.log('Environment settings:', environmentSettings);
    console.log('Holidays data:', holidays);
    console.log('Clinic events data:', clinicEvents);
    
    // Check if this day is in the organization's blocked days
    const isOrganizationBlockedDay = environmentSettings?.blocked_days?.includes(date.getDay()) || false;
    
    // Check if this date is a holiday
    const isHoliday = holidays.some(holiday => {
      const holidayDate = new Date(holiday.date);
      console.log('Comparing holiday date:', holidayDate.toDateString(), 'with:', date.toDateString());
      return holidayDate.toDateString() === date.toDateString();
    });

    // Check if this date has a clinic event that blocks the entire day
    const hasBlockingClinicEvent = clinicEvents.some(event => {
      const eventStart = new Date(event.start_datetime);
      const eventEnd = new Date(event.end_datetime);
      
      // Check if the clinic event spans the entire day or is marked as a blocking event
      const isAllDay = event.all_day || 
        (eventEnd.getTime() - eventStart.getTime()) >= (24 * 60 * 60 * 1000 - 60000); // Nearly full day
      
      console.log('Comparing clinic event:', eventStart.toDateString(), 'with:', date.toDateString(), 'isAllDay:', isAllDay);
      return isAllDay && eventStart.toDateString() === date.toDateString();
    });

    console.log('Date', date.toDateString(), 'isOrganizationBlockedDay:', isOrganizationBlockedDay, 'isHoliday:', isHoliday, 'hasBlockingClinicEvent:', hasBlockingClinicEvent);
    // Apply pink background for blocked days (organization blocked days, holidays, or clinic events)
    if (isOrganizationBlockedDay || isHoliday || hasBlockingClinicEvent) {
      return {
        style: {
          backgroundColor: '#fce4ec', // Light pink background for blocked days
        },
      };
    }
    
    return {};
  }, [holidays, clinicEvents, environmentSettings]);

  const handleNavigate = useCallback(
    (newDate) => {
      setCurrentDate(newDate);
    },
    [setCurrentDate]
  );

  const handleViewChange = useCallback(
    (view) => {
      setCurrentView(view);
    },
    [setCurrentView]
  );

  const handleSearchChange = useCallback(
    (e) => {
      setSearchQuery(e.target.value);
    },
    [setSearchQuery]
  );

  // Form handlers for appointment modal
  const handleDoctorChange = useCallback(
    (e) => {
      const doctorId = e.target.value;
      const doctor = doctors.find((d) => d.id === doctorId);
      appointmentModal.setSelectedDoctor(doctor);
      appointmentModal.setModalFormData({
        ...appointmentModal.modalFormData,
        provider: doctorId,
      });
    },
    [doctors, appointmentModal]
  );

  // Loading state
  if (loading) {
    return (
      <Box
        display="flex"
        justifyContent="center"
        alignItems="center"
        minHeight="400px"
      >
        <CircularProgress />
        <Typography variant="h6" sx={{ ml: 2 }}>
          Loading calendar...
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      {showBackButton && <BackButton />}

      <Box sx={{ height: "calc(100vh - 200px)", mt: showBackButton ? 2 : 0 }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          titleAccessor="title"
          date={currentDate}
          onNavigate={handleNavigate}
          view={currentView}
          onView={handleViewChange}
          onSelectEvent={handleSelectEvent}
          onSelectSlot={handleSelectSlot}
          selectable
          popup
          resizable
          step={15}
          timeslots={4}
          views={["month", "week", "work_week", "day", "agenda"]}
          dayPropGetter={dayPropGetter}
          components={{
            toolbar: (props) => (
              <CustomToolbar
                {...props}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
              />
            ),
          }}
          eventPropGetter={(event) => {
            let backgroundColor = "#3174ad";
            let borderColor = "#3174ad";

            switch (event.resource?.type) {
              case "appointment":
                backgroundColor = "#3174ad";
                break;
              case "availability":
                backgroundColor = "#28a745";
                borderColor = "#28a745";
                break;
              case "clinic_event":
                backgroundColor = "#ffc107";
                borderColor = "#ffc107";
                break;
              case "holiday":
                backgroundColor = "#dc3545";
                borderColor = "#dc3545";
                break;
            }

            return {
              style: {
                backgroundColor,
                borderColor,
                color: "white",
              },
            };
          }}
        />

        {/* Appointment Modal */}
        <AppointmentModal
          open={appointmentModal.showModal}
          onClose={appointmentModal.closeModal}
          isEditing={appointmentModal.isEditing}
          isPast={appointmentModal.isPast}
          formData={appointmentModal.modalFormData}
          onFormChange={appointmentModal.setModalFormData}
          doctors={doctors}
          selectedDoctor={appointmentModal.selectedDoctor}
          onDoctorChange={handleDoctorChange}
          onSubmit={appointmentModal.handleSubmit}
          onDelete={appointmentModal.handleDelete}
        />

        {/* Availability Modal */}
        <AvailabilityModal
          open={availabilityModal.showAvailabilityModal}
          onClose={availabilityModal.closeAvailabilityModal}
          selectedDateAvailability={availabilityModal.selectedDateAvailability}
        />
      </Box>
    </Box>
  );
}

export default CalendarView;
