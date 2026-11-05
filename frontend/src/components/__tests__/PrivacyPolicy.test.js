import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import PrivacyPolicy from "../../pages/PrivacyPolicy";

test("the policy renders without signing in and covers what Apple asks for", () => {
  render(<MemoryRouter><PrivacyPolicy /></MemoryRouter>);
  expect(screen.getByRole("heading", { level: 1, name: /POWER Staffing Privacy Policy/ })).toBeTruthy();
  for (const heading of [/Information we collect/, /Patient information/, /Alerts and reminders/, /Who can see/, /Security/, /Retention and deletion/, /Contact us/]) {
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
  }
  expect(screen.getByText(/does not collect or display patient health information/i)).toBeTruthy();
  const mail = screen.getByRole("link", { name: "power@powerhealthit.com" });
  expect(mail.getAttribute("href")).toBe("mailto:power@powerhealthit.com");
  expect(screen.getByRole("link", { name: "301-880-6015" })).toBeTruthy();
});

test("it does not claim things we have not confirmed", () => {
  const { container } = render(<MemoryRouter><PrivacyPolicy /></MemoryRouter>);
  expect(container.textContent).not.toMatch(/Face ID|biometric|analytics SDK|we sell/i);
});
