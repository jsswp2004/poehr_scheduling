import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Box, Container, Tabs, Tab, Typography, Paper } from "@mui/material";
import FlowsheetTemplateListView from "../components/flowsheetBuilder/FlowsheetTemplateListView";
import FlowsheetTemplateEditor from "../components/flowsheetBuilder/FlowsheetTemplateEditor";
import DictionaryManager from "../components/noteBuilder/DictionaryManager";

/**
 * Phase 2 of the flowsheet feature: the admin-facing configuration UI for
 * building/editing flowsheet types (FlowsheetTemplate + FlowsheetRowDefinition
 * rows) and their shared option lists (Dictionary + DictionaryItem), without
 * a code deploy. Mirrors NoteTemplateBuilderPage exactly, one level down.
 *
 * Admin/system_admin only (also enforced server-side by IsFlowsheetTemplateAdmin
 * on every /api/admin/flowsheet-templates/ call -- this client-side check is
 * just so the wrong role never sees the screen flash before being redirected).
 *
 * The Dictionaries tab reuses the same DictionaryManager the note-builder
 * uses -- dropdown flowsheet rows and dropdown/radio/multiselect note fields
 * share the same Dictionary/DictionaryItem model, so options built here are
 * available to both builders.
 */
function FlowsheetBuilderPage() {
    const navigate = useNavigate();
    const [checking, setChecking] = useState(true);
    const [tab, setTab] = useState("templates");
    // null = showing the flowsheet type list; a code string = editing that
    // type; the literal "__new__" = building a brand new type.
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
                Flowsheet Builder
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Build and edit flowsheet types -- like Vital Signs -- as an ordered set of
                rows, without a code deploy. A visit can be charted against more than one
                flowsheet type.
            </Typography>

            <Paper sx={{ mb: 3 }}>
                <Tabs
                    value={tab}
                    onChange={(e, v) => {
                        setTab(v);
                        setEditingTemplateCode(null);
                    }}
                >
                    <Tab label="Flowsheet Types" value="templates" />
                    <Tab label="Dictionaries" value="dictionaries" />
                </Tabs>
            </Paper>

            {tab === "templates" && (
                <Box>
                    {editingTemplateCode === null ? (
                        <FlowsheetTemplateListView
                            onEdit={(code) => setEditingTemplateCode(code)}
                            onNew={() => setEditingTemplateCode("__new__")}
                        />
                    ) : (
                        <FlowsheetTemplateEditor
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

export default FlowsheetBuilderPage;
