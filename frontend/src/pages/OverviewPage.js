import "../OverviewPage/OverviewPage.css";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import Footer from "../components/Footer";
import schedulerImage from "../assets/dashboard_scheduling.jpg";
import communicatorImage from "../assets/communicator.png";
import portalImage from "../assets/Portal.png";
import documentationImage from "../assets/documentation.png";
import staffingImage from "../assets/dashboard_clinician.png";
import telehealthImage from "../assets/telehealth.jpg";
import dictationImage from "../assets/dictation.jpg";

// Every service, grouped the same way as the Pricing page. Descriptions and bullets say only what the product
// does today (the same list the Pricing page uses).
const GROUPS = [
  {
    name: "Clinical",
    panels: [
      {
        title: "POWER Patient Portal",
        image: portalImage,
        alt: "POWER Patient Portal interface",
        description:
          "Patients sign in, see their information and ask for visits, with an easy, clear experience.",
        highlights: [
          ["📅", "Appointment requests that staff approve or deny"],
          ["📢", "Announcements for patients and staff"],
          ["🔔", "Text and email preferences with opt-out"],
          ["👤", "Patients see and update their own information"],
        ],
      },
      {
        title: "POWER Notes",
        image: documentationImage,
        alt: "POWER Notes clinical documentation interface",
        description:
          "Clinical notes and charting, with orders, results and prescriptions together in one place.",
        highlights: [
          ["📝", "Admission, triage, ambulatory, progress and nursing notes"],
          ["📈", "Flowsheets, growth charts and vaccine schedules"],
          ["🧪", "Orders and lab results, prescriptions and referrals"],
          ["🚑", "Triage and live status boards, plus builders for your own forms"],
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
        ai: {
          title: "Ask the AI assistant about your schedule",
          text: "Ask who is waiting for approval. It can prepare an approval, a denial, an arrival or a no-show. Nothing changes until you confirm.",
        },
        description:
          "Appointments, provider availability and check-in, with automatic reminders to patients.",
        highlights: [
          ["📅", "Daily, weekly and monthly recurring appointments"],
          ["⏰", "Provider availability, holidays and clinic events"],
          ["✅", "Patient requests, check-in and no-show tracking"],
          ["📤", "CSV upload for availability, events and patients"],
        ],
      },
      {
        title: "POWER Staffing",
        image: staffingImage,
        alt: "POWER Staffing dashboard",
        audience: "Built for skilled nursing facilities, rehabilitation centers, clinics and hospitals.",
        ai: {
          title: "Ask the AI assistant",
          text: "Ask who is working tonight or whether next week is covered. It answers from your roster, and staff can ask about their own schedule. It can prepare a time-off request or a call-out; nothing is sent until you confirm.",
        },
        description:
          "Duty rosters for nurses and physicians, with coverage kept visible at a glance.",
        highlights: [
          ["🗓️", "Roster, units and recurring shift patterns"],
          ["📊", "Coverage against your staffing requirements"],
          ["👩‍⚕️", "Time off, call-outs and shift pick-up"],
          ["📄", "Daily staffing reports and shift reminders"],
        ],
      },
      {
        title: "POWER Communicator",
        image: communicatorImage,
        alt: "POWER Communicator interface",
        ai: {
          title: "Ask the AI assistant about your contacts and messages",
          text: "Ask who has opted out of texts. It can prepare a text, an email or a new contact. Nothing is sent until you confirm.",
        },
        description:
          "Text and email updates to patients, with consent and opt-outs handled.",
        highlights: [
          ["📱", "Bulk text and email to a contact list"],
          ["🔔", "Automatic appointment reminders"],
          ["🔒", "Consent and opt-out handling for texts"],
          ["📋", "Message log of what was sent or blocked"],
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
        description: "Speak into a note instead of typing.",
        highlights: [
          ["🎙️", "US English medical dictation"],
          ["✨", "Optional AI clean-up that you review and accept field by field"],
          ["🔐", "Audio is not stored by POWER"],
        ],
      },
    ],
  },
];

const INCLUDED = [
  "AI assistants in Scheduler, Staffing and Communicator, with a free monthly amount of questions",
  "Reports: build, save, share and export to PDF or CSV",
  "Secure staff messaging",
  "Role-based access you can adjust for each person",
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
                  {p.ai && <span className="ai-tag">AI assistant</span>}
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
        <button type="button" className="included-cta" onClick={() => navigate("/pricing")}>
          See pricing
        </button>
      </section>

      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default OverviewPage;
