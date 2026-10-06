import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

jest.mock("../patients/SearchField", () => () => null, { virtual: true });
jest.mock("@fortawesome/react-fontawesome", () => ({ FontAwesomeIcon: () => null }), { virtual: true });
jest.mock("@fortawesome/free-solid-svg-icons", () => ({ faEnvelope: {}, faSms: {} }), { virtual: true });

import PatientsTable from "../patients/PatientsTable";

const rows = [
  {
    id: 1, user_id: 10, full_name: "Bob Ray", email: "b@x.com", phone_number: "1", provider_name: "Dr. A",
    current_visit: { id: 90, care_setting: "acute", location: "General Hospital › 3 West › 312 › A", arrival_time: "2026-10-05T10:00:00Z", attending_provider_name: "Dr. Jeffrey Lee" },
  },
];

const show = (props) =>
  render(
    <MemoryRouter>
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
  expect(screen.getByTestId("patient-location-10")).toHaveTextContent("3 West › 312 › A");
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
