import { act, render, screen } from "@testing-library/react";
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

describe("MdsPage sign-in hand-off", () => {
  const ORIGIN = "https://mds.example.test";
  beforeEach(() => {
    process.env.REACT_APP_MDS_URL = `${ORIGIN}/`;
    localStorage.setItem("access_token", JSON.stringify({ token: "tok-123" }));
  });
  afterEach(() => {
    delete process.env.REACT_APP_MDS_URL;
    localStorage.clear();
  });

  const ask = (win, origin, type = "mds:need-token") =>
    act(() => {
      window.dispatchEvent(new MessageEvent("message", { data: { type }, origin, source: win }));
    });

  it("answers the frame's request with the token, addressed to the MDS origin only", () => {
    render(<MdsPage />);
    const win = screen.getByTitle("POWER MDS Assessment Portal").contentWindow;
    const post = jest.spyOn(win, "postMessage").mockImplementation(() => {});
    ask(win, ORIGIN);
    expect(post).toHaveBeenCalledWith({ type: "mds:token", token: "tok-123" }, ORIGIN);
  });

  it("ignores requests from another origin, another window or another message type", () => {
    render(<MdsPage />);
    const win = screen.getByTitle("POWER MDS Assessment Portal").contentWindow;
    const post = jest.spyOn(win, "postMessage").mockImplementation(() => {});
    ask(win, "https://evil.example");
    ask(window, ORIGIN);
    ask(win, ORIGIN, "something-else");
    expect(post).not.toHaveBeenCalled();
  });

  it("also understands the older bare-string token format", () => {
    localStorage.setItem("access_token", "legacy-456");
    render(<MdsPage />);
    const win = screen.getByTitle("POWER MDS Assessment Portal").contentWindow;
    const post = jest.spyOn(win, "postMessage").mockImplementation(() => {});
    ask(win, ORIGIN);
    expect(post).toHaveBeenCalledWith({ type: "mds:token", token: "legacy-456" }, ORIGIN);
  });

  it("sends a null token when the person is signed out", () => {
    localStorage.removeItem("access_token");
    render(<MdsPage />);
    const win = screen.getByTitle("POWER MDS Assessment Portal").contentWindow;
    const post = jest.spyOn(win, "postMessage").mockImplementation(() => {});
    ask(win, ORIGIN);
    expect(post).toHaveBeenCalledWith({ type: "mds:token", token: null }, ORIGIN);
  });
});
