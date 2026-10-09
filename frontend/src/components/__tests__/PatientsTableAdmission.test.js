import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";

jest.mock("../patients/SearchField", () => () => null, { virtual: true });
jest.mock("@fortawesome/react-fontawesome", () => ({ FontAwesomeIcon: () => null }), { virtual: true });
jest.mock("@fortawesome/free-solid-svg-icons", () => ({ faEnvelope: {}, faSms: {} }), { virtual: true });

import PatientsTable from "../patients/PatientsTable";

const rows = [
  {
    id: 1, user_id: 10, full_name: "Bob Ray", email: "b@x.com", phone_number: "1", provider_name: "Dr. A",
    current_visit: { id: 90, care_setting: "acute", location: "General Hospital › 3 West › 312 › A", unit_name: "3 West", room_name: "312", bed_name: "A", arrival_time: "2026-10-05T10:00:00Z", attending_provider_name: "Dr. Jeffrey Lee" },
  },
];

const Where = () => <div data-testid="where">{useLocation().pathname}</div>;

const show = (props) =>
  render(
    <MemoryRouter>
      <Where />
      <PatientsTable
        patients={rows} loading={false} search="" setSearch={() => {}} provider="" setProvider={() => {}} providers={[]}
        page={1} setPage={() => {}} totalPages={1} onSendText={() => {}} onOpenEmailModal={() => {}} onDelete={() => {}}
        userRole="nurse" onAdmit={jest.fn()} onTransfer={jest.fn()} onDischarge={jest.fn()} {...props}
      />
    </MemoryRouter>
  );

test("Acute Care shows location and attending with Transfer and Discharge, not Admit", () => {
  const onTransfer = jest.fn();
  const onDischarge = jest.fn();
  show({ careSetting: "acute", onTransfer, onDischarge });
  expect(screen.getByTestId("patient-location-10")).toHaveTextContent(/^312 › A$/);
  expect(screen.getByTestId("patient-unit-10")).toHaveTextContent(/^3 West$/);
  expect(screen.getByText("Dr. Jeffrey Lee")).toBeInTheDocument();
  expect(screen.queryByText("b@x.com")).toBeNull();
  expect(screen.queryByRole("button", { name: "Admit Bob Ray" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Transfer Bob Ray" }));
  fireEvent.click(screen.getByRole("button", { name: "Discharge Bob Ray" }));
  expect(onTransfer).toHaveBeenCalledWith(rows[0]);
  expect(onDischarge).toHaveBeenCalledWith(rows[0]);
});

test("the other lists keep their columns and offer Admit", () => {
  const onAdmit = jest.fn();
  show({ careSetting: "ambulatory", onAdmit });
  expect(screen.getByText("b@x.com")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Transfer Bob Ray" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Admit Bob Ray" }));
  expect(onAdmit).toHaveBeenCalledWith(rows[0]);
});

test("roles that cannot admit see no admission buttons", () => {
  show({ careSetting: "ambulatory", userRole: "receptionist" });
  expect(screen.queryByRole("button", { name: "Admit Bob Ray" })).toBeNull();
});

test("an empty Acute list explains how to admit", () => {
  show({ careSetting: "acute", patients: [] });
  expect(screen.getByText(/No inpatients right now/)).toBeInTheDocument();
});

test("Emergency list offers Transfer, Admit and Discharge", () => {
  const onAdmit = jest.fn();
  const onTransfer = jest.fn();
  const onDischarge = jest.fn();
  show({ careSetting: "emergency", onAdmit, onTransfer, onDischarge });
  fireEvent.click(screen.getByRole("button", { name: "Transfer Bob Ray" }));
  fireEvent.click(screen.getByRole("button", { name: "Admit Bob Ray" }));
  fireEvent.click(screen.getByRole("button", { name: "Discharge Bob Ray" }));
  expect(onTransfer).toHaveBeenCalledWith(rows[0]);
  expect(onAdmit).toHaveBeenCalledWith(rows[0]);
  expect(onDischarge).toHaveBeenCalledWith(rows[0]);
});

test("the Location column shows only the room and the bed", () => {
  const visit = (v) => [{ ...rows[0], current_visit: { ...rows[0].current_visit, ...v } }];
  const cases = [
    [{ unit_name: "3 West", room_name: "312", bed_name: "A" }, "312 › A"],
    [{ unit_name: "3 West", room_name: "312", bed_name: "" }, "312"],
    [{ unit_name: "3 West", room_name: "", bed_name: "B" }, "B"],
    [{ unit_name: "3 West", room_name: "", bed_name: "", location: "General Hospital › 3 West" }, "No bed assigned"],
  ];
  cases.forEach(([v, text]) => {
    const { unmount } = show({ careSetting: "acute", patients: visit(v) });
    expect(screen.getByTestId("patient-location-10")).toHaveTextContent(new RegExp(`^${text}$`));
    expect(screen.getByTestId("patient-location-10")).not.toHaveTextContent("General Hospital");
    unmount();
  });
});

test("Acute Care has a Unit column before Name, the other lists do not", () => {
  show({ careSetting: "acute" });
  const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
  expect(headers.slice(0, 3)).toEqual(["Unit", "Name", "Location"]);
  expect(screen.getByTestId("patient-unit-10")).toHaveTextContent("3 West");
  expect(screen.getAllByRole("row")[1].querySelectorAll("td")[0]).toHaveTextContent("3 West");
});

test("other lists have no Unit column", () => {
  show({ careSetting: "ambulatory" });
  expect(screen.queryByTestId("unit-filter")).toBeNull();
  expect(screen.queryByTestId("patient-unit-10")).toBeNull();
  expect(screen.getAllByRole("columnheader")[0]).toHaveTextContent("Name");
});

test("the Unit header filters: it lists every unit, and picking one calls setUnit", () => {
  const setUnit = jest.fn();
  const units = [{ id: 7, name: "3 West" }, { id: 8, name: "4 East" }];
  show({ careSetting: "acute", units, setUnit, unit: "" });
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /Filter by unit/i }));
  const options = screen.getAllByRole("option").map((o) => o.textContent);
  expect(options).toEqual(["All units", "3 West", "4 East"]);
  fireEvent.click(screen.getByRole("option", { name: "4 East" }));
  expect(setUnit).toHaveBeenCalledWith("8");
});

