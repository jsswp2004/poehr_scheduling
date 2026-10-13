export function classifyLatency(ms) {
  if (ms == null) return "unreachable";
  if (ms < 150) return "good";
  if (ms < 400) return "fair";
  return "slow";
}

/**
 * Round-trip time to our own server. This checks that the person can reach the visit
 * service at a usable speed; it is not a bandwidth test. The first call is a warm-up
 * (TLS handshake) and is not counted.
 */
export async function measureLatency(pingFn, samples = 5, now = () => performance.now()) {
  try {
    await pingFn();
  } catch {
    /* warm-up failures show up in the real samples */
  }
  const times = [];
  for (let i = 0; i < samples; i += 1) {
    const start = now();
    try {
      await pingFn();
      times.push(now() - start);
    } catch {
      /* counted as lost */
    }
  }
  if (times.length === 0) return { ms: null, lost: samples, status: "unreachable" };
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)];
  const lost = samples - times.length;
  return { ms: Math.round(median), lost, status: lost >= 2 ? "slow" : classifyLatency(median) };
}
