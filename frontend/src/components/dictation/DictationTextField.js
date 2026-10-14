import { useRef } from "react";
import { CircularProgress, IconButton, InputAdornment, TextField, Tooltip } from "@mui/material";
import MicIcon from "@mui/icons-material/Mic";
import StopIcon from "@mui/icons-material/Stop";
import { useDictationConfig } from "./DictationContext";
import { appendText } from "./commands";
import useDictation from "./useDictation";

/**
 * A drop-in replacement for MUI TextField that adds a microphone button when dictation is on.
 * Props are the same as TextField's. Dictated phrases are added to the end of the field through the
 * normal `onChange` (as { target: { value } }), so the parent needs no changes. With dictation off
 * (or outside a <DictationProvider>) it renders a plain TextField.
 */
export default function DictationTextField({ value, onChange, disabled, helperText, error, InputProps, label, ...rest }) {
  const { enabled } = useDictationConfig();
  const latest = useRef(value);
  latest.current = value;

  const dictation = useDictation({
    onText: (text) => {
      const next = appendText(latest.current, text);
      latest.current = next; // several phrases can arrive before React re-renders
      if (onChange) onChange({ target: { value: next } });
    },
  });

  if (!enabled || !dictation.supported) {
    return <TextField {...rest} label={label} value={value} onChange={onChange} disabled={disabled} helperText={helperText} error={error} InputProps={InputProps} />;
  }

  const listening = dictation.status === "listening";
  const connecting = dictation.status === "connecting";
  let help = helperText;
  if (dictation.error) help = dictation.error;
  else if (listening) help = dictation.partial ? `${dictation.partial} ...` : "Listening...";
  else if (connecting) help = "Connecting to the microphone...";

  const name = typeof label === "string" ? label : "this field";
  const button = (
    <InputAdornment position="end" sx={{ alignSelf: "flex-start", height: "auto", maxHeight: "none", mt: 0.5 }}>
      <Tooltip title={listening ? "Stop dictation" : `Dictate ${name}`}>
        <span>
          <IconButton
            size="small"
            edge="end"
            onClick={dictation.toggle}
            disabled={disabled || connecting}
            color={listening ? "error" : "default"}
            aria-pressed={listening}
            aria-label={listening ? `Stop dictation for ${name}` : `Dictate ${name}`}
          >
            {connecting ? <CircularProgress size={18} /> : listening ? <StopIcon fontSize="small" /> : <MicIcon fontSize="small" />}
          </IconButton>
        </span>
      </Tooltip>
      {InputProps && InputProps.endAdornment}
    </InputAdornment>
  );

  return (
    <TextField
      {...rest}
      label={label}
      value={value}
      onChange={onChange}
      disabled={disabled}
      error={error || !!dictation.error}
      helperText={help}
      InputProps={{ ...InputProps, endAdornment: button }}
    />
  );
}
