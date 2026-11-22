import { useEffect, useRef, useState } from "react";
import { Alert, Box, Button, Stack } from "@mui/material";
import QrCodeScannerIcon from "@mui/icons-material/QrCodeScanner";
import { extractClaimCode } from "../../utils/claimCode";

/**
 * "Scan with camera" for the portal's Claim box. Uses the browser's own QR reader (BarcodeDetector: Chrome and Edge
 * on Android, Chrome on desktop) with the back camera; no extra library. Reads the new link QR codes and the older
 * "POWER-RX:" ones. Where the browser can't scan, or the camera is blocked, it says so and the code is typed instead.
 * The camera needs HTTPS (the live site) or localhost.
 */
export function cameraScanProblem(win = window) {
  if (!win.isSecureContext) return "The camera only works on a secure (https) page. Type the code under the QR code instead.";
  if (!win.navigator?.mediaDevices?.getUserMedia) return "This browser can't use the camera here. Type the code under the QR code instead.";
  if (!("BarcodeDetector" in win)) {
    return "This browser can't read QR codes (for example Safari on iPhone). Type the code under the QR code, use a barcode scanner, or open the portal in Chrome on Android.";
  }
  return "";
}

const CAMERA_ERRORS = {
  NotAllowedError: "Camera permission was denied. Allow the camera for this site in the browser settings, or type the code.",
  SecurityError: "Camera permission was denied. Allow the camera for this site in the browser settings, or type the code.",
  NotFoundError: "No camera was found on this device. Type the code under the QR code instead.",
  NotReadableError: "The camera is busy in another app. Close it and try again, or type the code.",
};

export default function ClaimCameraScanner({ onCode }) {
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");
  const video = useRef(null);
  const stream = useRef(null);
  const timer = useRef(null);

  const stop = () => {
    clearInterval(timer.current);
    timer.current = null;
    if (stream.current) stream.current.getTracks().forEach((t) => t.stop());
    stream.current = null;
    setActive(false);
  };

  useEffect(() => stop, []);

  const start = async () => {
    const problem = cameraScanProblem();
    if (problem) {
      setMessage(problem);
      return;
    }
    setMessage("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    } catch (err) {
      setMessage(CAMERA_ERRORS[err?.name] || "Could not start the camera. Type the code under the QR code instead.");
      return;
    }
    setActive(true);
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    // the <video> is rendered once `active` is set; attach the stream and look for a QR code a few times a second
    setTimeout(() => {
      if (!video.current || !stream.current) return;
      video.current.srcObject = stream.current;
      try {
        const playing = video.current.play && video.current.play();
        if (playing && playing.catch) playing.catch(() => {});
      } catch (e) {
        /* autoplay refused: the stream still shows once the user taps the video */
      }
      timer.current = setInterval(async () => {
        try {
          const found = await detector.detect(video.current);
          const code = found && found[0] ? extractClaimCode(found[0].rawValue) : "";
          if (code) {
            stop();
            onCode(code);
          }
        } catch (e) {
          /* a frame that isn't ready yet: try the next one */
        }
      }, 300);
    }, 0);
  };

  return (
    <Box>
      {!active ? (
        <Button size="small" startIcon={<QrCodeScannerIcon />} onClick={start} data-testid="claim-scan">Scan with camera</Button>
      ) : (
        <Stack spacing={1}>
          <video ref={video} muted playsInline style={{ width: "100%", maxHeight: 240, background: "#000", borderRadius: 4 }} data-testid="claim-scan-video" />
          <Button size="small" onClick={stop} data-testid="claim-scan-stop">Stop camera</Button>
        </Stack>
      )}
      {message && <Alert severity="warning" sx={{ mt: 1 }} data-testid="claim-scan-message">{message}</Alert>}
    </Box>
  );
}
