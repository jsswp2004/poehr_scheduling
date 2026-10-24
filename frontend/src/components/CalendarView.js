/**
 * Refactored CalendarView component
 *
 * This is a much more maintainable version of the original 1438-line CalendarView.js
 * - Business logic extracted into custom hooks
 * - UI components modularized
 * - Utilities extracted for reusability
 * - Better separation of concerns
 */
import React, { useCallback, memo, useState, useMemo, useRef } from "react";
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

// Components
import BackButton from "./BackButton";
import CustomToolbar from "./calendar/CustomToolbar";
import ProviderFilter, { docName } from "./calendar/ProviderFilter";
import DaySummaryPanel, { StatusBar } from "./calendar/DaySummaryPanel";
import AppointmentModal from "./calendar/AppointmentModal";
import AvailabilityModal from "./calendar/AvailabilityModal";
import BlockedAvailabilityModal from "./calendar/BlockedAvailabilityModal";
import AvailableProvidersModal from "./calendar/AvailableProvidersModal";

// Hooks
import { useCalendarData } from "../hooks/calendar/useCalendarData";
import { useAppointmentModal } from "../hooks/calendar/useAppointmentModal";
import { useAvailabilityModal } from "../hooks/calendar/useAvailabilityModal";
import { useBlockedAvailabilityModal } from "../hooks/calendar/useBlockedAvailabilityModal";
import { useCalendarPatients } from "../hooks/calendar/useCalendarPatients";
import {
  apptProviderId,
  apptState,
  buildProviderColors,
  dayKey,
  groupByDay,
  heatLevel,
  HEAT_COLORS,
  isAppointment,
  summarize,
} from "../utils/calendar/calendarSummary";

const localizer = momentLocalizer(moment);

