import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Box, Typography, CircularProgress, Chip, Stack } from "@mui/material";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";
import { getAccessToken } from "../utils/tokenManager";

const localizer = momentLocalizer(moment);

const SHIFT_COLORS = {
  day: "#1976d2",
  evening: "#f57c00",
  night: "#5e35b1",
  custom: "#546e7a",
};

function StaffingCalendarTab({ isAdmin = false }) {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState(() => {
    const start = moment().startOf("month").subtract(7, "days");
    const end = moment().endOf("month").add(7, "days");
    return { start, end };
  });

  const token = getAccessToken();

  const fetchShifts = useCallback(
    async (start, end) => {
      setLoading(true);
      setError("");
      try {
        const res = await axios.get(apiEndpoints.staffingShifts, {
          headers: getAuthHeaders(token),
          params: {
            start: start.format("YYYY-MM-DD"),
            end: end.format("YYYY-MM-DD"),
          },
        });
        setShifts(res.data.results || res.data || []);
      } catch (err) {
        console.error("Failed to load staffing shifts", err);
        setError("Failed to load the staffing calendar.");
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    fetchShifts(range.start, range.end);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectEvent = async (event) => {
    if (!isAdmin) return;
    const shift = event.resource;
    const label = `${shift.staff_name} - ${shift.date} (${shift.shift_type_display || shift.shift_type})`;
    if (!window.confirm(`Remove this shift from the calendar?\n\n${label}`)) {
      return;
    }
    try {
      await axios.delete(apiEndpoints.staffingShiftDetail(shift.id), {
        headers: getAuthHeaders(token),
      });
      fetchShifts(range.start, range.end);
    } catch (err) {
      console.error("Failed to delete shift", err);
      setError("Failed to delete that shift.");
    }
  };

  const handleRangeChange = (rangeInfo) => {
    let start, end;
    if (Array.isArray(rangeInfo)) {
      start = moment(rangeInfo[0]);
      end = moment(rangeInfo[rangeInfo.length - 1]);
    } else {
      start = moment(rangeInfo.start);
      end = moment(rangeInfo.end);
    }
    setRange({ start, end });
    fetchShifts(start, end);
  };

  const events = useMemo(
    () =>
      shifts.map((shift) => ({
        id: shift.id,
        title: `${shift.staff_name} (${shift.shift_type_display || shift.shift_type})`,
        start: new Date(`${shift.date}T${shift.start_time || "00:00:00"}`),
        end: new Date(`${shift.date}T${shift.end_time || "23:59:59"}`),
        allDay: !shift.start_time,
        resource: shift,
      })),
    [shifts]
  );

  const eventPropGetter = (event) => {
    const color = SHIFT_COLORS[event.resource.shift_type] || "#546e7a";
    return {
      style: {
        backgroundColor: color,
        borderRadius: "4px",
        color: "white",
        border: "none",
      },
    };
  };

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }} alignItems="center">
        {Object.entries(SHIFT_COLORS).map(([type, color]) => (
          <Chip
            key={type}
            label={type}
            size="small"
            sx={{ bgcolor: color, color: "white", textTransform: "capitalize" }}
          />
        ))}
        {loading && <CircularProgress size={18} sx={{ ml: 1 }} />}
      </Stack>
      {isAdmin && (
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
          Click a shift on the calendar to remove it.
        </Typography>
      )}
      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}
      {/*
        IMPORTANT: the Calendar must stay mounted at all times. react-big-calendar
        tracks its own current month/view internally (it's an uncontrolled
        component here); conditionally swapping it out for a loading spinner
        while a fetch is in flight would unmount and remount it on every
        navigation click, silently resetting it back to today's month every
        time -- which is exactly the "won't advance to October" bug this
        comment is guarding against. Loading state is shown as a small inline
        spinner next to the legend instead (above), never by hiding the grid.
      */}
      <Box sx={{ height: 650, bgcolor: "background.paper", p: 1, borderRadius: 2 }}>
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          style={{ height: "100%", cursor: isAdmin ? "pointer" : "default" }}
          onRangeChange={handleRangeChange}
          onSelectEvent={handleSelectEvent}
          eventPropGetter={eventPropGetter}
          popup
        />
      </Box>
    </Box>
  );
}

export default StaffingCalendarTab;
