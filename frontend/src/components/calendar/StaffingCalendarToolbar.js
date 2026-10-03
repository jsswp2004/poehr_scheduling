/**
 * Toolbar for the Staffing Center calendar.
 *
 * Looks like react-big-calendar's default toolbar (Today / Back / Next, the
 * period label, then the view buttons) but the label is clickable: it opens a
 * date picker, and picking a day jumps the calendar to it in whichever view
 * (Month / Week / Day / Agenda) is showing.
 *
 * Jumping goes through onNavigate("DATE", date), the same path Back / Next /
 * Today use, so the parent's onRangeChange still fires and the shifts and
 * coverage colors for the new period load.
 */
import { memo, useRef, useState } from "react";
import { Popover } from "@mui/material";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

const StaffingCalendarToolbar = memo(function StaffingCalendarToolbar({
  date,
  label,
  onNavigate,
  onView,
  view,
  views,
  localizer,
}) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);
  const msg = (key, fallback) => localizer?.messages?.[key] || fallback;
  const viewNames = Array.isArray(views) ? views : Object.keys(views || {});

  return (
    <div className="rbc-toolbar">
      <span className="rbc-btn-group">
        <button type="button" onClick={() => onNavigate("TODAY")}>
          {msg("today", "Today")}
        </button>
        <button type="button" onClick={() => onNavigate("PREV")}>
          {msg("previous", "Back")}
        </button>
        <button type="button" onClick={() => onNavigate("NEXT")}>
          {msg("next", "Next")}
        </button>
      </span>

      <span className="rbc-toolbar-label">
        <button
          type="button"
          ref={anchorRef}
          onClick={() => setOpen(true)}
          aria-label={`${label}. Pick a date`}
          aria-haspopup="dialog"
          title="Pick a date"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            fontWeight: 600,
            border: "none",
            background: "transparent",
            boxShadow: "none",
            padding: "2px 6px",
          }}
        >
          <CalendarMonthIcon fontSize="small" color="primary" />
          {label}
        </button>
        <Popover
          open={open}
          anchorEl={anchorRef.current}
          onClose={() => setOpen(false)}
          anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
          transformOrigin={{ vertical: "top", horizontal: "center" }}
        >
          <DatePicker
            inline
            selected={date}
            onChange={(picked) => {
              if (picked) onNavigate("DATE", picked);
              setOpen(false);
            }}
          />
        </Popover>
      </span>

      <span className="rbc-btn-group">
        {viewNames.map((name) => (
          <button
            key={name}
            type="button"
            className={view === name ? "rbc-active" : ""}
            onClick={() => onView(name)}
          >
            {msg(name, name.charAt(0).toUpperCase() + name.slice(1))}
          </button>
        ))}
      </span>
    </div>
  );
});

export default StaffingCalendarToolbar;
