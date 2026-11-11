import { Box, Button, Chip, Paper, Stack, Typography } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { BUILDER_STICKY_TOP } from "./BuilderShell";

/** The tools a builder can add to a note or flowsheet. More will be added here over time. */
export const ALLERGY_MANAGER_TOOL = {
    key: "allergy_manager",
    title: "Allergy Manager",
    description: "Shows the patient's chart allergies, with the Allergy Manager button to add or change one.",
    icon: <WarningAmberIcon fontSize="small" color="error" />,
};

/**
 * The "Tools" pane on the right of the Note Builder and Flowsheet Builder edit pages.
 * `tools` = [{ ...tool definition, added: bool, onAdd(), onRemove?() , addedText? }].
 */
export default function ToolsPane({ tools }) {
    return (
        <Box
            component="aside"
            aria-label="Tools"
            data-testid="builder-tools-pane"
            sx={{ width: 280, flex: "none", position: "sticky", top: BUILDER_STICKY_TOP, alignSelf: "flex-start", display: { xs: "none", md: "block" } }}
        >
            <Paper variant="outlined" sx={{ p: 1.5 }}>
                <Typography variant="subtitle1" component="h3" sx={{ fontWeight: 700 }}>
                    Tools
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1.5 }}>
                    Ready-made pieces to add to what you are building.
                </Typography>
                <Stack spacing={1.5}>
                    {tools.map((t) => (
                        <Paper key={t.key} variant="outlined" sx={{ p: 1.25, borderRadius: 2 }} data-testid={`tool-${t.key}`}>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 0.5 }}>
                                {t.icon}
                                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                    {t.title}
                                </Typography>
                                {t.added && <Chip size="small" color="success" variant="outlined" label="Added" />}
                            </Stack>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                {t.description}
                            </Typography>
                            {t.added && t.onRemove ? (
                                <Button size="small" color="inherit" onClick={t.onRemove}>
                                    Remove from this {t.noun || "template"}
                                </Button>
                            ) : (
                                <Button size="small" variant="outlined" startIcon={<AddIcon />} onClick={t.onAdd}>
                                    Add {t.title}
                                </Button>
                            )}
                        </Paper>
                    ))}
                </Stack>
            </Paper>
        </Box>
    );
}