test("an active unit filter shows in the header, and All units clears it", () => {
  const setUnit = jest.fn();
  const units = [{ id: 7, name: "3 West" }];
  show({ careSetting: "acute", units, setUnit, unit: "7" });
  expect(screen.getByRole("combobox", { name: /Filter by unit/i })).toHaveTextContent("Unit: 3 West");
  fireEvent.mouseDown(screen.getByRole("combobox", { name: /Filter by unit/i }));
  fireEvent.click(screen.getByRole("option", { name: "All units" }));
  expect(setUnit).toHaveBeenCalledWith("");
});

test("an empty filtered list spans the whole table", () => {
  show({ careSetting: "acute", patients: [], unit: "7", units: [{ id: 7, name: "3 West" }] });
  expect(screen.getByText(/No inpatients right now/).closest("td")).toHaveAttribute("colspan", "6");
});

test("Acute and Emergency lists offer Attending; other lists and roles do not", () => {
  const onChangeAttending = jest.fn();
  const { unmount } = show({ careSetting: "acute", onChangeAttending });
  fireEvent.click(screen.getByRole("button", { name: "Attending for Bob Ray" }));
  expect(onChangeAttending).toHaveBeenCalledWith(rows[0]);
  unmount();
  const second = show({ careSetting: "ambulatory", onChangeAttending });
  expect(screen.queryByRole("button", { name: "Attending for Bob Ray" })).toBeNull();
  second.unmount();
  show({ careSetting: "acute", onChangeAttending, userRole: "receptionist" });
  expect(screen.queryByRole("button", { name: "Attending for Bob Ray" })).toBeNull();
});

test("the Task Manager icon selects the patient, then opens the Task Manager", () => {
  const onSelect = jest.fn();
  show({ careSetting: "ambulatory", onSelect });
  fireEvent.click(screen.getByRole("button", { name: "Task Manager for Bob Ray" }));
  expect(onSelect).toHaveBeenCalledWith(rows[0]);
  expect(screen.getByTestId("where")).toHaveTextContent("/tasks");
});

test("the Referral Manager icon selects the patient, then opens the Referral Manager", () => {
  const onSelect = jest.fn();
  show({ careSetting: "ambulatory", onSelect });
  fireEvent.click(screen.getByRole("button", { name: "Referral Manager for Bob Ray" }));
  expect(onSelect).toHaveBeenCalledWith(rows[0]);
  expect(screen.getByTestId("where")).toHaveTextContent("/referrals");
});

test("the manager icons still open their page where no patient selection is kept", () => {
  show({ careSetting: "ambulatory" });
  fireEvent.click(screen.getByRole("button", { name: "Task Manager for Bob Ray" }));
  expect(screen.getByTestId("where")).toHaveTextContent("/tasks");
});

test("each role sees only the manager icons it may open", () => {
  const { unmount } = show({ userRole: "doctor" });
  expect(screen.getByRole("button", { name: "Task Manager for Bob Ray" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Referral Manager for Bob Ray" })).toBeInTheDocument();
  unmount();
  const reg = show({ userRole: "registrar" });
  expect(screen.queryByRole("button", { name: "Task Manager for Bob Ray" })).toBeNull();
  expect(screen.getByRole("button", { name: "Referral Manager for Bob Ray" })).toBeInTheDocument();
  reg.unmount();
  show({ userRole: "receptionist" });
  expect(screen.queryByRole("button", { name: "Task Manager for Bob Ray" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Referral Manager for Bob Ray" })).toBeNull();
});
