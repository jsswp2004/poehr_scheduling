/*
 * POWER Pricing Page
 *
 * Pricing is one flat base price for every organization. The first service is included and each further
 * service adds the same amount. The plan (Professional, Clinic, Group) only sets how many people can sign in.
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
  BASE_PRICE,
  EXTRA_MODULE_PRICE,
  GROUP_ORDER,
  formatMoney,
  monthlyTotal,
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
  ],
  orders_labs: [
    "Place, sign and cosign orders, with order sets",
    "Nurse task list built from medication orders",
    "Enter and review lab results with trend views",
    "Full history on every order and result",
  ],
  prescriptions_referrals: [
    "Write and sign prescriptions for non-controlled drugs; print or record a fax",
    "Pharmacy list, favorites and renewals",
    "Referral tracking from sent to report received, with overdue timers",
  ],
  triage_boards: [
    "ESI triage note with a suggested level and the reasons",
    "Suicide-risk screening with a safety alert",
    "Live emergency department board and a follow-up board",
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
  { title: "Nursing home staffing", services: "Staffing and coverage", count: 1 },
  { title: "Staffing with resident and family texts", services: "Staffing + Communicator", count: 2 },
  { title: "Small clinic", services: "Scheduling + Clinical documentation + Orders and labs", count: 3 },
];

const INCLUDED_EVERYWHERE = [
  "Reports: build, save, share and export reports to PDF or CSV",
  "Secure staff messaging",
  "Role-based access you can adjust for each person",
  "7-day free trial; your card is charged from day 8",
  "Change your services at any time",
];

export const PricingPage = ({ className }) => {
  const [catalog, setCatalog] = useState({ plans: [], modules: [] });
  const [error, setError] = useState(false);
  const [selected, setSelected] = useState([]);
  const [open, setOpen] = useState({});

  useEffect(() => {
    let alive = true;
    axios
      .get(`${API_BASE_URL}/api/users/modules/`)
      .then((r) => alive && setCatalog({ plans: r.data.plans || [], modules: r.data.modules || [] }))
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

  const priced = pricedModules(selected, catalog.modules);
  const extras = Math.max(0, priced.length - 1);
  const total = monthlyTotal(selected, catalog.modules);
  const labQuoted = selected.some((c) => catalog.modules.find((m) => m.code === c)?.quoted);
  const planByKey = Object.fromEntries(catalog.plans.map((p) => [p.key, p]));
  const limitFor = (key, fallback) => userLimitLabel(planByKey[key] ? planByKey[key].user_limit : fallback);

  return (
    <div className={"pricing-page " + (className || "")}>
      <Header />

      <div className="pricing-page-header">
        <div className="page-title-section">
          <h1 className="page-title">One price. Pick the services your team uses.</h1>
          <p className="page-subtitle">
            Every organization pays {formatMoney(BASE_PRICE)} a month with its first service included. Each additional
            service adds {formatMoney(EXTRA_MODULE_PRICE)}. Reports are free.
          </p>
        </div>
      </div>

      <div className="pricing-section">
      <div className="pp-section">
        <h2 className="pp-heading">1. Choose your services</h2>
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
            <div className="pp-big">{formatMoney(total)}</div>
            <div className="pp-row">
              <span>Base, first service included</span>
              <span>{formatMoney(BASE_PRICE)}</span>
            </div>
            <div className="pp-row">
              <span>Additional services ({extras})</span>
              <span>{formatMoney(EXTRA_MODULE_PRICE * extras)}</span>
            </div>
            <div className="pp-row">
              <span>Reports</span>
              <span className="pp-tag pp-free">Free</span>
            </div>
            {labQuoted && (
              <div className="pp-note">Electronic lab interface is set up by arrangement and quoted separately.</div>
            )}
            <a className="btn-panel" href="#pricing-plans">
              Continue to plan
            </a>
          </aside>
        </div>

        <h2 className="pp-heading" id="pricing-plans">
          2. Choose how many people sign in
        </h2>
        <div className="pp-plans">
          <div className="pp-plan">
            <h3>Professional</h3>
            <div className="pp-users">{limitFor("basic", 1)}</div>
            <p>For a solo provider or manager, with the services you picked.</p>
            <Link to="/enroll?plan=personal&tier=basic" className="btn-panel">
              Start free trial
            </Link>
          </div>
          <div className="pp-plan">
            <h3>Clinic</h3>
            <div className="pp-users">{limitFor("premium", 10)}</div>
            <p>For a clinic, unit or small facility, with the services you picked.</p>
            <Link to="/enroll?plan=clinic&tier=premium" className="btn-panel">
              Start free trial
            </Link>
          </div>
          <div className="pp-plan">
            <h3>Group</h3>
            <div className="pp-users">{limitFor("enterprise", 999999)}</div>
            <p>For larger organizations and multiple sites. Priced by a quote based on your size.</p>
            <Link to="/contact" className="btn-panel">
              Contact sales
            </Link>
          </div>
        </div>
        <p className="pp-note">The plan changes only the number of users. The price comes from the services you pick.</p>

        <h2 className="pp-heading">Examples</h2>
        <div className="pp-examples">
          {EXAMPLES.map((e) => (
            <div key={e.title}>
              <b>{e.title}</b>
              <span>{e.services}</span>
              <span className="pp-example-price">
                {formatMoney(BASE_PRICE + EXTRA_MODULE_PRICE * (e.count - 1))} / month
              </span>
            </div>
          ))}
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
