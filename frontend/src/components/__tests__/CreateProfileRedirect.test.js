import { renderHook, act } from "@testing-library/react";

const mockNavigate = jest.fn();
jest.mock("react-router-dom", () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock("axios", () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }), { virtual: true });
jest.mock("react-toastify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }), { virtual: true });

import axios from "axios";
import { toast } from "react-toastify";
import { useCreateProfile } from "../../hooks/create-profile/useCreateProfile";

beforeEach(() => {
  mockNavigate.mockReset();
  axios.get.mockReset().mockResolvedValue({ data: [] });
  axios.post.mockReset().mockResolvedValue({ data: {} });
  toast.success.mockReset();
  window.localStorage.clear();
});

const submit = async () => {
  const { result } = renderHook(() => useCreateProfile());
  await act(async () => {
    await result.current.handleSubmit({ preventDefault() {} });
  });
};

test("an administrator who is signed in goes back to Profile, not the login page", async () => {
  window.localStorage.setItem("access_token", "t");
  await submit();
  expect(mockNavigate).toHaveBeenCalledWith("/profile");
  expect(mockNavigate).not.toHaveBeenCalledWith("/login");
  expect(toast.success).toHaveBeenCalledWith("Profile created.");
});

test("someone registering themselves (not signed in) still goes to the login page", async () => {
  await submit();
  expect(mockNavigate).toHaveBeenCalledWith("/login");
});
