/*
 * POWER Pricing Page
 *
 * Pricing is by plan: Professional is $299 with one service included, Clinic is $599 with two, each further
 * service is $150, and Group is priced by a quote. Texts and emails are billed separately by volume.
 * Services, descriptions and prices come from the server's catalog (/api/users/modules/) so this page cannot
 * drift from what is billed; the capability bullets below describe what each service does today.
 */
import "../PricingPage/PricingPage.css";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { API_BASE_URL } from "../config/api";
import {
  EXTRA_MODULE_PRICE,
  GROUP_ORDER,
  formatMoney,
  planMonthlyTotal,
  planTerms,
  pricedModules,
  userLimitLabel,
} from "../utils/modulePricing";

// What each service does today, in plain words. Keep these to things the product really does.
const CAPABILITIES = {
  patient_portal: [
    "Patients sign in, see and update their information",
    "Patients request appointments; staff approve or deny",
    "Announcements for patients and staff",
    "Text and email preferences with opt-out",
  ],
  clinical_documentation: [
    "Ready-made admission, triage, ambulatory, progress and nursing notes",
    "Note and flowsheet builders for your own forms",
    "Vital signs and intake and output flowsheets",
    "Growth charts and vaccine schedules",
    "Problem list, home medications and allergies",
    "Signed notes lock; changes are added as addenda",
    "Place, sign and cosign orders, with order sets and a nurse task list",
    "Enter and review lab results with trend views",
    "Prescriptions for non-controlled drugs, with a pharmacy list and renewals",
    "Referral tracking from sent to report received, with overdue timers",
    "ESI triage with a suggested level, suicide-risk screening, and live emergency department and follow-up boards",
    "Status board builder for views you design",
  ],
  scheduling: [
    "Calendar with daily, weekly and monthly recurring appointments",
    "Provider availability, holidays and clinic events",
    "Patient requests, check-in and no-show tracking",
    "CSV upload for availability, events and patients",
  ],
  staffing: [
    "Roster, units and recurring shift patterns",
    "Coverage status against your staffing requirements, including hours per patient day",
    "Time-off requests, call-outs and shift pick-up",
    "Shift reminders by text and email",
    "Daily staffing report PDFs and scheduled report emails",
  ],
  communicator: [
    "Bulk text and email to a contact list",
    "Automatic appointment reminders",
    "Consent and opt-out handling for texts",
    "Message log showing what was sent or blocked",
  ],
  telehealth: [
    "Video visits; patients join from a link, no account needed",
    "Waiting room; the provider admits the patient",
    "No recording, with an audit log of every session",
  ],
  dictation: [
    "Speak into a note (US English medical dictation)",
    "Optional AI clean-up that you review and accept field by field",
    "Audio is not stored by POWER",
  ],
  lab_interface: [
    "Receive results by HL7 v2 or FHIR R4 over HTTPS",
    "Send lab orders to your lab's interface engine",
    "Results that cannot be matched wait for staff to file",
  ],
};

const EXAMPLES = [
  { title: "Solo provider", plan: "basic", services: "Professional with Scheduling", count: 1 },
  { title: "Small clinic", plan: "premium", services: "Clinic with Scheduling + Clinical Notes", count: 2 },
  { title: "Clinic with portal", plan: "premium", services: "Clinic with Clinical Notes + Patient Portal + Scheduling", count: 3 },
];

const INCLUDED_EVERYWHERE = [
  "Reports: build, save, share and export reports to PDF or CSV",
  "AI assistants in Scheduler, Staffing and Communicator, with a free monthly amount of questions",
  "Secure staff messaging",
  "Role-based access you can adjust for each person",
  "7-day free trial; your card is charged from day 8",
  "Change your services at any time",
];

const PLAN_CARDS = [
  { key: "basic", name: "Professional", blurb: "For a solo provider or manager.", to: "/enroll?plan=personal&tier=basic" },
  { key: "premium", name: "Clinic", blurb: "For a clinic, unit or small facility.", to: "/enroll?plan=clinic&tier=premium" },
  { key: "enterprise", name: "Group", blurb: "For larger organizations and multiple sites. Priced by a quote based on your size.", to: "/contact" },
];

const fmtAmount = (n) => (n === null || n === undefined ? "Unlimited" : Number(n).toLocaleString("en-US"));
const fmtRate = (n) => `$${Number(n).toFixed(2)}`;

