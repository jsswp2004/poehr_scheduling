import { useState, useEffect, useCallback, useMemo } from "react";
import { Calendar, momentLocalizer } from "react-big-calendar";
import moment from "moment";
import "react-big-calendar/lib/css/react-big-calendar.css";
import { Box, Typography, CircularProgress, Chip, Stack } from "@mui/material";
import axios from "axios";
import { apiEndpoints, getAuthHeaders } from "../config/api";

const localizer = momentLocalizer(moment);

const SHIFT_COLORS = {
  day: "#1976d2",
  evening: "#f57c00",
  night: "#5e35b1",
  custom: "#546e7a",
};

function StaffingCalendarTab() {
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range, setRange] = useState(() => {
    const start = moment().startOf("month").subtract(7, "days");
    const end = moment().endOf("month").add(7, "days");
    return { start, end };
  });

  const token = localStorage.getItem("access_token");

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
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
        {Object.entries(SHIFT_COLORS).map(([type, color]) => (
          <Chip
            key={type}
            label={type}
            size="small"
            sx={{ bgcolor: color, color: "white", textTransform: "capitalize" }}
          />
        ))}
      </Stack>
      {error && (
        <Typography color="error" sx={{ mb: 2 }}>
          {error}
        </Typography>
      )}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress />
        </Box>
      ) : (
        <Box sx={{ height: 650, bgcolor: "background.paper", p: 1, borderRadius: 2 }}>
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            style={{ height: "100%" }}
            onRangeChange={handleRangeChange}
            eventPropGetter={eventPropGetter}
            popup
          />
        </Box>
      )}
    </Box>
  );
}

export default StaffingCalendarTab;
