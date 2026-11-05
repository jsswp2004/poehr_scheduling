import '../DataSecurityPage/DataSecurityPage.css';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';

// Only statements that are true of the product today. Keep it that way: no certifications, SLAs or compliance
// claims unless they have been confirmed (and, for compliance wording, reviewed by counsel).
const SAFEGUARDS = [
  {
    title: 'Encrypted',
    text: 'HTTPS in transit. Database encrypted at rest by our hosting provider.',
    icon: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
  },
  {
    title: 'Separate by organization',
    text: "Each organization's data is kept apart from every other organization's.",
    icon: (
      <>
        <path d="M4 7h16M4 12h16M4 17h16" />
        <circle cx="8" cy="7" r="1.5" />
        <circle cx="15" cy="12" r="1.5" />
        <circle cx="10" cy="17" r="1.5" />
      </>
    ),
  },
  {
    title: 'Role-based access',
    text: "Rights follow each person's role, and administrators can adjust them.",
    icon: (
      <>
        <circle cx="12" cy="8" r="3.5" />
        <path d="M5 20c0-4 3-6 7-6s7 2 7 6" />
      </>
    ),
  },
  {
    title: 'Audit history',
    text: 'On key actions: orders, lab results, prescriptions, referrals, messaging and staffing.',
    icon: (
      <>
        <path d="M6 3h9l4 4v14H6z" />
        <path d="M9 12h7M9 16h7" />
      </>
    ),
  },
];

const VENDORS = [
  ['Render', 'Application and database hosting'],
  ['Vercel', 'Delivering the web app'],
  ['Twilio', 'Text messages (Communicator and shift reminders)'],
  ['Resend', 'Email'],
  ['Amazon Web Services', 'Video visits, dictation and the documentation assistant, when you turn them on'],
  ['Stripe', 'Subscription payments'],
];

export const DataSecurityPage = ({ className }) => {
  return (
    <div className={`data-security-page ${className || ''}`}>
      <Header />
      <div className="page-title-section">
        <h1 className="page-title">Data Security & Privacy</h1>
        <p className="page-subtitle">How POWER protects your information, and who handles it.</p>
      </div>

      <div className="ds-body">
        <div className="ds-tiles">
          {SAFEGUARDS.map((s) => (
            <div className="ds-tile" key={s.title}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {s.icon}
              </svg>
              <b>{s.title}</b>
              <span>{s.text}</span>
            </div>
          ))}
        </div>

        <div className="ds-sect">
          <div>
            <div className="ds-eyebrow">Hosting</div>
            <h2 className="section-heading">Cloud hosting</h2>
          </div>
          <div>
            <p className="section-text">
              POWER runs on Render, which hosts the application and database, and Vercel, which serves the web app. Your data is stored in the United States.
            </p>
          </div>
        </div>

        <div className="ds-sect">
          <div>
            <div className="ds-eyebrow">Ownership</div>
            <h2 className="section-heading">Your data, your control</h2>
          </div>
          <div>
            <p className="section-text">
              We do not sell your patient information, and we use it only to provide our services. Administrators can export the organization's data from the Account page, close the account, or delete the organization.
            </p>
            <p className="section-text">
              Healthcare records can be subject to retention rules, so contact us before deleting records you may need to keep.
            </p>
          </div>
        </div>

        <div className="ds-sect">
          <div>
            <div className="ds-eyebrow">Vendors</div>
            <h2 className="section-heading">Who handles your data</h2>
          </div>
          <div className="ds-tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Used for</th>
                </tr>
              </thead>
              <tbody>
                {VENDORS.map(([name, use]) => (
                  <tr key={name}>
                    <td>{name}</td>
                    <td>{use}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ds-contact">
          <div>
            <b>Questions about security?</b>
            <p>Need a business associate agreement? Ask before you store patient information in POWER.</p>
          </div>
          <a href="mailto:power@powerhealthit.com">power@powerhealthit.com</a>
        </div>
        <p className="ds-small">
          <Link to="/privacy">Privacy policy</Link>
        </p>
      </div>
      <Footer pricingLink="/pricing" featuresLink="/features" />
    </div>
  );
};

export default DataSecurityPage;
