import { useCallback, useEffect, useState } from "react";
import {
  Box, Button, Checkbox, Dialog, DialogActions, DialogContent, DialogTitle, FormControlLabel, IconButton, MenuItem, Stack, Table, TableBody,
  TableCell, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";

const blankItem = () => ({ category: "OTHER", name: "", catalog_number: "", quantity: 1, charge_code: "", department: "" });
const blankCard = () => ({ name: "", procedure_name: "", pre_op_notes: "", post_op_notes: "", is_active: true, items: [] });

function CardEditor({ open, cardId, categories, onClose, onSaved }) {
  const [card, setCard] = useState(blankCard());
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCard(blankCard());
    if (cardId) surgeryApi.getCard(cardId).then(setCard).catch((e) => toast.error(errorText(e, "Could not open the card.")));
  }, [open, cardId]);

  const set = (k) => (e) => setCard((c) => ({ ...c, [k]: e.target.value }));
  const setItem = (i, k, v) => setCard((c) => ({ ...c, items: c.items.map((it, n) => (n === i ? { ...it, [k]: v } : it)) }));

  const save = async () => {
    const body = {
      name: card.name.trim(), procedure_name: card.procedure_name, pre_op_notes: card.pre_op_notes, post_op_notes: card.post_op_notes,
      is_active: card.is_active,
      items: card.items.filter((i) => i.name.trim()).map((i) => ({ ...i, name: i.name.trim(), quantity: Math.max(parseInt(i.quantity, 10) || 1, 1) })),
    };
    setBusy(true);
    try {
      const saved = cardId ? await surgeryApi.updateCard(cardId, body) : await surgeryApi.createCard(body);
      toast.success("Preference card saved");
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(errorText(err, "The card was not saved."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>{cardId ? "Edit Preference Card" : "New Preference Card"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={2}>
            <TextField size="small" label="Card name" value={card.name} onChange={set("name")} sx={{ flex: 1 }} />
            <TextField size="small" label="Procedure" value={card.procedure_name} onChange={set("procedure_name")} sx={{ flex: 1 }} />
            <FormControlLabel control={<Checkbox checked={card.is_active} onChange={(e) => setCard((c) => ({ ...c, is_active: e.target.checked }))} />} label="Active" />
          </Stack>
          <Stack direction="row" spacing={2}>
            <TextField size="small" multiline minRows={3} label="Pre-op notes" value={card.pre_op_notes} onChange={set("pre_op_notes")} sx={{ flex: 1 }} />
            <TextField size="small" multiline minRows={3} label="Post-op notes" value={card.post_op_notes} onChange={set("post_op_notes")} sx={{ flex: 1 }} />
          </Stack>
          <Box>
            <Stack direction="row" alignItems="center">
              <Typography variant="subtitle2" sx={{ flex: 1 }}>
                Supplies on this card
              </Typography>
              <Button size="small" startIcon={<AddIcon />} onClick={() => setCard((c) => ({ ...c, items: [...c.items, blankItem()] }))}>
                Add Supply
              </Button>
            </Stack>
            <Table size="small" aria-label="Card supplies">
              <TableHead>
                <TableRow>
                  {["Category", "Name", "Catalog #", "Qty", "Charge Code", "Department"].map((h) => (
                    <TableCell key={h}>{h}</TableCell>
                  ))}
                  <TableCell padding="checkbox" />
                </TableRow>
              </TableHead>
              <TableBody>
                {card.items.map((it, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <TextField select size="small" value={it.category} onChange={(e) => setItem(i, "category", e.target.value)} inputProps={{ "aria-label": `Supply ${i + 1} category` }} sx={{ minWidth: 150 }}>
                        {categories.map((c) => (
                          <MenuItem key={c.value} value={c.value}>
                            {c.label}
                          </MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <TextField size="small" fullWidth value={it.name} onChange={(e) => setItem(i, "name", e.target.value)} inputProps={{ "aria-label": `Supply ${i + 1} name` }} />
                    </TableCell>
                    <TableCell>
                      <TextField size="small" value={it.catalog_number} onChange={(e) => setItem(i, "catalog_number", e.target.value)} inputProps={{ "aria-label": `Supply ${i + 1} catalog` }} />
                    </TableCell>
                    <TableCell sx={{ width: 80 }}>
                      <TextField size="small" type="number" value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} inputProps={{ min: 1, "aria-label": `Supply ${i + 1} quantity` }} />
                    </TableCell>
                    <TableCell>
                      <TextField size="small" value={it.charge_code} onChange={(e) => setItem(i, "charge_code", e.target.value)} inputProps={{ "aria-label": `Supply ${i + 1} charge code` }} />
                    </TableCell>
                    <TableCell>
                      <TextField size="small" value={it.department} onChange={(e) => setItem(i, "department", e.target.value)} inputProps={{ "aria-label": `Supply ${i + 1} department` }} />
                    </TableCell>
                    <TableCell padding="checkbox">
                      <IconButton size="small" aria-label={`Remove supply ${i + 1}`} onClick={() => setCard((c) => ({ ...c, items: c.items.filter((_, n) => n !== i) }))}>
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={save} disabled={busy || !card.name.trim()}>
          Save Card
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Setup: the preference cards (a surgeon's standard supply list per procedure). */
export default function PreferenceCardsAdmin({ categories }) {
  const [cards, setCards] = useState([]);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // { id } or {} for new

  const load = useCallback(() => surgeryApi.adminCards(q.trim()).then(setCards).catch((e) => toast.error(errorText(e, "Could not load the cards."))), [q]);
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
        <TextField size="small" label="Search cards" value={q} onChange={(e) => setQ(e.target.value)} />
        <Box sx={{ flex: 1 }} />
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => setEditing({})}>
          New Card
        </Button>
      </Stack>
      <Table size="small" aria-label="Preference cards">
        <TableHead>
          <TableRow>
            <TableCell>Card</TableCell>
            <TableCell>Procedure</TableCell>
            <TableCell>Surgeon</TableCell>
            <TableCell>Active</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {cards.map((c) => (
            <TableRow key={c.id} hover sx={{ cursor: "pointer" }} onClick={() => setEditing({ id: c.id })}>
              <TableCell>{c.name}</TableCell>
              <TableCell>{c.procedure_name}</TableCell>
              <TableCell>{c.surgeon?.name || ""}</TableCell>
              <TableCell>{c.is_active ? "Yes" : "No"}</TableCell>
            </TableRow>
          ))}
          {cards.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  No preference cards yet.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <CardEditor open={!!editing} cardId={editing?.id} categories={categories} onClose={() => setEditing(null)} onSaved={load} />
    </Box>
  );
}
