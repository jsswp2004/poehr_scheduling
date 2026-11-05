import { Alert, Stack, TextField, ToggleButton, ToggleButtonGroup, Typography } from "@mui/material";

/**
 * "How should the specialist get the secure link?" Used when signing a referral, sending it again, and
 * from the Secure link section. The text/email names the clinic and the link only, never the patient.
 */

/** Start from what the directory has for the destination: text if there is a mobile number, else email, else not now. */
export const initialDelivery = (dest) => {
  const mobile = dest?.mobile || "";
  const email = dest?.email || "";
  return { mode: mobile ? "sms" : email ? "email" : "none", mobile, email };
};

/** What to send the server, or null for "not now". `error` says what is missing. */
export function deliveryPayload(d) {
  if (!d || d.mode === "none") return { payload: null, error: "" };
  if (d.mode === "copy") return { payload: { channels: [], copy: true }, error: "" };
  const channels = d.mode === "both" ? ["sms", "email"] : [d.mode];
  if (channels.includes("sms") && !String(d.mobile || "").trim()) return { payload: null, error: "Add a mobile number to send a text." };
  if (channels.includes("email") && !String(d.email || "").trim()) return { payload: null, error: "Add an email address to send an email." };
  return { payload: { channels, mobile: String(d.mobile || "").trim(), email: String(d.email || "").trim() }, error: "" };
}

export default function ReferralDeliveryFields({ value, onChange, allowCopy = false, noneLabel = "Not now" }) {
  const set = (key) => (e) => onChange({ ...value, [key]: e.target.value });
  const sending = ["sms", "email", "both"].includes(value.mode);
  const hasMobile = !!String(value.mobile || "").trim();
  const hasEmail = !!String(value.email || "").trim();
  const oneContact = sending && (value.mode === "sms" ? !hasEmail : value.mode === "email" ? !hasMobile : false);

  return (
    <Stack spacing={1.5} data-testid="referral-delivery">
      <Typography variant="body2" component="div">
        Send the specialist a secure link by
      </Typography>
      <ToggleButtonGroup
        exclusive
        size="small"
        color="primary"
        value={value.mode}
        onChange={(_e, mode) => mode && onChange({ ...value, mode })}
        aria-label="How to send the secure link"
        sx={{ flexWrap: "wrap" }}
      >
        <ToggleButton value="sms" data-testid="delivery-mode-sms">
          Text
        </ToggleButton>
        <ToggleButton value="email" data-testid="delivery-mode-email">
          Email
        </ToggleButton>
        <ToggleButton value="both" data-testid="delivery-mode-both">
          Both
        </ToggleButton>
        {allowCopy && (
          <ToggleButton value="copy" data-testid="delivery-mode-copy">
            Copy the link
          </ToggleButton>
        )}
        <ToggleButton value="none" data-testid="delivery-mode-none">
          {noneLabel}
        </ToggleButton>
      </ToggleButtonGroup>

      {sending && (
        <>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField
              size="small"
              fullWidth
              label="Mobile number"
              value={value.mobile}
              onChange={set("mobile")}
              inputProps={{ "data-testid": "delivery-mobile", inputMode: "tel" }}
            />
            <TextField
              size="small"
              fullWidth
              label="Email address"
              value={value.email}
              onChange={set("email")}
              inputProps={{ "data-testid": "delivery-email", inputMode: "email" }}
            />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            The message names your clinic and the link only, never the patient. When the specialist opens the link they enter a
            6-digit code sent to their other contact. Each text or email counts toward your monthly messages.
          </Typography>
          {oneContact && (
            <Alert severity="info" data-testid="delivery-one-contact">
              {value.mode === "sms" ? "No email address is given" : "No mobile number is given"}, so the 6-digit code will go to the same{" "}
              {value.mode === "sms" ? "phone" : "email"} as the link. Adding the other contact makes this safer.
            </Alert>
          )}
        </>
      )}
      {value.mode === "copy" && (
        <Typography variant="caption" color="text.secondary">
          Nothing is sent. You get the link to share yourself, and no code is asked for because no contact is on file.
        </Typography>
      )}
    </Stack>
  );
}
