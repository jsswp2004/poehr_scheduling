import "../OverviewPage/OverviewPage.css";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import schedulerImage from "../assets/dashboard_scheduling.jpg";
import communicatorImage from "../assets/communicator.png";
import portalImage from "../assets/Portal.png";
import documentationImage from "../assets/documentation.png";
import registrationImage from "../assets/registration.jpg";
import staffingImage from "../assets/dashboard_clinician.png";
import telehealthImage from "../assets/telehealth.jpg";
import dictationImage from "../assets/dictation.jpg";
import mdsImage from "../assets/mds.jpg";
import surgeryImage from "../assets/surgery.jpg";

// Every service, grouped the same way as the Pricing page. Descriptions and bullets say only what the product
// does today (the same list the Pricing page uses). Each panel: who it is for, what it does, three highlights.
const AUDIENCES = ["Clinics", "Skilled nursing facilities", "Hospitals"];

const GROUPS = [
  {
    name: "Clinical",
    panels: [
      {
        title: "POWER Patient Portal",
        image: portalImage,
        alt: "POWER Patient Portal interface",
        audience: "For patients and the staff who serve them",
        description: "Patients sign in, see their information and ask for visits.",
        highlights: [
          ["👤", "Patients see and update their own information"],
          ["📅", "Appointment requests that staff approve or deny"],
          ["📢", "Announcements, with text and email opt-out"],
        ],
      },
      {
        title: "POWER Registration",
        image: registrationImage,
        alt: "POWER Registration workspace",
        audience: "For front-desk and registration staff",
        description: "Register patients at the front desk, quickly or step by step. Works alone or with Notes.",
        highlights: [
          ["⚡", "Quick register with a duplicate check"],
          ["🧾", "Registration steps you choose and order"],
          ["👶", "Newborn registration and numbered receipts"],
        ],
      },
      {
        title: "POWER Notes",
        image: documentationImage,
        alt: "POWER Notes clinical documentation interface",
        audience: "For physicians, nurses and clinical staff",
        description: "Notes, orders and results together in one chart.",
        highlights: [
          ["📝", "Admission, triage, progress and nursing notes, plus flowsheets"],
          ["🧪", "Orders, lab results, prescriptions and referrals"],
          ["🚑", "Builders for your own forms and status boards"],
        ],
      },
      {
        title: "POWER Surgery",
        image: surgeryImage,
        alt: "POWER Surgery case list and day planner",
        audience: "For OR schedulers and charge nurses",
        description: "Run the day\u2019s operating-room cases from schedule to charges.",
        highlights: [
          ["📋", "Case List, Day Planner and a live Status Board"],
          ["🩺", "Procedures, team, case times and supplies used"],
          ["💲", "Charges from your own policies, plus case documents"],
        ],
      },
    ],
  },
  {
    name: "Operations",
    panels: [
      {
        title: "POWER Scheduler",
        image: schedulerImage,
        alt: "POWER Scheduler dashboard",
        audience: "For clinics and hospital departments",
        ai: {
          title: "Ask: who is waiting for approval?",
          text: "It can prepare an approval, denial, arrival or no-show. Nothing changes until you confirm.",
        },
        description: "Appointments, availability and check-in, with automatic reminders.",
        highlights: [
          ["📅", "Recurring appointments and provider availability"],
          ["✅", "Patient requests, check-in and no-show tracking"],
          ["📤", "CSV upload for availability, events and patients"],
        ],
      },
      {
        title: "POWER Staffing",
        image: staffingImage,
        alt: "POWER Staffing dashboard",
        audience: "For skilled nursing facilities, rehabilitation centers, clinics and hospitals",
        ai: {
          title: "Ask: who is working tonight?",
          text: "It answers from your roster and can prepare a time-off request or call-out. Nothing is sent until you confirm.",
        },
        description: "Duty rosters for nurses and physicians, with coverage visible at a glance.",
        highlights: [
          ["🗓️", "Roster, units and recurring shift patterns"],
          ["📊", "Coverage against your staffing requirements"],
          ["👩‍⚕️", "Time off, call-outs and shift reminders"],
        ],
      },
      {
        title: "POWER Communicator",
        image: communicatorImage,
        alt: "POWER Communicator interface",
        audience: "For front desks and care teams",
        ai: {
          title: "Ask: who has opted out of texts?",
          text: "It can prepare a text, an email or a new contact. Nothing is sent until you confirm.",
        },
        description: "Text and email updates to patients, with consent and opt-outs handled.",
        highlights: [
          ["📱", "Bulk text and email to a contact list"],
          ["🔔", "Automatic appointment reminders"],
          ["📋", "Opt-outs handled, with a log of what was sent"],
        ],
      },
    ],
  },
  {
    name: "Add-ons",
    panels: [
      {
        title: "POWER Telehealth",
        image: telehealthImage,
        alt: "POWER Telehealth video visit",
        audience: "For providers and their patients",
        description: "Video visits that patients join from a link.",
        highlights: [
          ["🎥", "No account needed for the patient"],
          ["🚪", "Waiting room; the provider admits the patient"],
          ["🛡️", "No recording, with an audit log of every session"],
        ],
      },
      {
        title: "POWER Dictate",
        image: dictationImage,
        alt: "POWER Dictate voice dictation",
        audience: "For physicians and nurses who write notes",
        description: "Speak into a note instead of typing.",
        highlights: [
          ["🎙️", "US English medical dictation"],
          ["✨", "Optional AI clean-up that you review and accept"],
          ["🔐", "Audio is not stored by POWER"],
        ],
      },
      {
        title: "POWER MDS",
        image: mdsImage,
        alt: "POWER MDS coding workspace",
        audience: "For MDS coordinators in skilled nursing facilities",
        ai: {
          title: "Ask: which documents do I need to code?",
          text: "It answers from the open assessment. It only reads; it never changes, signs or prints anything.",
        },
        description: "A coding guide for MDS 3.0. You still enter the MDS in your own system.",
        highlights: [
          ["📋", "Suggested answers with the chart pages that support them"],
          ["💰", "Validation checks, PDPM and HIPPS results"],
          ["🔒", "Names removed in your browser; working copies deleted automatically"],
        ],
      },
    ],
  },
];

