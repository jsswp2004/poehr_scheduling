import { useEffect, useRef, useState } from "react";
import { Box, Button, IconButton, Popover, Stack, TextField, Tooltip } from "@mui/material";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatUnderlinedIcon from "@mui/icons-material/FormatUnderlined";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import LinkIcon from "@mui/icons-material/Link";
import FormatColorTextIcon from "@mui/icons-material/FormatColorText";
import FormatClearIcon from "@mui/icons-material/FormatClear";
import { sanitizeHtml } from "../../utils/sanitizeHtml";

const COLORS = [
  { label: "Black", value: "#1e293b" },
  { label: "Red", value: "#c62828" },
  { label: "Blue", value: "#1565c0" },
  { label: "Green", value: "#2e7d32" },
  { label: "Orange", value: "#e65100" },
];

/**
 * A formatting toolbar over an editable box, so nobody has to type HTML. What shows in the box is what
 * a patient sees. `value` is HTML; it is only pushed into the box when `resetKey` changes (a different
 * announcement was opened), so typing never moves the cursor.
 */
export default function RichTextEditor({ value, onChange, resetKey, label = "Message" }) {
  const boxRef = useRef(null);
  const savedRange = useRef(null);
  const [linkAnchor, setLinkAnchor] = useState(null);
  const [colorAnchor, setColorAnchor] = useState(null);
  const [linkUrl, setLinkUrl] = useState("https://");

  useEffect(() => {
    if (boxRef.current) boxRef.current.innerHTML = sanitizeHtml(value || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  const emit = () => onChange && onChange(boxRef.current ? boxRef.current.innerHTML : "");

  const run = (command, arg) => {
    if (boxRef.current) boxRef.current.focus();
    document.execCommand(command, false, arg);
    emit();
  };

  const rememberSelection = () => {
    const sel = window.getSelection();
    savedRange.current = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  };

  const restoreSelection = () => {
    if (boxRef.current) boxRef.current.focus();
    const sel = window.getSelection();
    if (savedRange.current && sel) {
      sel.removeAllRanges();
      sel.addRange(savedRange.current);
    }
  };

  const onPaste = (e) => {
    // Paste as plain text so nothing arrives with a stranger's fonts and styles.
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData("text/plain");
    document.execCommand("insertText", false, text);
  };

  const tool = (title, icon, onClick) => (
    <Tooltip title={title}>
      <IconButton size="small" aria-label={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
        {icon}
      </IconButton>
    </Tooltip>
  );

  return (
    <Box>
      <Stack
        direction="row"
        spacing={0.25}
        role="toolbar"
        aria-label="Formatting"
        sx={{ border: 1, borderBottom: 0, borderColor: "divider", borderRadius: "6px 6px 0 0", p: 0.5, bgcolor: "background.default", flexWrap: "wrap" }}
      >
        {tool("Bold", <FormatBoldIcon fontSize="small" />, () => run("bold"))}
        {tool("Italic", <FormatItalicIcon fontSize="small" />, () => run("italic"))}
        {tool("Underline", <FormatUnderlinedIcon fontSize="small" />, () => run("underline"))}
        {tool("Bulleted list", <FormatListBulletedIcon fontSize="small" />, () => run("insertUnorderedList"))}
        {tool("Numbered list", <FormatListNumberedIcon fontSize="small" />, () => run("insertOrderedList"))}
        {tool("Link", <LinkIcon fontSize="small" />, (e) => {
          rememberSelection();
          setLinkAnchor(e.currentTarget);
        })}
        {tool("Text color", <FormatColorTextIcon fontSize="small" />, (e) => {
          rememberSelection();
          setColorAnchor(e.currentTarget);
        })}
        {tool("Clear formatting", <FormatClearIcon fontSize="small" />, () => run("removeFormat"))}
      </Stack>
      <Box
        ref={boxRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={label}
        data-testid="announcement-body"
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        sx={{
          border: 1,
          borderColor: "divider",
          borderRadius: "0 0 6px 6px",
          p: 1.5,
          minHeight: 150,
          bgcolor: "background.paper",
          fontSize: 14,
          lineHeight: 1.6,
          outline: "none",
          "&:focus": { borderColor: "primary.main", boxShadow: (t) => `0 0 0 1px ${t.palette.primary.main}` },
          "& ul, & ol": { pl: 3, my: 0.5 },
        }}
      />

      <Popover open={Boolean(linkAnchor)} anchorEl={linkAnchor} onClose={() => setLinkAnchor(null)}>
        <Stack direction="row" spacing={1} sx={{ p: 1.5 }}>
          <TextField size="small" label="Web address" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} autoFocus />
          <Button
            variant="contained"
            onClick={() => {
              restoreSelection();
              if (/^(https?:\/\/|mailto:|tel:)/i.test(linkUrl.trim())) run("createLink", linkUrl.trim());
              setLinkAnchor(null);
            }}
          >
            Add link
          </Button>
        </Stack>
      </Popover>

      <Popover open={Boolean(colorAnchor)} anchorEl={colorAnchor} onClose={() => setColorAnchor(null)}>
        <Stack direction="row" spacing={0.75} sx={{ p: 1.25 }}>
          {COLORS.map((c) => (
            <Tooltip key={c.value} title={c.label}>
              <IconButton
                size="small"
                aria-label={c.label}
                onClick={() => {
                  restoreSelection();
                  run("foreColor", c.value);
                  setColorAnchor(null);
                }}
                sx={{ bgcolor: c.value, width: 26, height: 26, "&:hover": { bgcolor: c.value, opacity: 0.85 } }}
              />
            </Tooltip>
          ))}
        </Stack>
      </Popover>
    </Box>
  );
}
