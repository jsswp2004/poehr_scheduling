import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Autocomplete, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, MenuItem, Paper, Stack, Table,
  TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";

const fail = (err, fallback) => toast.error(errorText(err, fallback));

/** One supply line: the counts and notes save when the person leaves the box. */
function UsageRow({ caseId, item, editable, onChanged, onRemoved }) {
  const [vals, setVals] = useState(item);
  useEffect(() => setVals(item), [item]);

  const commit = async (field, parse = (v) => v) => {
    const value = parse(vals[field]);
    if (value === item[field]) return;
    try {
      onChanged(await surgeryApi.updateUsage(caseId, item.id, { [field]: value }));
    } catch (err) {
      fail(err, "That change was not saved.");
      setVals(item);
    }
  };
  const num = (v) => Math.max(parseInt(v, 10) || 0, 0);
  const count = (field) => (
    <TableCell sx={{ width: 84 }}>
      <TextField
        size="small"
        type="number"
        value={vals[field]}
        disabled={!editable}
        onChange={(e) => setVals((v) => ({ ...v, [field]: e.target.value }))}
        onBlur={() => commit(field, num)}
        inputProps={{ min: 0, "aria-label": `${item.name} ${field}` }}
      />
    </TableCell>
  );
  return (
    <TableRow>
      <TableCell>{item.name}</TableCell>
      <TableCell>{item.catalog_number}</TableCell>
      {count("total")}
      {count("hold")}
      {count("wasted")}
      <TableCell>{item.used}</TableCell>
      <TableCell sx={{ minWidth: 160 }}>
        <TextField
          size="small"
          fullWidth
          value={vals.notes}
          disabled={!editable}
          onChange={(e) => setVals((v) => ({ ...v, notes: e.target.value }))}
          onBlur={() => commit("notes")}
          inputProps={{ "aria-label": `${item.name} notes`, maxLength: 255 }}
        />
      </TableCell>
      <TableCell>{item.charge_code}</TableCell>
      <TableCell>{item.department}</TableCell>
      <TableCell padding="checkbox">
        {editable && (
          <IconButton
            size="small"
            aria-label={`Remove ${item.name}`}
            onClick={async () => {
              try {
                await surgeryApi.removeUsage(caseId, item.id);
                onRemoved(item.id);
              } catch (err) {
                fail(err, "The supply was not removed.");
              }
            }}
          >
            <DeleteOutlineIcon fontSize="small" />
          </IconButton>
        )}
      </TableCell>
    </TableRow>
  );
}

