import React from "react";
import { Alert, Box, Button, Checkbox, FormControl, FormControlLabel, InputLabel, MenuItem, Select, Stack, TextField, Typography } from "@mui/material";

export const EMPTY_POLICY = {
  plan: "",
  cob_order: 1,
  insured_person: "Self",
  relationship: "",
  policy_number: "",
  group_number: "",
  effective_date: "",
  end_date: "",
  active: true,
};

/** Mirrors the server: A letter, N digit, Z letter or digit, P punctuation, anything else literal. */
export const matchesFormat = (fmt, value) => {
  if (!fmt) return true;
  const v = value || "";
  if (v.length !== fmt.length) return false;
  return [...fmt].every((f, i) => {
    const ch = v[i];
    if (f === "A") return /\p{L}/u.test(ch);
    if (f === "N") return /\d/.test(ch);
    if (f === "Z") return /[\p{L}\d]/u.test(ch);
    if (f === "P") return !/[\p{L}\d\s]/u.test(ch);
    return ch === f;
  });
};

const isCurrent = (p) => p.active && !p.end_date;

/** Problems the registrar can fix before saving; the server checks the same rules. */
export const policyProblems = (policies, plans) => {
  const out = [];
  const byId = Object.fromEntries((plans || []).map((p) => [String(p.id), p]));
  const seen = {};
  policies.forEach((p, i) => {
    const plan = byId[String(p.plan)];
    if (!p.plan) out.push(`Policy ${i + 1}: pick a plan.`);
    else if (!(p.policy_number || "").trim()) out.push(`Policy ${i + 1}: enter the policy number.`);
    else if (plan && plan.policy_format && !matchesFormat(plan.policy_format, p.policy_number.trim())) out.push(`Policy ${i + 1}: the number should look like ${plan.policy_format}.`);
    if (isCurrent(p)) {
      if (seen[p.cob_order]) out.push(`Two current policies have COB order ${p.cob_order}.`);
      seen[p.cob_order] = true;
      if (plan && plan.required_primary && Number(p.cob_order) !== 1) out.push(`${plan.type_name} has to be the primary insurance.`);
    }
  });
  return out;
};

/** A patient's policies, one card each, plus the insurance for this visit. */
export default function PolicyEditor({ policies, onChange, plans, warnings, readOnly }) {
  const update = (i, patch) => onChange(policies.map((p, n) => (n === i ? { ...p, ...patch } : p)));
  const problems = policyProblems(policies, plans);
  const planById = Object.fromEntries((plans || []).map((p) => [String(p.id), p]));
  return (
    <Box data-testid="policy-editor">
      {(warnings || []).map((w) => (
        <Alert key={w} severity="warning" sx={{ mb: 1 }}>
          {w}
        </Alert>
      ))}
      {problems.length > 0 && (
        <Alert severity="info" sx={{ mb: 1 }} data-testid="policy-problems">
          {problems.join(" ")}
        </Alert>
      )}
      {policies.length === 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          No insurance on file.
        </Typography>
      )}
      <Stack spacing={1.5}>
        {policies.map((p, i) => {
          const plan = planById[String(p.plan)];
          return (
            <Box key={p.id || `new-${i}`} data-testid={`policy-row-${i}`} sx={{ border: "1px solid", borderColor: "divider", borderRadius: 1, p: 1.5, opacity: isCurrent(p) ? 1 : 0.7 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 1.5 }}>
                <FormControl size="small" fullWidth required>
                  <InputLabel id={`pol-plan-${i}`}>Plan</InputLabel>
                  <Select labelId={`pol-plan-${i}`} label="Plan" value={String(p.plan || "")} onChange={(e) => update(i, { plan: e.target.value })} inputProps={{ "data-testid": `policy-plan-${i}` }}>
                    {(plans || []).map((pl) => (
                      <MenuItem key={pl.id} value={String(pl.id)}>
                        {pl.carrier_name} - {pl.name} ({pl.type_name})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField label="COB order" size="small" type="number" sx={{ width: 120 }} value={p.cob_order} onChange={(e) => update(i, { cob_order: e.target.value === "" ? "" : Number(e.target.value) })} inputProps={{ min: 1, max: 9, "data-testid": `policy-order-${i}` }} />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 1.5 }}>
                <TextField
                  label="Policy number"
                  size="small"
                  fullWidth
                  required
                  value={p.policy_number}
                  onChange={(e) => update(i, { policy_number: e.target.value })}
                  helperText={plan && plan.policy_format ? `Format: ${plan.policy_format}` : " "}
                  inputProps={{ "data-testid": `policy-number-${i}` }}
                />
                <TextField label="Group number" size="small" fullWidth value={p.group_number} onChange={(e) => update(i, { group_number: e.target.value })} />
                <TextField label="Insured person" size="small" fullWidth value={p.insured_person} onChange={(e) => update(i, { insured_person: e.target.value })} />
                <TextField label="Relationship to patient" size="small" fullWidth value={p.relationship} onChange={(e) => update(i, { relationship: e.target.value })} />
              </Stack>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ alignItems: "center" }}>
                <TextField label="Effective" type="date" size="small" InputLabelProps={{ shrink: true }} value={p.effective_date || ""} onChange={(e) => update(i, { effective_date: e.target.value })} />
                <TextField label="Ends" type="date" size="small" InputLabelProps={{ shrink: true }} value={p.end_date || ""} onChange={(e) => update(i, { end_date: e.target.value })} inputProps={{ "data-testid": `policy-end-${i}` }} />
                <FormControlLabel control={<Checkbox size="small" checked={!!p.active} onChange={(e) => update(i, { active: e.target.checked })} />} label="Active" />
                {!p.id && (
                  <Button size="small" color="inherit" onClick={() => onChange(policies.filter((_, n) => n !== i))} data-testid={`policy-remove-${i}`}>
                    Remove
                  </Button>
                )}
                {p.id && !isCurrent(p) && (
                  <Typography variant="caption" color="text.secondary">
                    History
                  </Typography>
                )}
              </Stack>
            </Box>
          );
        })}
      </Stack>
      {!readOnly && (
        <Button sx={{ mt: 1.5 }} variant="outlined" size="small" data-testid="add-policy" onClick={() => onChange([...policies, { ...EMPTY_POLICY, cob_order: Math.max(0, ...policies.filter(isCurrent).map((x) => Number(x.cob_order) || 0)) + 1 }])}>
          Add insurance
        </Button>
      )}
    </Box>
  );
}
