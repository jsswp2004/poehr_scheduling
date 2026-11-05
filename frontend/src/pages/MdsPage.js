import { useEffect, useRef } from "react";
import { Alert, Box, Typography } from "@mui/material";

// POWER MDS runs as its own application (it holds resident assessment data and is deployed separately).
// This page hosts it in the POWER shell when its address is configured, and says so plainly when it is not.
//
// Sign-in: MDS has no password of its own. The framed app asks (postMessage "mds:need-token") and this page
// answers with the person's current sign-in token, addressed to the MDS origin only. When the token changes
// (it is refreshed about hourly) or the person signs out, MDS is told again. MDS checks the token with this
// site's backend (/api/users/mds/session/) before showing anything.

const readToken = () => {
  try {
    return localStorage.getItem("access_token") || null;
  } catch (e) {
    return null;
  }
};

export const originOf = (url) => {
  try {
    return new URL(url).origin;
  } catch (e) {
    return null;
  }
};

export default function MdsPage() {
  const MDS_URL = process.env.REACT_APP_MDS_URL || "";
  const frame = useRef(null);
  const origin = originOf(MDS_URL);

  useEffect(() => {
    if (!origin) return undefined;
    const send = () => {
      const win = frame.current && frame.current.contentWindow;
      if (win) win.postMessage({ type: "mds:token", token: readToken() }, origin);
    };
    const onMessage = (event) => {
      const win = frame.current && frame.current.contentWindow;
      if (!win || event.source !== win || event.origin !== origin) return;
      if (event.data && event.data.type === "mds:need-token") send();
    };
    let last = readToken();
    const timer = setInterval(() => {
      const now = readToken();
      if (now !== last) {
        last = now;
        send();
      }
    }, 10000);
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      clearInterval(timer);
    };
  }, [origin]);

  if (!MDS_URL) {
    return (
      <Box sx={{ p: 4, maxWidth: 720, mx: "auto" }}>
        <Typography variant="h5" gutterBottom>POWER MDS</Typography>
        <Alert severity="info">
          POWER MDS is not connected to this site yet. Set REACT_APP_MDS_URL to the address where the MDS
          application is hosted, then rebuild.
        </Alert>
      </Box>
    );
  }
  return (
    <Box sx={{ height: "100vh", width: "100%" }}>
      <iframe ref={frame} title="POWER MDS Assessment Portal" src={MDS_URL} style={{ border: 0, width: "100%", height: "100%" }} />
    </Box>
  );
}
