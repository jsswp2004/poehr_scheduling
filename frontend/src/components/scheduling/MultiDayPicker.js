import { Box, Button, Checkbox, MenuItem, TextField, Typography } from "@mui/material";

// "Multiple days" mode of Schedule Maintenance: pick days week by week, one set of hours, optional recurrence.

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const pad = (n) => String(n).padStart(2, "0");

export const dateKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const mondayOf = (d) => {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
};
const short = (d, o) => d.toLocaleDateString("en-US", o || { weekday: "short", month: "numeric", day: "numeric" });
const time12 = (v) => {
  const [h, m] = v.split(":").map(Number);
  return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
};

export function defaultMultiState() {
  return {
    startTime: "08:00",
    endTime: "17:00",
    fromDate: dateKey(mondayOf(new Date())),
    weeks: 6,
    picked: {}, // { "2026-11-02": true }
    recurrence: "none",
    recurrenceEnd: "",
  };
}

/**
 * Every date the save will create. A ticked day stands for itself; with a recurrence it also stands for the
 * dates after it, up to the end date. Weekends, holidays, past days and days already booked are dropped.
 * isOff(key) returns a reason string for a day that cannot be used, or "".
 */
export function expandDates(state, isOff) {
  const out = new Set();
  const rec = state.recurrence;
  const end = state.recurrenceEnd ? parseKey(state.recurrenceEnd) : null;
  Object.keys(state.picked)
    .filter((k) => state.picked[k])
    .sort()
    .forEach((key) => {
      if (rec === "none" || !end) {
        if (!isOff(key)) out.add(key);
        return;
      }
      const d = parseKey(key);
      let guard = 0;
      while (d <= end && guard++ < 400) {
        const k = dateKey(d);
        if (!isOff(k)) out.add(k);
        if (rec === "daily") d.setDate(d.getDate() + 1);
        else if (rec === "weekly") d.setDate(d.getDate() + 7);
        else d.setMonth(d.getMonth() + 1);
      }
    });
  return [...out].sort();
}

