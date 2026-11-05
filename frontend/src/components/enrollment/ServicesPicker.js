import React, { useMemo } from 'react';
import {
  Box, Card, CardActionArea, Checkbox, Divider, FormControlLabel, Grid, Paper, Stack, Typography,
} from '@mui/material';
import {
  EXTRA_MODULE_PRICE, GROUP_ORDER, formatMoney, planMonthlyTotal, planTerms, pricedModules, userLimitLabel,
} from '../../utils/modulePricing';

/**
 * Plan (user limit only) + services checklist + running price.
 * The plan's base price includes its first services (Professional 1, Clinic 2); each further one adds the same amount.
 * Electronic lab interface is quoted separately and never counted.
 */
const ServicesPicker = ({ plans, planPricing, modules, plan, onPlan, selected, onToggle, disabled = false }) => {
  const priced = useMemo(() => pricedModules(selected, modules), [selected, modules]);
  const terms = planTerms(planPricing, plan);
  const includedCodes = priced.slice(0, terms.included);
  const total = planMonthlyTotal(selected, modules, planPricing, plan);
  const byCode = useMemo(() => Object.fromEntries(modules.map((m) => [m.code, m])), [modules]);
  const labQuoted = selected.some((c) => byCode[c] && byCode[c].quoted);

  return (
    <Box>
      <Typography variant="h6" align="center" sx={{ fontWeight: 600, mb: 0.5 }}>Choose plan and services</Typography>
      <Typography variant="body2" color="text.secondary" align="center" sx={{ mb: 3 }}>
        7-day free trial. You can change services later.
      </Typography>

      <Typography variant="subtitle2" sx={{ mb: 1 }}>How many people will sign in?</Typography>
      <Grid container spacing={1.5} sx={{ mb: 3 }}>
        {plans.map((p) => (
          <Grid size={{ xs: 12, sm: 4 }} key={p.key}>
            <Card variant="outlined" sx={{ borderWidth: plan === p.key ? 2 : 1, borderColor: plan === p.key ? 'primary.main' : 'divider' }}>
              <CardActionArea disabled={disabled} onClick={() => onPlan(p.key)} sx={{ p: 1.5 }} aria-pressed={plan === p.key}>
                <Typography fontWeight={600}>{p.label}</Typography>
                <Typography variant="body2" color="text.secondary">{userLimitLabel(p.user_limit)}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {planTerms(planPricing, p.key).quoted ? 'By quote' : `${formatMoney(planTerms(planPricing, p.key).base)}/month, ${planTerms(planPricing, p.key).included} service${planTerms(planPricing, p.key).included === 1 ? '' : 's'} included`}
                </Typography>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Typography variant="subtitle2" sx={{ mb: 0.5 }}>Services</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
            {terms.included === 1 ? 'Your plan includes the first service you pick.' : `Your plan includes the first ${terms.included} services you pick.`} Each additional service is {formatMoney(EXTRA_MODULE_PRICE)}/month.
          </Typography>
          {GROUP_ORDER.map((group) => {
            const items = modules.filter((m) => m.group === group);
            if (!items.length) return null;
            return (
              <Box key={group} sx={{ mb: 1.5 }}>
                <Typography variant="overline" color="text.secondary">{group}</Typography>
                {items.map((m) => {
                  const on = selected.includes(m.code);
                  let note = null;
                  if (m.quoted) note = on ? 'Quoted separately' : null;
                  else if (on && includedCodes.includes(m.code)) note = 'Included';
                  else if (on) note = `+${formatMoney(EXTRA_MODULE_PRICE)}/month`;
                  return (
                    <Box key={m.code} sx={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 1 }}>
                      <FormControlLabel
                        disabled={disabled}
                        control={<Checkbox size="small" checked={on} onChange={() => onToggle(m.code)} />}
                        label={
                          <Box>
                            <Typography variant="body2">{m.label}</Typography>
                            <Typography variant="caption" color="text.secondary">{m.description}</Typography>
                          </Box>
                        }
                      />
                      {note && <Typography variant="caption" sx={{ mt: 1, whiteSpace: 'nowrap' }} color="text.secondary">{note}</Typography>}
                    </Box>
                  );
                })}
              </Box>
            );
          })}
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Paper variant="outlined" sx={{ p: 2, position: { md: 'sticky' }, top: 16 }} aria-live="polite">
            <Typography variant="subtitle2" sx={{ mb: 1 }}>Your plan</Typography>
            <Stack spacing={0.5}>
              <Row left="Base price" right={terms.quoted ? 'By quote' : `${formatMoney(terms.base)}/month`} />
              {priced.map((c) => (
                <Row key={c} left={byCode[c]?.label} right={includedCodes.includes(c) ? '(included)' : `+${formatMoney(EXTRA_MODULE_PRICE)}`} muted />
              ))}
              {priced.length === 0 && <Typography variant="caption" color="text.secondary">No services chosen yet.</Typography>}
            </Stack>
            <Divider sx={{ my: 1.5 }} />
            <Row left="Total" right={total === null ? 'Priced by a quote' : `${formatMoney(total)}/month`} bold />
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
              Free for 7 days. Your card is charged from day 8.
            </Typography>
            {labQuoted && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                Electronic lab interface is quoted separately and is not in this total.
              </Typography>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

const Row = ({ left, right, muted, bold }) => (
  <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
    <Typography variant="body2" color={muted ? 'text.secondary' : 'text.primary'} fontWeight={bold ? 700 : 400}>{left}</Typography>
    <Typography variant="body2" color={muted ? 'text.secondary' : 'text.primary'} fontWeight={bold ? 700 : 400} sx={{ whiteSpace: 'nowrap' }}>{right}</Typography>
  </Box>
);

export default ServicesPicker;
