import { render, screen } from "@testing-library/react";
import userEvent from "user-event-14";
import PatientHelp from "./PatientHelp";

// The shared test setup doesn't reset browser storage between tests; these components use it.
afterEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("PatientHelp", () => {
  it("answers common problems without any network or data", async () => {
    const user = userEvent.setup();
    render(<PatientHelp />);
    await user.click(screen.getByText("Need help?"));
    await user.click(screen.getByText("The picture is frozen or choppy"));
    expect(screen.getByText(/Turn your camera off/)).toBeVisible();
    expect(screen.getByText(/Call the clinic and they'll help you/)).toBeInTheDocument();
  });

  it("offers a phone link when the clinic number is given", () => {
    render(<PatientHelp clinicPhone="301-880-6015" />);
    expect(screen.getByRole("link", { name: "Call the clinic at 301-880-6015" })).toHaveAttribute("href", "tel:301-880-6015");
  });
});