export function MultiDayPicker({ state, onChange, isOff, isBlocked, blockType }) {
  const set = (patch) => onChange({ ...state, ...patch });
  const start = mondayOf(parseKey(state.fromDate));
  const weeks = Array.from({ length: state.weeks }, (_, w) =>
    DAY_NAMES.map((_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + w * 7 + i);
      return d;
    })
  );
  const usable = (d) => !isOff(dateKey(d));
  const setKeys = (dates, on) => {
    const picked = { ...state.picked };
    dates.filter(usable).forEach((d) => {
      if (on) picked[dateKey(d)] = true;
      else delete picked[dateKey(d)];
    });
    set({ picked });
  };
  const allOn = (dates) => {
    const u = dates.filter(usable);
    return u.length > 0 && u.every((d) => state.picked[dateKey(d)]);
  };
  const someOn = (dates) => dates.some((d) => usable(d) && state.picked[dateKey(d)]);
  const quick = (days) => {
    const picked = {};
    weeks.flat().forEach((d, idx) => {
      if (days.includes(idx % 5) && usable(d)) picked[dateKey(d)] = true;
    });
    set({ picked });
  };

  const dates = expandDates(state, isOff);
  const n = Object.values(state.picked).filter(Boolean).length;
  const what = isBlocked ? `${(blockType || "block").toLowerCase()} block` : "availability schedule";
  const needEnd = state.recurrence !== "none" && !state.recurrenceEnd;
  const hint = {
    daily: "Every weekday from the earliest ticked day to the end date. Weekends, holidays and booked days are skipped.",
    weekly: "Each ticked day repeats on its weekday until the end date.",
    monthly: "Each ticked day repeats on the same date each month until the end date.",
  }[state.recurrence];

  return (
    <Box sx={{ display: "grid", gap: 1.5 }} data-testid="multi-day-picker">
      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <TextField size="small" type="time" label="Start time" value={state.startTime} onChange={(e) => set({ startTime: e.target.value })} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="time" label="End time" value={state.endTime} onChange={(e) => set({ endTime: e.target.value })} InputLabelProps={{ shrink: true }} />
        <TextField size="small" type="date" label="Starting week of" value={state.fromDate} onChange={(e) => e.target.value && set({ fromDate: dateKey(mondayOf(parseKey(e.target.value))) })} InputLabelProps={{ shrink: true }} />
        <TextField size="small" select label="Weeks to show" value={state.weeks} onChange={(e) => set({ weeks: Number(e.target.value) })}>
          {[2, 4, 6, 8, 12].map((w) => (
            <MenuItem key={w} value={w}>{w}</MenuItem>
          ))}
        </TextField>
      </Box>

      <Box>
        <Typography variant="caption" color="text.secondary">Pick the days</Typography>
        <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", my: 0.5 }}>
          <Button size="small" variant="outlined" onClick={() => quick([0, 1, 2, 3, 4])}>Every weekday</Button>
          <Button size="small" variant="outlined" onClick={() => quick([0, 2, 4])}>Mon, Wed, Fri</Button>
          <Button size="small" variant="outlined" onClick={() => quick([1, 3])}>Tue, Thu</Button>
          <Button size="small" variant="outlined" onClick={() => set({ picked: {} })}>Clear</Button>
        </Box>
        <Box sx={{ border: "1px solid #dfe4ec", borderRadius: 1, overflow: "hidden" }} role="group" aria-label="Days to schedule">
          <Box sx={{ display: "grid", gridTemplateColumns: "84px repeat(5, minmax(0, 1fr))", bgcolor: "#f3f5f9", fontSize: 12, fontWeight: 600, alignItems: "center" }}>
            <span />
            {DAY_NAMES.map((name, i) => {
              const col = weeks.map((wk) => wk[i]);
              return (
                <Box key={name} sx={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <Checkbox size="small" sx={{ p: 0.25 }} checked={allOn(col)} indeterminate={!allOn(col) && someOn(col)} onChange={(e) => setKeys(col, e.target.checked)} inputProps={{ "aria-label": `Every ${name}` }} />
                  {name}
                </Box>
              );
            })}
          </Box>
          {weeks.map((wk) => (
            <Box key={dateKey(wk[0])} sx={{ display: "grid", gridTemplateColumns: "84px repeat(5, minmax(0, 1fr))", borderTop: "1px solid #dfe4ec", alignItems: "center" }}>
              <Box sx={{ display: "flex", alignItems: "center", fontSize: 11.5, color: "text.secondary" }}>
                <Checkbox size="small" sx={{ p: 0.25 }} checked={allOn(wk)} indeterminate={!allOn(wk) && someOn(wk)} onChange={(e) => setKeys(wk, e.target.checked)} inputProps={{ "aria-label": `Whole week of ${short(wk[0])}` }} />
                {short(wk[0], { month: "short", day: "numeric" })}
              </Box>
              {wk.map((d) => {
                const key = dateKey(d);
                const why = isOff(key);
                return (
                  <Box key={key} title={why ? `${short(d)}: ${why}` : short(d)} sx={{ display: "flex", flexDirection: "column", alignItems: "center", py: 0.25, opacity: why ? 0.55 : 1 }}>
                    <Checkbox size="small" sx={{ p: 0.25 }} disabled={!!why} checked={!!state.picked[key]} onChange={(e) => setKeys([d], e.target.checked)} inputProps={{ "aria-label": short(d) }} />
                    <Typography variant="caption" sx={{ lineHeight: 1 }}>{d.getDate()}</Typography>
                    {why && <Typography sx={{ fontSize: 9.5, lineHeight: 1.1, color: "text.secondary" }}>{why}</Typography>}
                  </Box>
                );
              })}
            </Box>
          ))}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
          Tick a week's date to pick its whole week, or a weekday name to pick it in every week. Greyed days are in the past, holidays, or already scheduled.
        </Typography>
      </Box>

      <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
        <TextField size="small" select label="Recurrence" value={state.recurrence} onChange={(e) => set({ recurrence: e.target.value })}>
          <MenuItem value="none">None</MenuItem>
          <MenuItem value="daily">Daily</MenuItem>
          <MenuItem value="weekly">Weekly</MenuItem>
          <MenuItem value="monthly">Monthly</MenuItem>
        </TextField>
        <TextField size="small" type="date" label="Recurrence end date" value={state.recurrenceEnd} disabled={state.recurrence === "none"} error={needEnd} onChange={(e) => set({ recurrenceEnd: e.target.value })} InputLabelProps={{ shrink: true }} />
      </Box>
      {hint && <Typography variant="caption" color="text.secondary">{hint}</Typography>}

      <Box sx={{ bgcolor: "#e6f0fb", borderRadius: 1, px: 1.5, py: 1, fontSize: 13 }} data-testid="multi-day-summary">
        {needEnd ? (
          <b>Choose a recurrence end date.</b>
        ) : n === 0 ? (
          <b>No days selected.</b>
        ) : (
          <>
            <b>
              {n} day{n > 1 ? "s" : ""} selected
              {state.recurrence !== "none" && `, repeating ${state.recurrence} until ${short(parseKey(state.recurrenceEnd), { month: "numeric", day: "numeric", year: "numeric" })}`}.
            </b>{" "}
            Adds {dates.length} {what}{dates.length > 1 ? "s" : ""}, {time12(state.startTime)} to {time12(state.endTime)} each.
          </>
        )}
      </Box>
    </Box>
  );
}
