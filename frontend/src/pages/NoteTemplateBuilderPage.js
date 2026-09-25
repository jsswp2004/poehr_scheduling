import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Box, Container, Tabs, Tab, Typography, Paper } from "@mui/material";
import TemplateListView from "../components/noteBuilder/TemplateListView";
import NoteTemplateEditor from "../components/noteBuilder/NoteTemplateEditor";
import DictionaryManager from "../components/noteBuilder/DictionaryManager";

/**
 * Phase 2 of the note-builder engine: the admin-facing configuration UI for
 * building/editing structured note types (NoteTemplate + NoteFieldDefinition
 * rows) and their shared option lists (Dictionary + DictionaryItem), without
 * a code deploy -- the equivalent of Sunrise Clinical Manager's
 * configuration module for observation sets.
 *
 * Admin/system_admin only (also enforced server-side by IsNoteTemplateAdmin
 * on every /api/admin/note-templates/ and /api/admin/dictionaries/ call --
 * this client-side check is just so the wrong role never sees the screen
 * flash before being redirected).
 *
 * Editing a template here never changes how an already-signed note
 * displays: ClinicalNote.template_snapshot freezes each note's field
 * definitions at creation time, so this UI is safe to use on a live,
 * in-production template at any time.
 */
function NoteTemplateBuilderPage() {
    const navigate = useNavigate();
    const [checking, setChecking] = useState(true);
    const [tab, setTab] = useState("templates");
    // null = showing the template list; a code string = editing that
    // template; the literal "__new__" = building a brand new template.
    const [editingTemplateCode, setEditingTemplateCode] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        if (!token) {
            navigate("/login");
            return;
        }
        try {
            const decoded = jwtDecode(token);
            const role = decoded.role || "";
            if (role !== "admin" && role !== "system_admin") {
                navigate("/admin");
                return;
            }
        } catch (err) {
            navigate("/login");
            return;
        }
        setChecking(false);
    }, [navigate]);

    if (checking) {
        return null;
    }

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Typography variant="h4" gutterBottom>
                Note Builder
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Build and edit structured note types -- like Admission Note -- as an
                ordered set of fields, without a code deploy. Editing a template here
                never changes how an already-signed note looks in Note History.
            </Typography>

            <Paper sx={{ mb: 3 }}>
                <Tabs
                    value={tab}
                    onChange={(e, v) => {
                        setTab(v);
                        setEditingTemplateCode(null);
                    }}
                >
                    <Tab label="Note Templates" value="templates" />
                    <Tab label="Dictionaries" value="dictionaries" />
                </Tabs>
            </Paper>

            {tab === "templates" && (
                <Box>
                    {editingTemplateCode === null ? (
                        <TemplateListView
                            onEdit={(code) => setEditingTemplateCode(code)}
                            onNew={() => setEditingTemplateCode("__new__")}
                        />
                    ) : (
                        <NoteTemplateEditor
                            templateCode={editingTemplateCode === "__new__" ? null : editingTemplateCode}
                            onBack={() => setEditingTemplateCode(null)}
                        />
                    )}
                </Box>
            )}

            {tab === "dictionaries" && <DictionaryManager />}
        </Container>
    );
}

export default NoteTemplateBuilderPage;
