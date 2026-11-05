import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import RoomsDialog from "./RoomsDialog";
import { surgeryApi } from "./surgeryApi";
import { toast } from "../SimpleToast";

jest.mock("./surgeryApi", () => ({ surgeryApi: { rooms: jest.fn(), roomOptions: jest.fn(), addRoom: jest.fn(), updateRoom: jest.fn() } }));
jest.mock("../SimpleToast", () => ({ toast: { success: jest.fn(), error: jest.fn(), warning: jest.fn() } }));
jest.mock("../patientHeader/headerApi", () => ({ errorText: (e, f) => e?.response?.data?.detail || f }));

const room = (o = {}) => ({ id: 1, name: "OR-1", unit: "Operating Rooms", is_active: true, location_room: 11, ...o });
const props = { open: true, facilityId: 7, onClose: jest.fn(), onChanged: jest.fn() };

beforeEach(() => {
  surgeryApi.rooms.mockResolvedValue([room(), room({ id: 2, name: "OR-2", is_active: false, location_room: 12 })]);
  surgeryApi.roomOptions.mockResolvedValue([{ id: 30, name: "OR 9", unit: "Main OR", facility: 7 }]);
});

test("lists operating rooms with their Location Manager unit", async () => {
  render(<RoomsDialog {...props} />);
  expect(await screen.findByText("OR-1 (Operating Rooms)")).toBeInTheDocument();
  expect(screen.getByText("OR-2 (Operating Rooms) (not in use)")).toBeInTheDocument();
  expect(surgeryApi.rooms).toHaveBeenCalledWith({ facility: 7, all: 1 });
  expect(surgeryApi.roomOptions).toHaveBeenCalledWith({ facility: 7 });
});

test("uses a room that already exists in Location Manager", async () => {
  surgeryApi.addRoom.mockResolvedValue(room({ id: 3, name: "OR 9" }));
  render(<RoomsDialog {...props} />);
  await screen.findByText("OR-1 (Operating Rooms)");
  expect(screen.getByRole("button", { name: "Use" })).toBeDisabled();
  fireEvent.mouseDown(screen.getByLabelText("Room from Location Manager"));
  fireEvent.click(await screen.findByRole("option", { name: "Main OR › OR 9" }));
  fireEvent.click(screen.getByRole("button", { name: "Use" }));
  await waitFor(() => expect(surgeryApi.addRoom).toHaveBeenCalledWith({ location_room: 30 }));
  expect(toast.success).toHaveBeenCalledWith("Room added");
  expect(props.onChanged).toHaveBeenCalled();
});

test("a new room name is built through Surgery for this facility", async () => {
  surgeryApi.addRoom.mockResolvedValue(room({ id: 4, name: "OR-5" }));
  render(<RoomsDialog {...props} />);
  await screen.findByText("OR-1 (Operating Rooms)");
  fireEvent.change(screen.getByLabelText("New room"), { target: { value: " OR-5 " } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  await waitFor(() => expect(surgeryApi.addRoom).toHaveBeenCalledWith({ facility: 7, name: "OR-5" }));
});

test("no picker when every Location Manager room is already in use", async () => {
  surgeryApi.roomOptions.mockResolvedValue([]);
  render(<RoomsDialog {...props} />);
  await screen.findByText("OR-1 (Operating Rooms)");
  expect(screen.queryByLabelText("Room from Location Manager")).not.toBeInTheDocument();
});

test("switching a room off and a refused add both report cleanly", async () => {
  surgeryApi.updateRoom.mockResolvedValue({});
  surgeryApi.addRoom.mockRejectedValue({ response: { data: { detail: "OR-5 already exists at General Hospital." } } });
  render(<RoomsDialog {...props} />);
  await screen.findByText("OR-1 (Operating Rooms)");
  fireEvent.click(screen.getAllByRole("switch")[0]);
  await waitFor(() => expect(surgeryApi.updateRoom).toHaveBeenCalledWith(1, { is_active: false }));
  fireEvent.change(screen.getByLabelText("New room"), { target: { value: "OR-5" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(await screen.findByText("OR-5 already exists at General Hospital.")).toBeInTheDocument();
});