function AddSupplyDialog({ open, caseId, categories, onClose, onAdded }) {
  const [f, setF] = useState({ category: "OTHER", name: "", catalog_number: "", total: 1 });
  useEffect(() => {
    if (open) setF({ category: "OTHER", name: "", catalog_number: "", total: 1 });
  }, [open]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const add = async () => {
    try {
      onAdded(await surgeryApi.addUsage(caseId, { ...f, name: f.name.trim(), total: Math.max(parseInt(f.total, 10) || 1, 1) }));
      onClose();
    } catch (err) {
      fail(err, "The supply was not added.");
    }
  };
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Item</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <TextField select size="small" label="Category" value={f.category} onChange={set("category")}>
            {categories.map((c) => (
              <MenuItem key={c.value} value={c.value}>
                {c.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Item name" value={f.name} onChange={set("name")} />
          <TextField size="small" label="Catalog #" value={f.catalog_number} onChange={set("catalog_number")} />
          <TextField size="small" type="number" label="Quantity" value={f.total} onChange={set("total")} inputProps={{ min: 1 }} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={add} disabled={!f.name.trim()}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** The Case Usage tab: Merge Management (preference cards) and the supplies used, grouped by category. */
export default function CaseUsagePanel({ caseId, lookups, editable }) {
  const [cards, setCards] = useState([]);
  const [usage, setUsage] = useState([]);
  const [options, setOptions] = useState([]);
  const [text, setText] = useState("");
  const [supplyOpen, setSupplyOpen] = useState(false);

  const loadCards = useCallback(() => surgeryApi.caseCards(caseId).then((r) => setCards(r.cards)).catch((e) => fail(e, "Could not load the preference cards.")), [caseId]);
  const loadUsage = useCallback(() => surgeryApi.usage(caseId).then(setUsage).catch((e) => fail(e, "Could not load the case usage.")), [caseId]);
  useEffect(() => {
    loadCards();
    loadUsage();
  }, [loadCards, loadUsage]);

  useEffect(() => {
    if (!editable) return undefined;
    const t = setTimeout(() => surgeryApi.preferenceCards(text.trim()).then(setOptions).catch(() => setOptions([])), 250);
    return () => clearTimeout(t);
  }, [text, editable]);

  const addCard = async (card) => {
    if (!card) return;
    try {
      await surgeryApi.addCard(caseId, card.id);
      setText("");
      await Promise.all([loadCards(), loadUsage()]);
    } catch (err) {
      fail(err, "The preference card was not added.");
    }
  };
  const groups = useMemo(() => {
    const by = {};
    usage.forEach((u) => (by[u.category] = by[u.category] || { label: u.category_label, rows: [] }).rows.push(u));
    return Object.entries(by);
  }, [usage]);
  const replace = (u) => setUsage((rows) => rows.map((r) => (r.id === u.id ? u : r)));
  const primary = cards.filter((c) => c.is_primary).length;

  return (
    <Stack spacing={1.5}>
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Merge Management{" "}
          <Typography component="span" variant="caption" color="text.secondary">
            · {cards.length} Preference Cards; {primary} Primary
          </Typography>
        </Typography>
        {editable && (
          <Autocomplete
            size="small"
            options={options}
            value={null}
            inputValue={text}
            onInputChange={(_, v, reason) => reason !== "reset" && setText(v)}
            onChange={(_, v) => addCard(v)}
            getOptionLabel={(o) => o.name}
            filterOptions={(x) => x}
            noOptionsText="No preference cards found"
            renderInput={(params) => <TextField {...params} label="Add preference card" />}
            sx={{ maxWidth: 420, mb: 1 }}
          />
        )}
        <TableContainer>
          <Table size="small" aria-label="Preference cards">
            <TableHead>
              <TableRow>
                <TableCell>Preference Card</TableCell>
                <TableCell>Procedure</TableCell>
                <TableCell>Current Merge Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {cards.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.procedure_name}</TableCell>
                  <TableCell>{c.merge_status}</TableCell>
                  <TableCell align="right">
                    {editable && !c.is_primary && (
                      <Button size="small" onClick={() => surgeryApi.makePrimary(caseId, c.id).then(loadCards).catch((e) => fail(e, "Could not change the primary card."))}>
                        Make Primary
                      </Button>
                    )}
                    {editable && (
                      <Button size="small" color="error" onClick={() => surgeryApi.removeCard(caseId, c.id).then(loadCards).catch((e) => fail(e, "The card was not removed."))}>
                        Remove
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {cards.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                      No preference cards on this case.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", mb: 1 }}>
          <Typography variant="subtitle2" sx={{ flex: 1 }}>
            Case Usage
          </Typography>
          {editable && (
            <Button size="small" startIcon={<AddIcon />} onClick={() => setSupplyOpen(true)}>
              Add Item
            </Button>
          )}
        </Box>
        <TableContainer>
          <Table size="small" aria-label="Case usage">
            <TableHead>
              <TableRow>
                {["Name", "Catalog #", "Total", "Hold", "Wasted", "Used", "Notes", "Charge Code", "Department"].map((h) => (
                  <TableCell key={h}>{h}</TableCell>
                ))}
                <TableCell padding="checkbox" />
              </TableRow>
            </TableHead>
            <TableBody>
              {groups.map(([key, g]) => [
                <TableRow key={`h-${key}`} sx={{ background: "action.hover" }}>
                  <TableCell colSpan={10} sx={{ fontWeight: 700 }}>
                    {g.label} ({g.rows.length})
                  </TableCell>
                </TableRow>,
                ...g.rows.map((u) => (
                  <UsageRow key={u.id} caseId={caseId} item={u} editable={editable} onChanged={replace} onRemoved={(id) => setUsage((rows) => rows.filter((r) => r.id !== id))} />
                )),
              ])}
              {usage.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10}>
                    <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                      No supplies recorded yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
      <AddSupplyDialog open={supplyOpen} caseId={caseId} categories={lookups?.usage_categories || []} onClose={() => setSupplyOpen(false)} onAdded={(u) => setUsage((rows) => [...rows, u])} />
    </Stack>
  );
}
