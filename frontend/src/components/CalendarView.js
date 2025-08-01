/**
 * Refactored CalendarView component
 *
 * This is a much more maintainable version of the original 1438-line CalendarView.js
 * - Business logic extracted into custom hooks
 * - UI components modularized
 * - Utilities extracted for reusability
 * - Better separation of concerns
 */
import React, { useCallback, memo, useState, useRef, useEffect } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import {
  Box,
  CircularProgress,
  Typography,
  Avatar,
  Tooltip,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUserMd,
  faStethoscope,
  faCalendarAlt,
} from "@fortawesome/free-solid-svg-icons";
import { useNavigate } from "react-router-dom";

// Components
import BackButton from "./BackButton";
import CustomToolbar from "./calendar/CustomToolbar";
import AppointmentModal from "./calendar/AppointmentModal";
import AvailabilityModal from "./calendar/AvailabilityModal";
import AvailableProvidersModal from "./calendar/AvailableProvidersModal";

// Hooks
import { useCalendarData } from "../hooks/calendar/useCalendarData";
import { useAppointmentModal } from "../hooks/calendar/useAppointmentModal";
import { useAvailabilityModal } from "../hooks/calendar/useAvailabilityModal";
import { usePatients } from "../hooks/usePatients";
import { useClinicEvents } from "../hooks/useClinicEvents";

const localizer = momentLocalizer(moment);

