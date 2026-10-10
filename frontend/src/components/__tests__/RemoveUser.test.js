import { render, screen, waitFor, fireEvent } from "@testing-library/react";

jest.mock("../../api/client", () => ({ api: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock("../../utils/auth", () => ({ getValidToken: jest.fn() }), { virtual: true });
jest.mock("../../utils/tokenManager", () => ({}), { virtual: true });

import { api } from "../../api/client";
import { getValidToken } from "../../utils/auth";
import RemoveUserDialog from "../profile/RemoveUserDialog";
import { apiEndpoints } from "../../config/api";

const person = { id: 7, first_name: "Dana", last_name: "Cole", username: "dcole" };

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  getValidToken.mockResolvedValue({ access_token: "t" });
});

test("endpoints", () => {
  expect(apiEndpoints.userRemoval(7)).toMatch(/\/api\/users\/7\/removal\/$/);
  expect(apiEndpoints.userRestore(7)).toMatch(/\/api\/users\/7\/restore\/$/);
});

test("someone with no history is offered a delete", async () => {
  api.get.mockResolvedValue({ data: { action: "delete", history: [], already_removed: false } });
  const done = jest.fn();
  api.post.mockResolvedValue({ data: { result: "deleted", name: "Dana Cole", history: [] } });
  render(<RemoveUserDialog user={person} onClose={() => {}} onDone={done} />);
  expect(await screen.findByText(/deleted permanently/i)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  await waitFor(() => expect(done).toHaveBeenCalledWith(expect.objectContaining({ result: "deleted" })));
  expect(api.post.mock.calls[0][0]).toBe(apiEndpoints.userRemoval(7));
});

test("someone with history is told they will be deactivated and why", async () => {
  api.get.mockResolvedValue({ data: { action: "deactivate", history: ["orders", "clinical notes"], already_removed: false } });
  api.post.mockResolvedValue({ data: { result: "deactivated", name: "Dana Cole", history: ["orders"] } });
  const done = jest.fn();
  render(<RemoveUserDialog user={person} onClose={() => {}} onDone={done} />);
  expect(await screen.findByText(/deactivated, not deleted/i)).toBeTruthy();
  expect(screen.getByText(/orders, clinical notes/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Deactivate" }));
  await waitFor(() => expect(done).toHaveBeenCalled());
});

test("the confirm button stays off until the check is back, and errors are shown", async () => {
  api.get.mockRejectedValue({ response: { data: { error: "You cannot remove yourself." } } });
  render(<RemoveUserDialog user={person} onClose={() => {}} onDone={() => {}} />);
  expect(screen.getByRole("button", { name: "Delete" }).disabled).toBe(true);
  expect(await screen.findByText(/cannot remove yourself/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delete" }).disabled).toBe(true);
});

test("a failed removal shows the reason and lets them try again", async () => {
  api.get.mockResolvedValue({ data: { action: "delete", history: [], already_removed: false } });
  api.post.mockRejectedValue({ response: { data: { error: "This is the organization's last active administrator." } } });
  render(<RemoveUserDialog user={person} onClose={() => {}} onDone={() => {}} />);
  await screen.findByText(/deleted permanently/i);
  fireEvent.click(screen.getByRole("button", { name: "Delete" }));
  expect(await screen.findByText(/last active administrator/i)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Delete" }).disabled).toBe(false);
});
