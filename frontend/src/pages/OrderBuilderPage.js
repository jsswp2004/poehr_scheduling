import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";
import { Box, Container, Tabs, Tab, Typography, Paper } from "@mui/material";
import TemplateListView from "../components/noteBuilder/TemplateListView";
import NoteTemplateEditor from "../components/noteBuilder/NoteTemplateEditor";
import DictionaryManager from "../components/noteBuilder/DictionaryManager";
import OrderablesManager from "../components/orderBuilder/OrderablesManager";
import OrderSetsManager from "../components/orderBuilder/OrderSetsManager";

/**
 * Order Builder: the admin-facing configuration for the orders module --
 * the catalog of orderables (with CSV upload), order sets, and the "detail
 * forms" (the questions asked when ordering something, built with the same
 * engine as note templates but kept apart from them) plus the shared
 * dictionaries those forms use.
 *
 * Admin/system_admin only; every /api/admin/orderables/ and
 * /api/admin/order-sets/ call is also gated server-side by the
 * orders.manage_catalog right.
 */
function OrderBuilderPage() {
    const navigate = useNavigate();
    const [checking, setChecking] = useState(true);
    const [tab, setTab] = useState("orderables");
    // null = list; a code = editing that form; "__new__" = building a new one.
    const [editingFormCode, setEditingFormCode] = useState(null);

    useEffect(() => {
        const token = localStorage.getItem("access_token");
        if (!token) {
            navigate("/login");
            return;
        }
        try {
            const role = jwtDecode(token).role || "";
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

    if (checking) return null;

    return (
        <Container maxWidth="lg" sx={{ py: 4 }}>
            <Typography variant="h4" gutterBottom>
                Order Builder
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Manage what can be ordered -- labs, imaging, procedures, referrals and nursing orders -- the
                bundles (order sets) clinicians can place in one click, and the questions asked when
                ordering. Changing a catalog entry never changes an order that was already signed.
            </Typography>

            <Paper sx={{ mb: 3 }}>
                <Tabs
                    value={tab}
                    onChange={(e, v) => {
                        setTab(v);
                        setEditingFormCode(null);
                    }}
                >
                    <Tab label="Orderables" value="orderables" />
                    <Tab label="Order Sets" value="sets" />
                    <Tab label="Detail Forms" value="forms" />
                    <Tab label="Dictionaries" value="dictionaries" />
                </Tabs>
            </Paper>

            {tab === "orderables" && <OrderablesManager />}
            {tab === "sets" && <OrderSetsManager />}
            {tab === "forms" && (
                <Box>
                    {editingFormCode === null ? (
                        <TemplateListView
                            kind="order_detail"
                            onEdit={(code) => setEditingFormCode(code)}
                            onNew={() => setEditingFormCode("__new__")}
                        />
                    ) : (
                        <NoteTemplateEditor
                            kind="order_detail"
                            templateCode={editingFormCode === "__new__" ? null : editingFormCode}
                            onBack={() => setEditingFormCode(null)}
                        />
                    )}
                </Box>
            )}
            {tab === "dictionaries" && <DictionaryManager />}
        </Container>
    );
}

export default OrderBuilderPage;
