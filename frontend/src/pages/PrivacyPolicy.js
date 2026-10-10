import React from "react";
import { Box, Container, Divider, Link, Paper, Stack, Typography } from "@mui/material";

const UPDATED = "October 10, 2026";
const EMAIL = "info@powerhealthcareit.com";

const SECTIONS = [
  {
    title: "1. About this policy",
    body: [
      "This policy describes how POWER Healthcare IT Systems (\"POWER\", \"we\", \"us\") handles information in the POWER Staffing mobile app and the staffing features of the POWER Scheduling web application. POWER Staffing helps healthcare organizations plan unit coverage, manage shifts and handle time-off requests.",
      "The POWER Scheduling web application has its own Privacy Policy and Terms of Service, available at /terms.",
    ],
  },
  {
    title: "2. Information we collect",
    body: ["We collect only what is needed to run staff scheduling for your organization:"],
    list: [
      "Account details: your name, work email address, phone number, role and the organization and facilities you belong to.",
      "Sign-in credentials: your username and a password stored only in protected (hashed) form.",
      "Schedule information: shifts, assignments, availability and unit coverage settings.",
      "Time-off requests: dates, the type of request, any reason or note you choose to enter, and the decision made on it.",
      "A user ID that links the information above to your account.",
    ],
    after: "We do not collect your location, contacts, photos, advertising identifiers or browsing history, and we do not read other apps on your device.",
  },
  {
    title: "3. Patient information",
    body: [
      "POWER Staffing does not collect or display patient health information. Coverage planning uses unit census numbers (how many patients a unit has), not information about individual patients.",
    ],
  },
  {
    title: "4. How we use information",
    list: [
      "To provide scheduling, staffing coverage and time-off features to you and your organization.",
      "To sign you in and keep your account secure.",
      "To send staffing alerts and reminders, as described in the next section.",
      "To respond to your questions and support requests.",
    ],
    after: "We do not use your information for advertising, and we do not build advertising profiles.",
  },
  {
    title: "5. Alerts and reminders",
    body: [
      "Depending on your organization's settings, the app can send staffing alerts and shift or time-off reminders by email or text message (SMS). These messages are sent to the email address or phone number on your profile. Message and data rates from your carrier may apply, and you can ask your organization's administrator to change or stop them.",
    ],
  },
  {
    title: "6. Who can see your information",
    body: [
      "Your information is visible only to people in your own organization, and only as far as their role allows. For example, schedulers and administrators can see schedules and time-off requests for the staff they manage. People in other organizations cannot see it.",
      "We do not sell your information. We do not share it with advertisers or data brokers. The app contains no third-party advertising, analytics or tracking code.",
    ],
  },
  {
    title: "7. Service providers",
    body: [
      "We use cloud hosting and infrastructure providers to run the service, and message-delivery providers to send email and text alerts. They handle information only to provide those services to us and are not permitted to use it for their own purposes.",
    ],
  },
  {
    title: "8. Security",
    list: [
      "Information is encrypted in transit using HTTPS.",
      "Sign-in tokens are kept in your device's secure storage.",
      "Access is limited by organization and role, and passwords are stored only in hashed form.",
    ],
    after: "No system is perfectly secure, but we work to protect your information and will notify the affected organization if we learn of a breach affecting it.",
  },
  {
    title: "9. Retention and deletion",
    body: [
      "Your organization controls its staff records. When an organization administrator removes a staff member, the account is deleted. If the person has documented activity in the organization's records, the account is deactivated instead, so their access ends while those records stay accurately attributed.",
      `You can ask us to delete your account and the staffing information we hold about you by emailing ${EMAIL}. We may need to keep certain records where the law or your organization's recordkeeping obligations require it.`,
    ],
  },
  {
    title: "10. Your choices",
    body: [
      `You can ask your organization's administrator or us (${EMAIL}) to correct or delete your information, or to change how alerts are sent to you.`,
    ],
  },
  {
    title: "11. Children",
    body: ["POWER Staffing is for healthcare workers and is not directed at children under 18. We do not knowingly collect information from children."],
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
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: { xs: 2.5, sm: 4 } }}>
        <Typography variant="h4" component="h1" gutterBottom color="primary">
          POWER Staffing Privacy Policy
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          POWER Healthcare IT Systems · Last updated: {UPDATED}
        </Typography>
        <Divider sx={{ mb: 3 }} />
        <Stack spacing={3}>
          {SECTIONS.map((s) => (
            <Box key={s.title} component="section">
              <Typography variant="h6" component="h2" gutterBottom>
                {s.title}
              </Typography>
              {(s.body || []).map((p) => (
                <Typography key={p} variant="body1" paragraph>
                  {p}
                </Typography>
              ))}
              {s.list && (
                <Box component="ul" sx={{ pl: 3, mt: 0, mb: 1 }}>
                  {s.list.map((item) => (
                    <Typography key={item} component="li" variant="body1" sx={{ mb: 0.5 }}>
                      {item}
                    </Typography>
                  ))}
                </Box>
              )}
              {s.after && (
                <Typography variant="body1" paragraph>
                  {s.after}
                </Typography>
              )}
              {s.contact && (
                <Typography variant="body1" component="div">
                  Email: <Link href={`mailto:${EMAIL}`}>{EMAIL}</Link>
                  <br />
                  Phone: <Link href="tel:+13018806015">301-880-6015</Link>
                </Typography>
              )}
            </Box>
          ))}
        </Stack>
      </Paper>
    </Container>
  );
}

export default PrivacyPolicy;