const INCLUDED = [
  "AI assistants in Scheduler, Staffing, Communicator and MDS, with a free monthly amount of questions",
  "Reports: build, save, share and export to PDF or CSV",
  "Secure staff messaging",
  "Role-based access you can adjust for each person",
  "A 7-day free trial, and change your services at any time",
];

export const OverviewPage = ({ className }) => {
  const navigate = useNavigate();
  return (
    <div className={`overview-page ${className || ""}`}>
      <Header />

      <div className="page-title-section">
        <h2 className="page-title">
          Discover the complete POWER healthcare management suite
        </h2>
        <p className="page-tagline">One platform for your clinic, nursing home or hospital</p>
        <p className="page-subtitle">
          Choose only the services you need. They share one sign-in, and you can change your services at any time.
        </p>
        <ul className="audience-chips" aria-label="Who POWER is for">
          {AUDIENCES.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </div>

      {GROUPS.map((group) => (
        <section key={group.name} aria-labelledby={`ov-${group.name}`}>
          <h3 className="group-heading" id={`ov-${group.name}`}>
            {group.name}
          </h3>
          <div className={`three-panel-layout cols-${group.panels.length}`}>
            {group.panels.map((p) => (
              <div className="application-panel" key={p.title}>
                <div className="panel-image">
                  <img src={p.image} alt={p.alt} className="app-image" />
                </div>
                <div className="panel-content">
                  <h2 className="app-title">{p.title}</h2>
                  {p.ai && <span className="ai-tag">With AI Assistant</span>}
                  {p.audience && <p className="app-audience">{p.audience}</p>}
                  <p className="app-description">{p.description}</p>
                  <div className="feature-highlights">
                    {p.highlights.map(([icon, text]) => (
                      <div className="highlight-item" key={text}>
                        <span className="highlight-icon">{icon}</span>
                        <span className="highlight-text">{text}</span>
                      </div>
                    ))}
                  </div>
                  {p.ai && (
                    <div className="ai-box">
                      <strong>{p.ai.title}</strong>
                      <span>{p.ai.text}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}

      <section className="included-section" aria-labelledby="ov-included">
        <h3 className="group-heading" id="ov-included">
          Included with every plan
        </h3>
        <ul className="included-list">
          {INCLUDED.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="included-cta-text">
          Pay for the services you use. Start with a 7-day free trial.
        </p>
        <div className="included-actions">
          <button type="button" className="included-cta" onClick={() => navigate("/pricing")}>
            See pricing
          </button>
          <button type="button" className="included-cta included-cta-outline" onClick={() => navigate("/contact")}>
            Talk to us
          </button>
        </div>
        <button type="button" className="included-link" onClick={() => navigate("/security")}>
          How we protect your data
        </button>
      </section>

      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default OverviewPage;
