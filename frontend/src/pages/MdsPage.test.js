import { render, screen } from "@testing-library/react";
import MdsPage from "./MdsPage";

describe("MdsPage", () => {
  afterEach(() => { delete process.env.REACT_APP_MDS_URL; });

  it("says it is not connected when no address is configured", () => {
    render(<MdsPage />);
    expect(screen.getByText(/not connected to this site yet/i)).toBeTruthy();
  });

  it("hosts the MDS application when its address is configured", () => {
    process.env.REACT_APP_MDS_URL = "https://mds.example.test/";
    render(<MdsPage />);
    expect(screen.getByTitle("POWER MDS Assessment Portal").getAttribute("src")).toBe("https://mds.example.test/");
  });
});
