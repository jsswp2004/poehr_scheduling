import { useCallback, useEffect, useState } from "react";
import { Box, Button, IconButton, Stack, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { toast } from "../SimpleToast";
import { errorText } from "../patientHeader/headerApi";
import { surgeryApi } from "./surgeryApi";

/** Setup: the price list. Adding a code that is already listed changes its price. */
export default function PricesAdmin() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ charge_code: "", description: "", unit_price: "" });
  const load = useCallback(() => surgeryApi.prices().then(setRows).catch((e) => toast.error(errorText(e, "Could not load the prices."))), []);
  useEffect(() => {
    load();
  }, [load]);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const save = async () => {
    try {
      await surgeryApi.savePrice({ charge_code: f.charge_code.trim(), description: f.description, unit_price: f.unit_price });
      setF({ charge_code: "", description: "", unit_price: "" });
      load();
    } catch (err) {
      toast.error(errorText(err, "The price was not saved."));
    }
  };
  return (
    <Box>
      <Stack direction="row" spacing={1} sx={{ mb: 1.5 }}>
        <TextField size="small" label="Charge code" value={f.charge_code} onChange={set("charge_code")} />
        <TextField size="small" label="Description" value={f.description} onChange={set("description")} sx={{ flex: 1 }} />
        <TextField size="small" type="number" label="Unit price ($)" value={f.unit_price} onChange={set("unit_price")} inputProps={{ min: 0, step: "0.01" }} />
        <Button variant="contained" onClick={save} disabled={!f.charge_code.trim() || f.unit_price === ""}>
          Save Price
        </Button>
      </Stack>
      <Table size="small" aria-label="Price list">
        <TableHead>
          <TableRow>
            <TableCell>Charge Code</TableCell>
            <TableCell>Description</TableCell>
            <TableCell align="right">Unit Price ($)</TableCell>
            <TableCell padding="checkbox" />
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.charge_code}</TableCell>
              <TableCell>{r.description}</TableCell>
              <TableCell align="right">{r.unit_price}</TableCell>
              <TableCell padding="checkbox">
                <IconButton
                  size="small"
                  aria-label={`Remove ${r.charge_code}`}
                  onClick={() =>
                    surgeryApi.removePrice(r.id).then(load).catch((e) => toast.error(errorText(e, "The price was not removed.")))
                  }
                >
                  <DeleteOutlineIcon fontSize="small" />
                </IconButton>
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4}>
                <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center" }}>
                  No prices yet. Charges show no amount until their code has a price.
                </Typography>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </Box>
  );
}
