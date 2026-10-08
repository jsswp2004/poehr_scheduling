import { render, screen } from "@testing-library/react";

jest.mock("../patients/ChartPageShell", () => ({ children }) => <div data-testid="shell">{children}</div>, { virtual: true });
jest.mock("../LabInbox", () => () => <div data-testid="lab-inbox">INBOX</div>, { virtual: true });

import LabInboxPage from "../../pages/LabInboxPage";

test("the lab inbox sits inside the side bar shell, with no Back button of its own", () => {
  render(<LabInboxPage />);
  expect(screen.getByTestId("shell")).toContainElement(screen.getByTestId("lab-inbox"));
  expect(screen.queryByText(/back/i)).not.toBeInTheDocument();
});

test("no card padding above the inbox title (tight under the top bar)", () => {
  render(<LabInboxPage />);
  const page = getComputedStyle(screen.getByTestId("lab-inbox-page"));
  expect(page.boxShadow).toBe("");
  expect(page.paddingTop).toBe("8px");
});