const CalendarView = memo(function CalendarView({
  onUpdate,
  showBackButton = true,
}) {
  const navigate = useNavigate();

  // State for available providers modal
  const [showProvidersModal, setShowProvidersModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDateProviders, setSelectedDateProviders] = useState([]);
  const [preventSlotSelection, setPreventSlotSelection] = useState(false);

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
    token,
    refetchData,
  } = useCalendarData();

  // Patients hook for patient search in appointment modal
  const { patients } = usePatients(navigate);

  // Clinic events hook for appointment title dropdown
  const { clinicEvents: eventTypes } = useClinicEvents();

  // Custom date header component to show provider icons
  const CustomDateHeader = useCallback(
    ({ date, label }) => {
      // Get availability events for this date from the separate availability events
      const dayAvailability = availabilityEvents.filter((avail) => {
        const eventDate = new Date(avail.start);
        return eventDate.toDateString() === date.toDateString();
      });

      // Get unique providers available on this date with their time slots
      const availableProviders = dayAvailability.reduce((acc, avail) => {
        const data = avail.resource?.data;
        const providerName = data?.doctor_name || "Unknown Provider";

        // Find existing provider or create new one
        let provider = acc.find((p) => p.name === providerName);
        if (!provider) {
          provider = {
            name: providerName,
            timeSlots: [],
          };
          acc.push(provider);
        }

        // Add time slot
        provider.timeSlots.push({
          start_time: data?.start_time || avail.start,
          end_time: data?.end_time || avail.end,
        });

        return acc;
      }, []);

      const handleProviderIconClick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        e.nativeEvent.stopImmediatePropagation();
        setPreventSlotSelection(true);
        // Reset the flag after a short delay to allow normal slot selection later
        setTimeout(() => setPreventSlotSelection(false), 100);
        setSelectedDate(date);
        setSelectedDateProviders(availableProviders);
        setShowProvidersModal(true);
      };

      return (
        <div style={{ position: "relative", height: "100%", padding: "2px" }}>
          {/* Show single doctor icon if there are available providers on this date */}
          {availableProviders.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "2px",
                left: "2px",
                display: "flex",
                gap: "2px",
                zIndex: 1000, // Much higher z-index to ensure it's above everything
                pointerEvents: "auto", // Ensure pointer events work
              }}
              onMouseDown={handleProviderIconClick}
              onTouchStart={handleProviderIconClick}
            >
              <Tooltip
                title={`${availableProviders.length} provider(s) available - Click to see details`}
                arrow
              >
                <Box
                  sx={{
                    width: "12px",
                    height: "12px",
                    backgroundColor: "#28a745",
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "8px",
                    color: "white",
                    fontWeight: "bold",
                    border: "1px solid #fff",
                    cursor: "pointer",
                    pointerEvents: "none", // Disable pointer events on the box itself
                    "&:hover": {
                      backgroundColor: "#218838",
                      transform: "scale(1.1)",
                    },
                  }}
                >
                  <FontAwesomeIcon
                    icon={faUserMd}
                    style={{ fontSize: "7px" }}
                  />
                </Box>
              </Tooltip>
            </div>
          )}
          <span>{label}</span>
        </div>
      );
    },
    [availabilityEvents]
  );



  const appointmentModal = useAppointmentModal(onUpdate || refetchData, token);
  const availabilityModal = useAvailabilityModal(availabilityEvents);

  // Calendar event handlers
  const handleSelectSlot = useCallback(
    ({ start, end }) => {
      if (preventSlotSelection) {
        setPreventSlotSelection(false);
        return;
      }
      appointmentModal.openNewAppointmentModal(start, end);
    },
    [appointmentModal, preventSlotSelection]
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
  const dayPropGetter = useCallback(
    (date) => {
      // Check if this day is in the organization's blocked days
      const isOrganizationBlockedDay =
        environmentSettings?.blocked_days?.includes(date.getDay()) || false;

      // Check if this date is a holiday
      const isHoliday = holidays.some((holiday) => {
        const holidayDate = new Date(holiday.date + "T00:00:00");
        return holidayDate.toDateString() === date.toDateString();
      });

      // Check if this date has a clinic event that blocks the entire day
      const hasBlockingClinicEvent = clinicEvents.some((event) => {
        const eventStart = new Date(event.start_datetime);
        const eventEnd = new Date(event.end_datetime);

        // Check if the clinic event spans the entire day or is marked as a blocking event
        const isAllDay =
          event.all_day ||
          eventEnd.getTime() - eventStart.getTime() >=
          24 * 60 * 60 * 1000 - 60000; // Nearly full day

        return isAllDay && eventStart.toDateString() === date.toDateString();
      });
      // Apply pink background for blocked days (organization blocked days, holidays, or clinic events)
      if (isOrganizationBlockedDay || isHoliday || hasBlockingClinicEvent) {
        return {
          style: {
            backgroundColor: "#fce4ec", // Light pink background for blocked days
          },
        };
      }

      return {};
    },
    [holidays, clinicEvents, environmentSettings]
  );

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
    (value) => {
      setSearchQuery(value);
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

  // Memoize the toolbar component to prevent re-creation on every render
  const toolbarComponent = useCallback(
    (props) => (
      <CustomToolbar
        {...props}
        searchQuery={searchQuery}
        onSearchChange={handleSearchChange}
      />
    ),
    [searchQuery, handleSearchChange]
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

      <Box
        sx={{
          height: "calc(100vh - 200px)",
          mt: showBackButton ? 2 : 0,
          "& .rbc-date-cell": {
            position: "relative",
          },
          "& .rbc-month-view .rbc-date-cell": {
            minHeight: "40px",
          },
        }}
      >
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
            toolbar: toolbarComponent,
            month: {
              dateHeader: CustomDateHeader,
            },
          }}
          eventPropGetter={(event) => {
            let backgroundColor = "#3174ad";
            let borderColor = "#3174ad";

            switch (event.resource?.type) {
              case "appointment":
                backgroundColor = "#3174ad";
                break;
              case "availability":
                // Check if the availability is blocked or available
                if (event.resource?.data?.isBlocked) {
                  backgroundColor = "#dc3545"; // Red for blocked
                  borderColor = "#dc3545";
                } else {
                  backgroundColor = "#28a745"; // Green for available
                  borderColor = "#28a745";
                }
                break;
              case "clinic_event":
                backgroundColor = "#ffc107";
                borderColor = "#ffc107";
                break;
              case "holiday":
                backgroundColor = "#dc3545";
                borderColor = "#dc3545";
                break;
              default:
                backgroundColor = "#3174ad";
                borderColor = "#3174ad";
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
          patients={patients}
          eventTypes={eventTypes}
        />

        {/* Availability Modal */}
        <AvailabilityModal
          open={availabilityModal.showAvailabilityModal}
          onClose={availabilityModal.closeAvailabilityModal}
          selectedDateAvailability={availabilityModal.selectedDateAvailability}
        />

        {/* Available Providers Modal */}
        <AvailableProvidersModal
          open={showProvidersModal}
          onClose={() => setShowProvidersModal(false)}
          selectedDate={selectedDate}
          availableProviders={selectedDateProviders}
        />
      </Box>
    </Box>
  );
});

export default CalendarView;
