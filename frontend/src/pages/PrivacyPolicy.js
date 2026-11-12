import React from "react";
import { LegalPage, LegalSection } from "../components/LegalPage";

const UPDATED = "November 12, 2026";
const EMAIL = "power@powerhealthit.com";

const SECTIONS = [
  {
    title: "1. About this policy",
    body: [
      "This policy describes how POWER Healthcare IT Systems (\"POWER\", \"we\", \"us\") handles information in two mobile apps and the matching features of the POWER Scheduling web application:",
    ],
    list: [
      "POWER Staffing helps healthcare organizations plan unit coverage, manage shifts and handle time-off requests.",
      "POWER Communicator lets an organization's authorized users keep a contact list (added by hand, imported from a CSV file, or chosen from the iPhone's contacts), group people into lists, send text messages and emails to them, and see what was sent and what came back. On the web, Communicator also offers automatic recurring text and email messages that an administrator sets up, announcements shown on the organization's staff and patient dashboards, and an in-app assistant.",
    ],
    after:
      "Both mobile apps are for organizations and their staff. Accounts are created by your organization's administrator; there is no public sign-up. The POWER Communicator mobile app covers contacts, lists, sending and the message log; automatic messages, announcements and the assistant are in the web application. The POWER Scheduling web application has its own Privacy Policy and Terms of Service, available at /terms.",
  },
  {
    title: "2. Information we collect",
    body: ["We collect only what is needed to run the features your organization uses."],
  },
  {
    title: "2a. In both apps",
    list: [
      "Account details: your name, work email address, phone number, role and the organization and facilities you belong to.",
      "Sign-in credentials: your username and a password stored only in protected (hashed) form.",
      "A user ID that links the information in these apps to your account.",
    ],
  },
  {
    title: "2b. POWER Staffing",
    list: [
      "Schedule information: shifts, assignments, availability and unit coverage settings.",
      "Time-off requests: dates, the type of request, any reason or note you choose to enter, and the decision made on it.",
      "Assistant conversations: if you use the in-app assistant, the questions you type, the answers it gives, which staffing lookups it ran, and any change it prepared for you to confirm (such as a time-off request). These are kept for 30 days and then deleted.",
    ],
  },
  {
    title: "2c. POWER Communicator",
    list: [
      "Contacts: the names, phone numbers and email addresses of the people your organization adds (by hand, from a CSV file or from the iPhone), the lists they belong to, and whether they have opted out of text messages. These are the organization's contacts, not the app user's.",
      "Messages: the text or email content your organization sends, who it was sent to, when, who sent it, and the result (sent, failed or skipped).",
      "Replies: text replies we receive from contacts, including the keywords STOP, START and HELP, which we use to record opt-outs and opt-ins.",
      "iPhone contacts import: only if you choose to import from your iPhone and allow access when iOS asks, the app lists your contacts so you can pick some, and only the ones you select are copied into your organization's contact list. The app does not read your address book at any other time.",
      "Automatic messages (web): the schedule an administrator sets for recurring text or email messages, such as frequency, day and start date, and the messages they send.",
      "Announcements (web): the title, text and any files (such as a PDF or image) that a manager attaches to a notice shown on staff or patient dashboards.",
      "Assistant conversations (web): if you use the Communicator assistant, the questions you type, the answers it gives, which lookups it ran, and any message or contact it prepared for you to confirm. These are kept for 30 days and then deleted.",
    ],
    after:
      "Face ID, if you switch it on in Settings, is handled entirely by iOS. We do not receive, see or store your face data.",
  },
  {
    title: "2d. What we do not collect",
    body: [
      "In either app we do not collect your location, photos, advertising identifiers or browsing history, and we do not read other apps on your device.",
    ],
  },
  {
    title: "3. Patient information",
    body: [
      "POWER Staffing does not collect or display patient health information. Coverage planning uses unit census numbers (how many patients a unit has), not information about individual patients. Please do not enter patient information into time-off notes or into the assistant.",
      "POWER Communicator is a general messaging tool and is not designed to store patient health information. Please do not put patient details such as record numbers, birth dates, diagnoses or treatment information in contact records or in message text. The app can warn you when a message appears to contain private details such as these (Settings > Warn about private details). Your organization is responsible for what its users choose to send.",
    ],
  },
  {
    title: "4. How we use information",
    list: [
      "To provide scheduling, staffing coverage, time-off and messaging features to you and your organization.",
      "To sign you in and keep your account secure.",
      "To send the staffing alerts and reminders, and the messages your organization chooses to send, as described in the next section.",
      "To keep a log of messages so your organization can see what was sent, what failed and who replied.",
      "To answer your questions in the in-app assistants, using only the schedule, staffing, contact and message information your role is allowed to see.",
      "To respond to your questions and support requests.",
    ],
    after: "We do not use your information for advertising, and we do not build advertising profiles.",
  },
  {
    title: "5. Alerts, reminders and messages",
    body: [
      "POWER Staffing: depending on your organization's settings, the app can send staffing alerts and shift or time-off reminders by email or text message (SMS). These messages are sent to the email address or phone number on your profile. Shift reminders can also be switched on or off for each person on the roster, so you can ask your organization's administrator to change how alerts are sent to you.",
      "POWER Communicator: messages are sent only when an authorized user of your organization chooses to send them, or on the automatic schedule an administrator has turned on, and only to contacts that organization has added. The sender's organization is responsible for having permission to contact the people on its list. Contacts who reply STOP to a text are marked as opted out and are skipped automatically on later sends; they can reply START to opt back in, or HELP for help.",
      "For text messages, message and data rates from your carrier may apply, and message frequency varies.",
    ],
  },
  {
    title: "6. Who can see your information",
    body: [
      "Your information is visible only to people in your own organization, and only as far as their role allows. For example, schedulers and administrators can see schedules and time-off requests for the staff they manage, and users with messaging rights can see the organization's contacts and message log. People in other organizations cannot see it.",
      "We do not sell your information. We do not share it with advertisers or data brokers. The apps contain no third-party advertising, analytics or tracking code.",
    ],
  },
  {
    title: "7. Service providers",
    body: [
      "We use cloud hosting and infrastructure providers to run the service, and message-delivery providers to send email and text messages. They handle information only to provide those services to us and are not permitted to use it for their own purposes.",
      "The in-app assistants are powered by Anthropic, which processes your question and the details needed to answer it, solely to produce the answer. In POWER Staffing these are schedule and staffing details; in POWER Communicator (web) they are contact and message-history details your role may see. Staff accounts can only ask about their own schedule. Managers and administrators can ask about staff in their own organization, within what their role allows. We do not send saved time-off reasons or shift notes to the assistant. If you type a reason into the chat yourself, it is sent to Anthropic along with your message. The assistants can prepare a time-off request, a call-out report, a message or a new contact for you, but nothing is submitted or sent until you press the confirm button. The POWER Communicator mobile app does not include an assistant.",
    ],
  },
  {
    title: "8. Security",
    list: [
      "Information is encrypted in transit using HTTPS.",
      "Sign-in tokens are kept in your device's secure storage.",
      "Access is limited by organization and role, and passwords are stored only in hashed form.",
      "In POWER Communicator you can require Face ID each time the app opens and require a confirmation step before any message is sent.",
    ],
    after: "No system is perfectly secure, but we work to protect your information and will notify the affected organization if we learn of a breach affecting it.",
  },
  {
    title: "9. Retention and deletion",
    body: [
      "Your organization controls its staff records, contacts and message history. When an organization administrator removes a staff member, the account is deleted. If the person has documented activity in the organization's records, the account is deactivated instead, so their access ends while those records stay accurately attributed.",
      "In POWER Communicator, authorized users can delete a contact or a message log entry from the app. Assistant conversations are deleted automatically after 30 days.",
      `You can ask us to delete your account and the information we hold about you by emailing ${EMAIL}. We may need to keep certain records where the law or your organization's recordkeeping obligations require it.`,
    ],
  },
  {
    title: "10. Your choices",
    body: [
      `You can ask your organization's administrator or us (${EMAIL}) to correct or delete your information, or to change how alerts are sent to you.`,
      `If you received a text or email from an organization using POWER Communicator, you can reply STOP to a text to stop further texts. To have your details removed from an organization's contact list, contact that organization, or email us at ${EMAIL} and we will pass the request on.`,
    ],
  },
  {
    title: "11. Children",
    body: ["POWER Staffing and POWER Communicator are for healthcare organizations and their workers and are not directed at children under 18. We do not knowingly collect information from children."],
  },
  {
    title: "12. Changes to this policy",
    body: ["If we change this policy we will update the date at the top of this page. If a change is significant we will tell organization administrators."],
  },
  {
    title: "13. Contact us",
    body: ["POWER Healthcare IT Systems"],
    contact: true,
  },
];

function PrivacyPolicy() {
  return (
    <LegalPage
      title="POWER Staffing and POWER Communicator Privacy Policy"
      subtitle="POWER Healthcare IT Systems"
      updated={UPDATED}
    >
      {SECTIONS.map((s) => (
        <LegalSection key={s.title} title={s.title}>
          {(s.body || []).map((p) => (
            <p key={p}>{p}</p>
          ))}
          {s.list && (
            <ul>
              {s.list.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
          {s.after && <p>{s.after}</p>}
          {s.contact && (
            <p>
              Email: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
              <br />
              Phone: <a href="tel:+13018806015">301-880-6015</a>
            </p>
          )}
        </LegalSection>
      ))}
    </LegalPage>
  );
}

export default PrivacyPolicy;
