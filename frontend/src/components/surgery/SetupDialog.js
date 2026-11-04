import { useEffect, useState } from "react";
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Tab, Tabs } from "@mui/material";
import { surgeryApi } from "./surgeryApi";
import PreferenceCardsAdmin from "./PreferenceCardsAdmin";
import PoliciesAdmin from "./PoliciesAdmin";
import PricesAdmin from "./PricesAdmin";

/** Surgery Setup (administrators): preference cards, charge policies and the price list. */
export default function SetupDialog({ open, onClose }) {
  const [tab, setTab] = useState("cards");
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    if (open) surgeryApi.lookups().then((l) => setCategories(l.usage_categories || [])).catch(() => setCategories([]));
  }, [open]);
  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Surgery Setup</DialogTitle>
      <DialogContent sx={{ minHeight: 420 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
          <Tab value="cards" label="Preference Cards" />
          <Tab value="policies" label="Charge Policies" />
          <Tab value="prices" label="Price List" />
        </Tabs>
        {tab === "cards" && <PreferenceCardsAdmin categories={categories} />}
        {tab === "policies" && <PoliciesAdmin />}
        {tab === "prices" && <PricesAdmin />}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
