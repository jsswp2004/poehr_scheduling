import { Box, Paper, Typography, IconButton, Stack, Tooltip, Divider } from "@mui/material";
import PrintIcon from "@mui/icons-material/Print";

// Escapes a value for safe interpolation into the print HTML string below.
const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));

// Turns this pane's preview data into a standalone, printable HTML document
// -- built as a plain HTML string (not a clone of the rendered DOM), because
// a window.open('', '_blank') target never receives MUI's runtime-injected
// stylesheet, so cloned markup would render unstyled. Mirrors the pattern
// already used by useCommunicatorUtils.printContacts elsewhere in this app.
function buildPrintHtml({ title, meta, sections }) {
  const metaHtml = (meta || [])
    .filter(Boolean)
    .map((line) => `<p class="meta-line">${escapeHtml(line)}</p>`)
    .join("");

  const showTabHeadings = (sections || []).length > 1;
  const sectionsHtml = (sections || [])
    .map((tab) => {
      const tabHeading =
        showTabHeadings && tab.tabLabel
          ? `<h2 class="tab-heading">${escapeHtml(tab.tabLabel)}</h2>`
          : "";
      const sectionsBody = (tab.sections || [])
        .map((section) => {
          const sectionHeading = section.sectionLabel
            ? `<h3 class="section-heading">${escapeHtml(section.sectionLabel)}</h3>`
            : "";
          const entries = (section.entries || [])
            .map(
              (e) =>
                `<p class="entry"><strong>${escapeHtml(e.label)}:</strong> ${
                  e.empty
                    ? '<span class="empty">Not yet documented</span>'
                    : escapeHtml(e.display)
                }</p>`
            )
            .join("");
          return `<div class="section">${sectionHeading}${entries}</div>`;
        })
        .join("");
      return `<div class="tab">${tabHeading}${sectionsBody}</div>`;
    })
    .join("");

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${escapeHtml(title)}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 30px; color: #222; }
          .header { border-bottom: 2px solid #1976d2; padding-bottom: 10px; margin-bottom: 20px; }
          .header h1 { color: #1976d2; margin: 0 0 4px; font-size: 20px; }
          .meta-line { margin: 2px 0; color: #555; font-size: 13px; }
          .tab-heading { font-size: 15px; text-transform: uppercase; color: #1976d2; margin: 18px 0 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
          .section-heading { font-size: 13px; color: #444; margin: 12px 0 4px; }
          .entry { margin: 4px 0; font-size: 13px; line-height: 1.4; }
          .empty { color: #999; font-style: italic; }
          .footer { margin-top: 30px; text-align: center; color: #888; font-size: 11px; }
          @media print {
            body { margin: 0.5in; }
            .tab-heading, .section-heading { page-break-after: avoid; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${escapeHtml(title)}</h1>
          ${metaHtml}
        </div>
        ${sectionsHtml || '<p class="empty">Nothing entered yet.</p>'}
        <div class="footer">Printed on ${escapeHtml(new Date().toLocaleString())}</div>
      </body>
    </html>
  `;
}

function printNotePreview({ title, meta, sections }) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) return;
  printWindow.document.write(buildPrintHtml({ title, meta, sections }));
  printWindow.document.close();
  printWindow.onload = () => {
    printWindow.print();
    printWindow.close();
  };
}

/**
 * Live, read-only preview of the note currently being documented in
 * ClinicalNotesPanel, shown alongside the form so the author can see the
 * note taking shape as they fill it in. `sections` is the shared shape built
 * by DynamicNoteForm's buildNotePreviewSections() -- same tab/section
 * grouping the form itself uses -- so this works identically whether the
 * note is template-driven or the fixed SOAP form.
 *
 * The Print button (top-right) renders the exact same `sections` data as a
 * standalone document, so what's printed always matches what's shown here.
 */
function NotePreviewPane({ title, meta, sections }) {
  const hasStructure = (sections || []).some((t) => (t.sections || []).length > 0);

  return (
    <Paper
      variant="outlined"
      sx={{
        p: 2,
        borderRadius: 2,
        position: { md: "sticky" },
        top: { md: 88 },
        maxHeight: { md: "calc(100vh - 120px)" },
        overflowY: "auto",
      }}
    >
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="subtitle1">Live Preview</Typography>
        <Tooltip title="Print this note">
          <span>
            <IconButton
              size="small"
              disabled={!hasStructure}
              onClick={() => printNotePreview({ title, meta, sections })}
            >
              <PrintIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
      </Stack>
      <Divider sx={{ mb: 1.5 }} />

      <Typography variant="h6" sx={{ mb: 0.5 }}>
        {title}
      </Typography>
      {(meta || [])
        .filter(Boolean)
        .map((line) => (
          <Typography key={line} variant="caption" color="text.secondary" display="block">
            {line}
          </Typography>
        ))}

      <Box sx={{ mt: 2 }}>
        {!hasStructure ? (
          <Typography variant="body2" color="text.secondary" fontStyle="italic">
            Nothing entered yet -- fill in the form to see it appear here.
          </Typography>
        ) : (
          sections.map((tab, tIdx) => (
            <Box key={tab.tabLabel || `tab-${tIdx}`} sx={{ mb: 2 }}>
              {sections.length > 1 && tab.tabLabel && (
                <Typography variant="overline" color="primary" sx={{ fontWeight: 700 }}>
                  {tab.tabLabel}
                </Typography>
              )}
              {tab.sections.map((section, sIdx) => (
                <Box key={section.sectionLabel || `section-${sIdx}`} sx={{ mb: 1.5 }}>
                  {section.sectionLabel && (
                    <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.5 }}>
                      {section.sectionLabel}
                    </Typography>
                  )}
                  <Stack spacing={0.5}>
                    {section.entries.map((e) => (
                      <Typography variant="body2" key={e.label}>
                        <strong>{e.label}:</strong>{" "}
                        {e.empty ? (
                          <Typography
                            component="span"
                            variant="body2"
                            color="text.disabled"
                            fontStyle="italic"
                          >
                            Not yet documented
                          </Typography>
                        ) : (
                          e.display
                        )}
                      </Typography>
                    ))}
                  </Stack>
                </Box>
              ))}
            </Box>
          ))
        )}
      </Box>
    </Paper>
  );
}

export default NotePreviewPane;
