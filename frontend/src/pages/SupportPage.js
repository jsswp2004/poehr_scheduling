import React from 'react';
import { LegalPage } from '../components/LegalPage';
import '../SupportPage/SupportPage.css';

const icon = (paths) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    {paths.map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
);

const BEFORE = [
  {
    title: 'Organization',
    icon: ['M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6'],
    items: ['Organization name and type', 'Business address', 'Contact information'],
  },
  {
    title: 'Administrator',
    icon: ['M12 4a4 4 0 100 8 4 4 0 000-8z', 'M4 21c0-4 4-6 8-6s8 2 8 6'],
    items: ['Your name, email and phone', 'A username and a strong password', 'You become the main administrator'],
  },
  {
    title: 'Payment card',
    icon: ['M5 6h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z', 'M3 11h18'],
    items: ['Credit or debit card', 'Free for 7 days; charged from day 8', 'Services chosen on the Pricing page'],
  },
];

const AFTER = [
  {
    title: 'Set up',
    icon: ['M12 9a3 3 0 100 6 3 3 0 000-6z', 'M12 2v3M12 19v3M2 12h3M19 12h3'],
    items: [
      'Default blocked days: set and save',
      'Holidays: load the year or add by hand',
      'Organization: upload a logo, create clinics',
    ],
  },
  {
    title: 'Try it out',
    icon: ['M5 12l4 4 10-10'],
    items: ['Create a test appointment', 'Send a test reminder', 'Explore the dashboard'],
  },
  {
    title: 'Good habits',
    icon: ['M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z'],
    items: ['Keep contact information current', 'Review user permissions regularly', 'Start with a small pilot group'],
  },
];

const FIELDS = [
  'Organization name, type and address',
  'First name, last name, username',
  'Email and phone number',
  'Password: at least 8 characters, with upper and lower case letters, numbers and symbols',
];

const Tiles = ({ tiles }) => (
  <div className="sp-tiles">
    {tiles.map((t) => (
      <div className="sp-tile" key={t.title}>
        {icon(t.icon)}
        <h3>{t.title}</h3>
        <ul>
          {t.items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </div>
    ))}
  </div>
);

const SupportPage = () => (
  <LegalPage
    title="Getting started with POWER"
    subtitle="How to register your organization, set it up, and reach us when you need help."
  >
    <section className="sp-section">
      <h2>Before you start</h2>
      <p className="sp-sub">Have these ready. Registration takes a few minutes.</p>
      <Tiles tiles={BEFORE} />
    </section>

    <section className="sp-section">
      <h2>Register in four steps</h2>
      <p className="sp-sub">The steps match the sign-up form.</p>
      <div className="sp-steps">
        <div className="sp-step">
          <div className="sp-num">1</div>
          <div>
            <h3>Start</h3>
            <p>Go to powerhealthit.com and choose Try it now, or pick a plan on the Pricing page.</p>
          </div>
        </div>
        <div className="sp-step">
          <div className="sp-num">2</div>
          <div>
            <h3>Account details</h3>
            <p>Organization, administrator and login information.</p>
            <details>
              <summary>See every field</summary>
              <ul>
                {FIELDS.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </details>
          </div>
        </div>
        <div className="sp-step">
          <div className="sp-num">3</div>
          <div>
            <h3>Plan and services</h3>
            <p>Pick how many people sign in, then the services you use. The total updates as you choose.</p>
          </div>
        </div>
        <div className="sp-step">
          <div className="sp-num">4</div>
          <div>
            <h3>Payment and confirmation</h3>
            <p>
              Enter your card, review, and complete enrollment. Your 7-day free trial starts, and you are taken to the
              login screen.
            </p>
          </div>
        </div>
      </div>
    </section>

    <section className="sp-section">
      <h2>After you register</h2>
      <p className="sp-sub">A short list to get your team working.</p>
      <Tiles tiles={AFTER} />
    </section>

    <section className="sp-section">
      <h2>Contact us</h2>
      <p className="sp-sub">Questions about registration, billing or setup.</p>
      <div className="sp-contact">
        <div>
          <h3>Email</h3>
          <a href="mailto:power@powerhealthit.com">power@powerhealthit.com</a>
        </div>
        <div>
          <h3>Phone</h3>
          <a href="tel:+13018806015">301-880-6015</a>
        </div>
      </div>
    </section>
  </LegalPage>
);

export default SupportPage;
