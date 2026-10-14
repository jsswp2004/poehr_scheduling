import { classifyLatency, measureLatency } from "./network";
import { clockOffset, formatWait, isLongWait, isWaiting, todayISO, visitState, waitMs } from "./format";

const patient = (over = {}) => ({ role: "patient", arrived_at: null, admitted_at: null, consented: false, ...over });
const session = (p, status = "scheduled") => ({ status, participants: [{ role: "provider" }, p] });

describe("formatWait", () => {
  it("shows minutes and seconds, then hours", () => {
    expect(formatWait(0)).toBe("0:00");
    expect(formatWait(247000)).toBe("4:07");
    expect(formatWait(3725000)).toBe("1:02:05");
    expect(formatWait(-5000)).toBe("0:00");
  });
});

describe("visitState", () => {
  it("reads the patient's progress", () => {
    expect(visitState(null)).toBe("no-session");
    expect(visitState(session(patient()))).toBe("not-arrived");
    expect(visitState(session(patient({ arrived_at: "2026-10-13T10:00:00Z" })))).toBe("arrived");
    expect(visitState(session(patient({ arrived_at: "2026-10-13T10:00:00Z", consented: true })))).toBe("waiting");
    expect(visitState(session(patient({ arrived_at: "x", admitted_at: "y", consented: true })))).toBe("in-visit");
    expect(visitState(session(patient(), "ended"))).toBe("ended");
  });

  it("treats arrived and waiting as the waiting room", () => {
    expect(isWaiting("arrived")).toBe(true);
    expect(isWaiting("waiting")).toBe(true);
    expect(isWaiting("in-visit")).toBe(false);
  });
});

describe("clocks", () => {
  it("corrects a device clock using the server's time", () => {
    const deviceNow = Date.parse("2026-10-13T10:00:00Z");
    const offset = clockOffset("2026-10-13T10:00:30Z", deviceNow); // device is 30s behind
    expect(offset).toBe(30000);
    const s = session(patient({ arrived_at: "2026-10-13T09:58:00Z" }));
    expect(waitMs(s, deviceNow, offset)).toBe(150000); // 2:30 of waiting by server time
  });

  it("formats today as a local YYYY-MM-DD", () => {
    expect(todayISO(new Date(2026, 9, 3))).toBe("2026-10-03");
  });
});

describe("connection check", () => {
  it("classifies latency", () => {
    expect(classifyLatency(80)).toBe("good");
    expect(classifyLatency(200)).toBe("fair");
    expect(classifyLatency(900)).toBe("slow");
    expect(classifyLatency(null)).toBe("unreachable");
  });

  it("uses the median and ignores the warm-up call", async () => {
    let t = 0;
    const steps = [5000, 100, 300, 120, 110, 90]; // first is the warm-up, not measured
    let call = 0;
    const ping = async () => {
      t += steps[call];
      call += 1;
    };
    // now() is read before and after each call: advance only inside ping
    const result = await measureLatency(ping, 5, () => t);
    expect(call).toBe(6);
    expect(result).toEqual({ ms: 110, lost: 0, status: "good" });
  });

  it("reports unreachable when every ping fails and slow when several are lost", async () => {
    const failing = async () => {
      throw new Error("down");
    };
    expect((await measureLatency(failing, 3)).status).toBe("unreachable");

    let n = 0;
    const flaky = async () => {
      n += 1;
      if (n % 2 === 0) throw new Error("drop");
    };
    expect((await measureLatency(flaky, 5)).status).toBe("slow");
  });
});

describe("isLongWait", () => {
  it("turns on at ten minutes", () => {
    expect(isLongWait(9 * 60 * 1000 + 59000)).toBe(false);
    expect(isLongWait(10 * 60 * 1000)).toBe(true);
  });
});
