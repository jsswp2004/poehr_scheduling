import {
  apptProviderId,
  apptProviderName,
  apptState,
  buildProviderColors,
  dayKey,
  groupByDay,
  heatLevel,
  summarize,
  PROVIDER_COLORS,
} from "../calendarSummary";

const ev = (id, iso, data) => ({ id: `appt-${id}`, start: new Date(iso), resource: { type: "appointment", data: { id, ...data } } });

test("dayKey uses local time", () => {
  expect(dayKey(new Date(2026, 9, 22, 23, 30))).toBe("2026-10-22");
});

test("provider id and name from an id or a nested object", () => {
  expect(apptProviderId({ provider: 7 })).toBe(7);
  expect(apptProviderId({ provider: { id: 9 } })).toBe(9);
  expect(apptProviderId({})).toBeNull();
  expect(apptProviderName({ provider_name: "Dr. Lee" })).toBe("Dr. Lee");
  expect(apptProviderName({ provider: { first_name: "Ana", last_name: "Kapoor" } })).toBe("Dr. Ana Kapoor");
  expect(apptProviderName({})).toBe("Unassigned");
});

test("apptState reads the flags and the status", () => {
  expect(apptState({ status: "scheduled" })).toBe("scheduled");
  expect(apptState({ status: "scheduled", arrived: true })).toBe("arrived");
  expect(apptState({ status: "completed" })).toBe("arrived");
  expect(apptState({ no_show: true })).toBe("no_show");
  expect(apptState({ status: "pending" })).toBe("pending");
  expect(apptState({ status: "cancelled" })).toBe("cancelled");
  expect(apptState({})).toBe("scheduled");
});

test("summarize counts states and leaves cancelled visits out of the total", () => {
  const s = summarize([
    { provider: 1, provider_name: "Dr. A", arrived: true },
    { provider: 1, provider_name: "Dr. A" },
    { provider: 2, provider_name: "Dr. B", status: "pending" },
    { provider: 2, provider_name: "Dr. B", no_show: true },
    { provider: 2, provider_name: "Dr. B", status: "cancelled" },
  ]);
  expect(s).toMatchObject({ total: 4, arrived: 1, scheduled: 1, pending: 1, no_show: 1, cancelled: 1 });
  expect(s.byProvider.map((p) => [p.name, p.count])).toEqual([["Dr. A", 2], ["Dr. B", 2]]);
});

test("groupByDay buckets appointments and ignores other events", () => {
  const events = [
    ev(1, "2026-10-22T09:00:00", {}),
    ev(2, "2026-10-22T15:00:00", {}),
    ev(3, "2026-10-23T09:00:00", {}),
    { id: "holiday-1", start: new Date("2026-10-22T00:00:00"), resource: { type: "holiday", data: {} } },
  ];
  const g = groupByDay(events);
  expect(g["2026-10-22"]).toHaveLength(2);
  expect(g["2026-10-23"]).toHaveLength(1);
});

test("provider colours are stable by id order", () => {
  const colors = buildProviderColors([{ id: 5 }, { id: 2 }], [ev(1, "2026-10-22T09:00:00", { provider: 9 })]);
  expect(colors["2"]).toBe(PROVIDER_COLORS[0]);
  expect(colors["5"]).toBe(PROVIDER_COLORS[1]);
  expect(colors["9"]).toBe(PROVIDER_COLORS[2]);
});

test("heatLevel is relative to the busiest day", () => {
  expect(heatLevel(0, 40)).toBe(0);
  expect(heatLevel(10, 40)).toBe(1);
  expect(heatLevel(26, 40)).toBe(2);
  expect(heatLevel(40, 40)).toBe(3);
});