const CalendarView = memo(function CalendarView({
  onUpdate,
  showBackButton = true,
}) {
  // State for available providers modal
  const [showProvidersModal, setShowProvidersModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedDateProviders, setSelectedDateProviders] = useState([]);
  const [preventSlotSelection, setPreventSlotSelection] = useState(false);
  // Month view: the day picked for the summary panel, and the provider filter ([] = everyone)
  const [selectedDay, setSelectedDay] = useState(() => new Date());
  const [providerFilter, setProviderFilter] = useState([]);

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
    userRole,
    refetchData,
  } = useCalendarData();

  // Patients for the appointment dialog's search: every patient, searched on the server
  // (not the Patients page list, which is filtered by care setting).
  const { patients, searchPatients } = useCalendarPatients(userRole);

  // The appointment title dropdown uses the clinic events the calendar already loaded (the same
  // /clinic-events/ endpoint), rather than fetching them a second time.
  const eventTypes = clinicEvents;

  const isMonth = currentView === "month";
  const colors = useMemo(() => buildProviderColors(doctors, events), [doctors, events]);
  // The provider filter only narrows appointments; leave, holidays and clinic events always show.
  const providerEvents = useMemo(
    () =>
      providerFilter.length === 0
        ? events
        : events.filter((e) => !isAppointment(e) || providerFilter.includes(String(apptProviderId(e.resource.data)))),
    [events, providerFilter]
  );
  const byDay = useMemo(() => groupByDay(providerEvents), [providerEvents]);
  const maxDay = useMemo(() => Math.max(0, ...Object.values(byDay).map((a) => summarize(a).total)), [byDay]);
  // Month cells show a count per day instead of a pile of pills, so appointments are left out of the grid.
  const visibleEvents = useMemo(() => (isMonth ? providerEvents.filter((e) => !isAppointment(e)) : providerEvents), [isMonth, providerEvents]);
  const selectedAppts = byDay[dayKey(selectedDay)] || [];

  // Custom date header component to show provider icons
  const CustomDateHeader = useCallback(
    ({ date, label }) => {
      // Get availability events for this date from the separate availability events
      // ONLY include NON-BLOCKED availability events for the provider icon
      const dayAvailability = availabilityEvents.filter((avail) => {
        const eventDate = new Date(avail.start);
        // Check both possible field names for blocked status
        const isBlocked = avail.resource?.data?.isBlocked || avail.resource?.data?.is_blocked;

        return eventDate.toDateString() === date.toDateString() && !isBlocked;
      });

      // Get unique providers available (not blocked) on this date with their time slots
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

      const stats = summarize(byDay[dayKey(date)]);
      const isToday = dayKey(date) === dayKey(new Date());

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
                right: "2px",
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
                    backgroundColor: "#047857",
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
                      backgroundColor: "#065f46",
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
          <div style={{ textAlign: "left", paddingLeft: 2 }}>
            {isToday ? (
              <span
                data-testid="today-marker"
                style={{ width: 22, height: 22, borderRadius: "50%", background: "#1d4ed8", color: "#fff", fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
              >
                {label}
              </span>
            ) : (
              <span>{label}</span>
            )}
          </div>
          {stats.total > 0 && (
            <div data-testid={`day-count-${dayKey(date)}`} style={{ textAlign: "left", paddingLeft: 2, marginTop: 2 }}>
              <span style={{ fontSize: 22, fontWeight: 600, lineHeight: "26px" }}>{stats.total}</span>
              <span style={{ fontSize: 11, color: "#556070", marginLeft: 5 }}>appts</span>
              <div style={{ marginTop: 4 }}>
                <StatusBar stats={stats} />
              </div>
              {stats.pending > 0 ? (
                <div style={{ marginTop: 4, fontSize: 11, fontWeight: 600, color: "#b45309" }}>{stats.pending} pending</div>
              ) : stats.no_show >= 3 ? (
                <div style={{ marginTop: 4, fontSize: 11, color: "#c0261d" }}>{stats.no_show} no-show</div>
              ) : null}
            </div>
          )}
        </div>
      );
    },
    [availabilityEvents, byDay]
  );



  const appointmentModal = useAppointmentModal(onUpdate || refetchData, token);
  const availabilityModal = useAvailabilityModal(availabilityEvents);
  const blockedAvailabilityModal = useBlockedAvailabilityModal();

  const openDay = (date) => {
    setSelectedDay(date);
    setCurrentDate(date);
    setCurrentView("day");
  };
  const newOnSelectedDay = () => {
    const start = new Date(selectedDay);
    start.setHours(9, 0, 0, 0);
    appointmentModal.openNewAppointmentModal(start, new Date(start.getTime() + 30 * 60 * 1000));
  };
  const openAppointment = (appt) => {
    const event = events.find((e) => e.id === `appt-${appt.id}`);
    if (event) appointmentModal.openEditAppointmentModal(event);
  };

  // Calendar event handlers
  const handleSelectSlot = useCallback(
    ({ start, end, action }) => {
      if (preventSlotSelection) {
        setPreventSlotSelection(false);
        return;
      }
      if (isMonth) {
        // a click picks the day for the summary panel; a double click opens it; a drag does nothing
        if (action === "click") setSelectedDay(start);
        else if (action === "doubleClick") openDay(start);
        return;
      }
      appointmentModal.openNewAppointmentModal(start, end);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appointmentModal, preventSlotSelection, isMonth]
  );

  const handleSelectEvent = useCallback(
    (event) => {
      if (event.resource?.type === "appointment") {
        appointmentModal.openEditAppointmentModal(event);
      } else if (event.resource?.type === "availability") {
        // Check if this is a blocked availability event
        const isBlocked = event.resource?.data?.isBlocked || event.resource?.data?.is_blocked;

        if (isBlocked) {
          // Open blocked availability modal for editing
          blockedAvailabilityModal.openBlockedAvailabilityModal(event);
        } else {
          // Open regular availability modal for viewing providers
          availabilityModal.openAvailabilityModal(new Date(event.start));
        }
      }
    },
    [appointmentModal, availabilityModal, blockedAvailabilityModal]
  );

  // Day prop getter for blocked days styling
  const dayPropGetter = useCallback(
    (date) => {
      // Check if this day is in the organization's blocked days
      // Coerce blocked_days to numbers defensively
      const blockedDays = Array.isArray(environmentSettings?.blocked_days)
        ? environmentSettings.blocked_days.map((d) => Number(d))
        : [];
      const isOrganizationBlockedDay = blockedDays.includes(date.getDay());

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
      const style = {};
      if (isMonth) {
        // busier days get a darker blue; the picked day is outlined
        const total = summarize(byDay[dayKey(date)]).total;
        const level = heatLevel(total, maxDay);
        if (level > 0) style.backgroundColor = HEAT_COLORS[level];
        if (dayKey(date) === dayKey(selectedDay)) style.boxShadow = "inset 0 0 0 2px #1d4ed8";
      }
      // Blocked days (organization blocked days, holidays, or clinic events) are a calm slate
      if (isOrganizationBlockedDay || isHoliday || hasBlockingClinicEvent) style.backgroundColor = "#f1f5f9";

      return Object.keys(style).length ? { style } : {};
    },
    [holidays, clinicEvents, environmentSettings, isMonth, byDay, maxDay, selectedDay]
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

  // The toolbar component keeps one identity (so its dropdown and search box are not remounted
  // on every change) and reads the latest values from this ref.
  const toolbarState = useRef({});
  toolbarState.current = {
    searchQuery,
    onSearchChange: handleSearchChange,
    extra: <ProviderFilter doctors={doctors} colors={colors} selected={providerFilter} onChange={setProviderFilter} />,
  };
  const toolbarComponent = useCallback((props) => <CustomToolbar {...props} {...toolbarState.current} />, []);

  const eventPropGetter = useCallback(
    (event) => {
      const type = event.resource?.type;
      if (type === "appointment") {
        const a = event.resource.data;
        const color = colors[String(apptProviderId(a))] || "#2563eb";
        const state = apptState(a);
        const style = { backgroundColor: `${color}22`, color: "#1f2937", border: "none", borderLeft: `3px solid ${color}` };
        if (state === "no_show") Object.assign(style, { backgroundColor: "#fef2f2", color: "#991b1b", borderLeft: "3px solid #ef4444", textDecoration: "line-through" });
        if (state === "pending") Object.assign(style, { backgroundColor: "#fffbeb", color: "#92400e", border: "1px dashed #f59e0b", borderLeft: "3px solid #f59e0b" });
        if (state === "cancelled") Object.assign(style, { opacity: 0.55, textDecoration: "line-through" });
        return { style };
      }
      if (type === "availability") {
        const blocked = event.resource?.data?.isBlocked || event.resource?.data?.is_blocked;
        if (blocked) {
          // leave: a quiet hatched bar, not an alert
          return { style: { backgroundColor: "#eef1f6", backgroundImage: "repeating-linear-gradient(135deg,#eef1f6 0 5px,#e4e7ec 5px 10px)", color: "#475569", border: "none" } };
        }
        return { style: { backgroundColor: "#047857", borderColor: "#047857", color: "white" } };
      }
      if (type === "clinic_event") return { style: { backgroundColor: "#fef3c7", color: "#92400e", border: "none" } };
      if (type === "holiday") return { style: { backgroundColor: "#eef0f3", color: "#475569", border: "none" } };
      return { style: { backgroundColor: "#2563eb", borderColor: "#2563eb", color: "white" } };
    },
    [colors]
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

  // On the Appointments page the calendar fills the space under the pinned tabs; as a stand-alone
  // page (with a Back button) it keeps its own height.
  const fill = !showBackButton;
  const legendProviders = Object.keys(colors).map((id) => ({ id, color: colors[id], doctor: doctors.find((d) => String(d.id) === id) })).filter((p) => p.doctor);

  return (
    <Box sx={fill ? { height: "100%", minHeight: 520, display: "flex", flexDirection: "column" } : undefined}>
      {showBackButton && <BackButton />}

      <Box
        sx={{
          height: fill ? "auto" : "calc(100vh - 200px)",
          flex: fill ? 1 : "none",
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          mt: showBackButton ? 2 : 0,
          p: 1.5,
          pb: 1,
          border: "1px solid #e2e8f0",
          borderRadius: "12px",
          bgcolor: "background.paper",
          "& .rbc-calendar": { fontFamily: "inherit", color: "#0f172a" },
          "& .rbc-date-cell": {
            position: "relative",
            fontSize: 13,
            textAlign: "left",
          },
          "& .rbc-month-view .rbc-date-cell": {
            minHeight: "40px",
          },
          // Suite palette: slate borders, soft header, tinted today.
          "& .rbc-month-view, & .rbc-time-view, & .rbc-agenda-view table.rbc-agenda-table": {
            borderColor: "#e2e8f0",
            borderRadius: "12px",
            overflow: "hidden",
          },
          "& .rbc-header": {
            backgroundColor: "#f8fafc",
            color: "#475569",
            fontWeight: 600,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.04em",
            py: 1,
            borderColor: "#e2e8f0",
          },
          "& .rbc-header + .rbc-header, & .rbc-day-bg + .rbc-day-bg, & .rbc-month-row + .rbc-month-row, & .rbc-time-content > * + * > *, & .rbc-timeslot-group, & .rbc-time-header.rbc-overflowing, & .rbc-time-header-content, & .rbc-time-content, & .rbc-agenda-view table.rbc-agenda-table tbody > tr > td + td, & .rbc-agenda-view table.rbc-agenda-table tbody > tr + tr": {
            borderColor: "#e2e8f0",
          },
          "& .rbc-today": { backgroundColor: "#eff6ff" },
          "& .rbc-off-range-bg": { backgroundColor: "#f8fafc" },
          "& .rbc-off-range": { color: "#64748b" },
          "& .rbc-date-cell.rbc-now": { fontWeight: 700, color: "#1d4ed8" },
          "& .rbc-label": { color: "#475569", fontSize: 12 },
          "& .rbc-event": { borderRadius: "6px", fontWeight: 600 },
          "& .rbc-show-more": { color: "#1d4ed8", fontWeight: 600 },
          "& .rbc-current-time-indicator": { backgroundColor: "#2563eb" },
        }}
      >
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", gap: 1.5 }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Calendar
              style={{ height: "100%" }}
              localizer={localizer}
              events={visibleEvents}
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
              messages={{
                work_week: "Work Week",
                month: "Month",
                week: "Week",
                day: "Day",
                agenda: "Agenda",
                today: "Today",
                previous: "Previous",
                next: "Next",
              }}
              dayPropGetter={dayPropGetter}
              components={{
                toolbar: toolbarComponent,
                month: {
                  dateHeader: CustomDateHeader,
                },
              }}
              eventPropGetter={eventPropGetter}
            />
          </Box>
          {isMonth && (
            <DaySummaryPanel
              date={selectedDay}
              appts={selectedAppts}
              colors={colors}
              onOpenDay={() => openDay(selectedDay)}
              onNew={newOnSelectedDay}
              onOpenAppointment={openAppointment}
            />
          )}
        </Box>

        {/* Legend: status styles and provider colours */}
        <Box data-testid="calendar-legend" sx={{ flexShrink: 0, display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", pt: 1, fontSize: 12, color: "#475569" }}>
          {[["#16a34a", "Arrived"], ["#93b4f5", "Scheduled"], ["#f59e0b", "Pending"], ["#ef4444", "No show"]].map(([c, t]) => (
            <Box key={t} component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
              <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: c }} />
              {t}
            </Box>
          ))}
          {legendProviders.length > 0 && <Box component="span" sx={{ borderLeft: "1px solid #e2e8f0", height: 14 }} />}
          {legendProviders.map((p) => (
            <Box key={p.id} component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.75 }}>
              <Box component="span" sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: p.color }} />
              {docName(p.doctor)}
            </Box>
          ))}
        </Box>

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
          onPatientSearch={searchPatients}
          eventTypes={eventTypes}
        />

        {/* Availability Modal */}
        <AvailabilityModal
          open={availabilityModal.showAvailabilityModal}
          onClose={availabilityModal.closeAvailabilityModal}
          selectedDateAvailability={availabilityModal.selectedDateAvailability}
        />

        {/* Blocked Availability Modal */}
        <BlockedAvailabilityModal
          open={blockedAvailabilityModal.showBlockedAvailabilityModal}
          onClose={blockedAvailabilityModal.closeBlockedAvailabilityModal}
          selectedEvent={blockedAvailabilityModal.selectedBlockedEvent}
          onUpdate={refetchData}
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