export const PricingPage = ({ className }) => {
  const [catalog, setCatalog] = useState({ plans: [], modules: [], planPricing: null, messaging: null, assistants: null });
  const [error, setError] = useState(false);
  const [plan, setPlan] = useState("basic");
  const [selected, setSelected] = useState([]);
  const [open, setOpen] = useState({});

  useEffect(() => {
    let alive = true;
    axios
      .get(`${API_BASE_URL}/api/users/modules/`)
      .then(
        (r) =>
          alive &&
          setCatalog({
            plans: r.data.plans || [],
            modules: r.data.modules || [],
            planPricing: r.data.pricing?.plans || null,
            messaging: r.data.pricing?.messaging || null,
            assistants: r.data.pricing?.assistants || null,
          })
      )
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (code) =>
    setSelected((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  const groups = useMemo(
    () =>
      GROUP_ORDER.map((g) => ({ name: g, items: catalog.modules.filter((m) => m.group === g) })).filter(
        (g) => g.items.length > 0
      ),
    [catalog.modules]
  );

  const terms = planTerms(catalog.planPricing, plan);
  const priced = pricedModules(selected, catalog.modules);
  const extras = Math.max(0, priced.length - terms.included);
  const total = planMonthlyTotal(selected, catalog.modules, catalog.planPricing, plan);
  const labQuoted = selected.some((c) => catalog.modules.find((m) => m.code === c)?.quoted);
  const planByKey = Object.fromEntries(catalog.plans.map((p) => [p.key, p]));
  const limitFor = (key, fallback) => userLimitLabel(planByKey[key] ? planByKey[key].user_limit : fallback);
  const cta = PLAN_CARDS.find((c) => c.key === plan);
  const msg = catalog.messaging;
  const ai = catalog.assistants;

  return (
    <div className={"pricing-page " + (className || "")}>
      <Header />

      <div className="pricing-page-header">
        <div className="page-title-section">
          <h1 className="page-title">Pick your plan, then the services your team uses.</h1>
          <p className="page-subtitle">
            Professional is {formatMoney(planTerms(catalog.planPricing, "basic").base)} a month for one person with one
            service. Clinic is {formatMoney(planTerms(catalog.planPricing, "premium").base)} a month for up to 10
            people with two services. Each additional service is {formatMoney(EXTRA_MODULE_PRICE)}. Reports are free
            with every plan.
          </p>
        </div>
      </div>

      <div className="pricing-section">
      <div className="pp-section">
        <h2 className="pp-heading" id="pricing-plans">1. Choose your plan</h2>
        <div className="pp-plans" role="radiogroup" aria-label="Plan">
          {PLAN_CARDS.map((c) => {
            const t = planTerms(catalog.planPricing, c.key);
            return (
              <label key={c.key} className={"pp-plan pp-plan-pick" + (plan === c.key ? " pp-plan-selected" : "")}>
                <input
                  type="radio"
                  name="plan"
                  value={c.key}
                  checked={plan === c.key}
                  onChange={() => setPlan(c.key)}
                />
                <h3>{c.name}</h3>
                <div className="pp-users">{limitFor(c.key, c.key === "basic" ? 1 : c.key === "premium" ? 10 : 999999)}</div>
                <div className="pp-plan-price">
                  {t.quoted ? "Quote" : formatMoney(t.base)}
                  {!t.quoted && <small> / month</small>}
                </div>
                <p>
                  {t.quoted
                    ? c.blurb
                    : `Includes ${t.included} service${t.included === 1 ? "" : "s"}. Each additional service is ${formatMoney(EXTRA_MODULE_PRICE)}. ${c.blurb}`}
                </p>
              </label>
            );
          })}
        </div>

        <h2 className="pp-heading">2. Choose your services</h2>
        {error && <p className="pp-note">The service list could not be loaded. Please refresh the page.</p>}
        <div className="pp-builder">
          <div className="pp-groups">
            {groups.map((g) => (
              <div className="pp-group" key={g.name}>
                <h3>{g.name}</h3>
                {g.items.map((m) => {
                  const id = `svc-${m.code}`;
                  const caps = CAPABILITIES[m.code] || [];
                  return (
                    <div className="pp-svc" key={m.code}>
                      <label htmlFor={id} className="pp-svc-row">
                        <input
                          id={id}
                          type="checkbox"
                          checked={selected.includes(m.code)}
                          onChange={() => toggle(m.code)}
                        />
                        <span>
                          <b>{m.label}</b>
                          <span className="pp-desc">{m.description}</span>
                        </span>
                        {m.quoted && <span className="pp-tag">Quoted separately</span>}
                      </label>
                      {caps.length > 0 && (
                        <>
                          <button
                            type="button"
                            className="pp-more"
                            aria-expanded={!!open[m.code]}
                            onClick={() => setOpen((o) => ({ ...o, [m.code]: !o[m.code] }))}
                          >
                            {open[m.code] ? "Hide what is included" : "See what is included"}
                          </button>
                          {open[m.code] && (
                            <ul className="pp-caps">
                              {caps.map((c) => (
                                <li key={c}>{c}</li>
                              ))}
                            </ul>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <aside className="pp-total" aria-live="polite">
            <div className="pp-note">Your monthly price</div>
            <div className="pp-big">{total === null ? "Quote" : formatMoney(total)}</div>
            {total !== null && (
              <>
                <div className="pp-row">
                  <span>
                    {cta.name}, {terms.included} service{terms.included === 1 ? "" : "s"} included
                  </span>
                  <span>{formatMoney(terms.base)}</span>
                </div>
                <div className="pp-row">
                  <span>Additional services ({extras})</span>
                  <span>{formatMoney(EXTRA_MODULE_PRICE * extras)}</span>
                </div>
              </>
            )}
            <div className="pp-row">
              <span>Reports</span>
              <span className="pp-tag pp-free">Free</span>
            </div>
            {labQuoted && (
              <div className="pp-note">Electronic lab interface is set up by arrangement and quoted separately.</div>
            )}
            <div className="pp-note">Texts, emails and AI assistant questions over your plan's free amount are billed by volume. See below.</div>
            <Link to={cta.to} className="btn-panel">
              {plan === "enterprise" ? "Contact sales" : "Start free trial"}
            </Link>
          </aside>
        </div>

        {msg && (
          <>
            <h2 className="pp-heading">Texts and emails</h2>
            <div className="pp-examples">
              {PLAN_CARDS.map((c) => {
                const a = msg.allowances?.[c.key] || {};
                const unlimited = a.email === null && a.sms === null;
                return (
                  <div key={c.key}>
                    <b>{c.name}</b>
                    <span>
                      {unlimited
                        ? "Included in your quote"
                        : `${fmtAmount(a.email)} emails and ${fmtAmount(a.sms)} texts included each month`}
                    </span>
                    <span className="pp-example-price">
                      {unlimited
                        ? "Unlimited"
                        : `${fmtRate(msg.rates.email)} per email, ${fmtRate(msg.rates.sms)} per text after`}
                    </span>
                  </div>
                );
              })}
            </div>
            <p className="pp-note">
              Reminders and messages use texts and emails. You are billed monthly for what goes over your plan's
              amount, on the same invoice as your subscription.
            </p>
          </>
        )}

        {ai && (
          <>
            <h2 className="pp-heading">AI assistants</h2>
            <div className="pp-examples">
              {PLAN_CARDS.map((c) => {
                const free = ai.allowances?.[c.key];
                return (
                  <div key={c.key}>
                    <b>{c.name}</b>
                    <span>{fmtAmount(free)} questions included each month</span>
                    <span className="pp-example-price">{fmtRate(ai.rate)} per question after</span>
                  </div>
                );
              })}
            </div>
            <p className="pp-note">
              The Scheduler, Staffing and Communicator assistants come with those services in every plan. You are
              billed monthly for questions over your plan's amount, on the same invoice as your subscription. A
              question that fails is never counted, and neither is confirming an action the assistant prepared.
            </p>
          </>
        )}

        <h2 className="pp-heading">Examples</h2>
        <div className="pp-examples">
          {EXAMPLES.map((e) => {
            const t = planTerms(catalog.planPricing, e.plan);
            return (
              <div key={e.title}>
                <b>{e.title}</b>
                <span>{e.services}</span>
                <span className="pp-example-price">
                  {formatMoney(t.base + EXTRA_MODULE_PRICE * Math.max(0, e.count - t.included))} / month
                </span>
              </div>
            );
          })}
        </div>

        <h2 className="pp-heading">Included with every plan</h2>
        <ul className="pp-included">
          {INCLUDED_EVERYWHERE.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
      </div>
      </div>

      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default PricingPage;
