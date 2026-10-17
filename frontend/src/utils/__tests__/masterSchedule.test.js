import { gridDays, WEEK_START_COLOR, WEEKEND_COLORS, DAY_LETTERS } from "../masterSchedule";

const THURSDAY = 3;

describe("master schedule grid", () => {
  test("October 2026 with a Thursday week start begins on Thu Oct 1 and ends Wed Nov 4", () => {
    const days = gridDays(2026, 9, THURSDAY);
    expect(days[0].iso).toBe("2026-10-01");
    expect(DAY_LETTERS[days[0].dow]).toBe("TH");
    expect(days[days.length - 1].iso).toBe("2026-11-04");
    expect(days.length % 7).toBe(0);
  });

  test("starts on the Thursday before the 1st when the month starts mid-week", () => {
    const days = gridDays(2026, 10, THURSDAY); // Nov 1 2026 is a Sunday
    expect(days[0].iso).toBe("2026-10-29");
    expect(days[0].inMonth).toBe(false);
    expect(days.find((d) => d.iso === "2026-11-01").inMonth).toBe(true);
    expect(days[days.length - 1].dow).toBe(2); // Wednesday
  });

  test("columns follow the chosen week start", () => {
    const days = gridDays(2026, 9, 0); // Monday
    expect(days[0].dow).toBe(0);
    expect(days[days.length - 1].dow).toBe(6);
    expect(days.length % 7).toBe(0);
  });

  test("week-start day is orange and weekends alternate tan / green", () => {
    const days = gridDays(2026, 9, THURSDAY);
    days.filter((d) => d.dow === 3).forEach((d) => expect(d.color).toBe(WEEK_START_COLOR));
    const satByWeek = days.filter((d) => d.dow === 5).map((d) => d.color);
    expect(satByWeek[0]).not.toBe(satByWeek[1]);
    expect(WEEKEND_COLORS).toContain(satByWeek[0]);
    const sundays = days.filter((d) => d.dow === 6).map((d) => d.color);
    expect(sundays).toEqual(satByWeek); // Sat and Sun of one week match
    days.filter((d) => d.dow === 1).forEach((d) => expect(d.color).toBe(""));
  });

  test("the same date has the same colour in adjacent months", () => {
    const a = gridDays(2026, 9, THURSDAY).find((d) => d.iso === "2026-10-31");
    const b = gridDays(2026, 10, THURSDAY).find((d) => d.iso === "2026-10-31");
    expect(a.color).toBe(b.color);
  });
});
