/**
 * Client for the POWER Scan Agent: a small program on the user's Windows PC that talks to the
 * scanner (see poehr_scan_agent/). The page cannot reach a scanner itself, so it asks the agent
 * on this computer (127.0.0.1) to scan, and gets a PDF back.
 *
 * Protocol (v1), all JSON except the file:
 *   GET  /v1/status               -> { agent, version }
 *   GET  /v1/scanners             -> [{ id, name, connection }]
 *   POST /v1/scan                 -> { jobId }       body: { scannerId, source, sides, color, dpi }
 *   GET  /v1/jobs/:id             -> { state: "scanning" | "building" | "done" | "error" | "cancelled", pages, message }
 *   GET  /v1/jobs/:id/file        -> the PDF
 *   POST /v1/jobs/:id/cancel
 *   DELETE /v1/jobs/:id           (the agent also deletes its copy once the file is fetched)
 */
export const AGENT_URL = process.env.REACT_APP_SCAN_AGENT_URL || "http://127.0.0.1:47631";

export class AgentMissingError extends Error {
  constructor() {
    super("The POWER Scan Agent was not found on this computer.");
    this.name = "AgentMissingError";
  }
}

async function call(path, { method = "GET", body, timeoutMs = 8000, blob = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${AGENT_URL}${path}`, {
      method,
      mode: "cors",
      signal: controller.signal,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new AgentMissingError();
  } finally {
    clearTimeout(timer);
  }
  if (!res.ok) {
    let message = "The scanner agent reported a problem.";
    try {
      message = (await res.json()).message || message;
    } catch (err) {
      /* keep the generic message */
    }
    throw new Error(message);
  }
  return blob ? res.blob() : res.json();
}

export const agentStatus = () => call("/v1/status", { timeoutMs: 2500 });
export const listScanners = () => call("/v1/scanners", { timeoutMs: 15000 });
export const startScan = (settings) => call("/v1/scan", { method: "POST", body: settings });
export const getJob = (id) => call(`/v1/jobs/${encodeURIComponent(id)}`);
export const fetchJobFile = (id) => call(`/v1/jobs/${encodeURIComponent(id)}/file`, { blob: true, timeoutMs: 60000 });
export const cancelJob = (id) => call(`/v1/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" }).catch(() => null);
export const deleteJob = (id) => call(`/v1/jobs/${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);

/** Scan with the agent: reports page counts while it runs and returns { blob, pages }. */
export async function runScan(settings, { onJob, onProgress, isCancelled, pollMs = 500 }) {
  const { jobId } = await startScan(settings);
  if (onJob) onJob(jobId);
  let info;
  for (;;) {
    info = await getJob(jobId);
    if (onProgress) onProgress(info);
    if (info.state === "done" || info.state === "error" || info.state === "cancelled") break;
    if (isCancelled && isCancelled()) {
      await cancelJob(jobId);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  if (info.state === "cancelled") return { cancelled: true };
  if (info.state === "error") throw new Error(info.message || "The scanner reported an error.");
  const blob = await fetchJobFile(jobId);
  await deleteJob(jobId);
  return { blob, pages: info.pages || 0 };
}
