import React from 'react';
import {
  Box,
  Container,
  Typography,
  Paper,
  Divider,
  Stack,
} from '@mui/material';

function PrivacyAndTermsPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper elevation={3} sx={{ p: 4 }}>
        <Typography variant="h3" component="h1" gutterBottom align="center" color="primary">
          Privacy Policy and Terms of Service
        </Typography>
        
        <Typography variant="h6" align="center" color="text.secondary" sx={{ mb: 4 }}>
          POWER Healthcare IT Systems - Scheduling Application
        </Typography>

        <Typography variant="body2" align="center" color="text.secondary" sx={{ mb: 4 }}>
          Last Updated: August 19, 2025
        </Typography>

        <Divider sx={{ mb: 4 }} />

        {/* Privacy Policy Section */}
        <Box sx={{ mb: 6 }}>
          <Typography variant="h4" component="h2" gutterBottom color="primary">
            Privacy Policy
          </Typography>

          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                1. Information We Collect
              </Typography>
              <Typography variant="body1" paragraph>
                We collect information you provide directly to us, such as when you:
              </Typography>
              <Box component="ul" sx={{ pl: 3 }}>
                <li>Create an account or profile</li>
                <li>Schedule, modify, or cancel appointments</li>
                <li>Communicate with healthcare providers</li>
                <li>Use our messaging services</li>
                <li>Provide feedback or contact us</li>
              </Box>
              <Typography variant="body1" paragraph>
                This may include your name, email address, phone number, date of birth, 
                medical information, appointment details, and communication preferences.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                2. How We Use Your Information
              </Typography>
              <Typography variant="body1" paragraph>
                We use the information we collect to:
              </Typography>
              <Box component="ul" sx={{ pl: 3 }}>
                <li>Provide, maintain, and improve our scheduling services</li>
                <li>Process and manage your appointments</li>
                <li>Send appointment reminders and health alerts via SMS (with your consent)</li>
                <li>Facilitate communication between you and your healthcare providers</li>
                <li>Respond to your comments, questions, and requests</li>
                <li>Ensure the security and integrity of our services</li>
                <li>Comply with legal obligations and healthcare regulations</li>
              </Box>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                3. SMS Communications
              </Typography>
              <Typography variant="body1" paragraph>
                By providing your phone number and consenting to SMS communications, you agree to receive:
              </Typography>
              <Box component="ul" sx={{ pl: 3 }}>
                <li>Automated appointment reminders</li>
                <li>Health alerts and notifications</li>
                <li>Service-related messages</li>
              </Box>
              <Typography variant="body1" paragraph>
                Message frequency varies. Message and data rates may apply. You can opt out at any time 
                by replying STOP to any message. Reply HELP for support information.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                4. Information Sharing and Disclosure
              </Typography>
              <Typography variant="body1" paragraph>
                We do not sell, trade, or otherwise transfer your personal information to third parties 
                except in the following circumstances:
              </Typography>
              <Box component="ul" sx={{ pl: 3 }}>
                <li>With your healthcare providers as necessary for your care</li>
                <li>With your explicit consent</li>
                <li>To comply with legal obligations or court orders</li>
                <li>To protect our rights, property, or safety, or that of others</li>
                <li>In connection with a business transfer or acquisition</li>
              </Box>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                5. Data Security
              </Typography>
              <Typography variant="body1" paragraph>
                We implement appropriate technical and organizational security measures to protect 
                your personal information against unauthorized access, alteration, disclosure, or 
                destruction. However, no method of transmission over the Internet or electronic 
                storage is 100% secure.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                6. HIPAA Compliance
              </Typography>
              <Typography variant="body1" paragraph>
                As a healthcare technology service, we are committed to maintaining the privacy and 
                security of your protected health information (PHI) in accordance with the Health 
                Insurance Portability and Accountability Act (HIPAA) and other applicable healthcare 
                privacy laws.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                7. Your Rights
              </Typography>
              <Typography variant="body1" paragraph>
                Depending on your location, you may have the following rights regarding your personal information:
              </Typography>
              <Box component="ul" sx={{ pl: 3 }}>
                <li>Access and obtain a copy of your personal information</li>
                <li>Correct inaccurate personal information</li>
                <li>Request deletion of your personal information</li>
                <li>Withdraw consent for SMS communications</li>
                <li>Request restrictions on how we use your information</li>
              </Box>
            </Box>
          </Stack>
        </Box>

        <Divider sx={{ mb: 4 }} />

        {/* Terms of Service Section */}
        <Box sx={{ mb: 6 }}>
          <Typography variant="h4" component="h2" gutterBottom color="primary">
            Terms of Service
          </Typography>

          <Stack spacing={3}>
            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                1. Acceptance of Terms
              </Typography>
              <Typography variant="body1" paragraph>
                By accessing and using the POWER Healthcare IT Systems scheduling application, 
                you accept and agree to be bound by the terms and provision of this agreement.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                2. Use License
              </Typography>
              <Typography variant="body1" paragraph>
                Permission is granted to temporarily use this application for personal, 
                non-commercial transitory viewing only. This is the grant of a license, 
                not a transfer of title, and under this license you may not:
              </Typography>
              <Box component="ul" sx={{ pl: 3 }}>
                <li>Modify or copy the materials</li>
                <li>Use the materials for any commercial purpose or for any public display</li>
                <li>Attempt to reverse engineer any software contained in the application</li>
                <li>Remove any copyright or other proprietary notations from the materials</li>
              </Box>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                3. User Responsibilities
              </Typography>
              <Typography variant="body1" paragraph>
                As a user of our scheduling application, you agree to:
              </Typography>
              <Box component="ul" sx={{ pl: 3 }}>
                <li>Provide accurate and complete information</li>
                <li>Maintain the security of your account credentials</li>
                <li>Use the service only for its intended healthcare scheduling purposes</li>
                <li>Comply with all applicable laws and regulations</li>
                <li>Respect the privacy and rights of other users</li>
                <li>Not use the service for any unlawful or prohibited activities</li>
              </Box>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                4. Appointment Scheduling
              </Typography>
              <Typography variant="body1" paragraph>
                Our application facilitates appointment scheduling between patients and healthcare 
                providers. Please note:
              </Typography>
              <Box component="ul" sx={{ pl: 3 }}>
                <li>All appointments are subject to provider availability and confirmation</li>
                <li>You are responsible for arriving on time for scheduled appointments</li>
                <li>Cancellation policies may vary by provider</li>
                <li>Emergency medical situations should not be handled through this application</li>
              </Box>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                5. Service Availability
              </Typography>
              <Typography variant="body1" paragraph>
                We strive to maintain high availability of our services, but we do not guarantee 
                uninterrupted access. The service may be temporarily unavailable due to maintenance, 
                updates, or circumstances beyond our control.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                6. Limitation of Liability
              </Typography>
              <Typography variant="body1" paragraph>
                POWER Healthcare IT Systems shall not be liable for any damages arising from the 
                use or inability to use this application, including but not limited to direct, 
                indirect, incidental, punitive, and consequential damages.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                7. Modifications
              </Typography>
              <Typography variant="body1" paragraph>
                We reserve the right to revise these terms of service at any time without notice. 
                By using this application, you are agreeing to be bound by the then current version 
                of these terms of service.
              </Typography>
            </Box>

            <Box>
              <Typography variant="h5" component="h3" gutterBottom>
                8. Medical Disclaimer
              </Typography>
              <Typography variant="body1" paragraph>
                This application is for scheduling purposes only and does not provide medical advice, 
                diagnosis, or treatment. Always consult with qualified healthcare professionals for 
                medical concerns. In case of emergency, call 911 or your local emergency services.
              </Typography>
            </Box>
          </Stack>
        </Box>

        <Divider sx={{ mb: 4 }} />

        {/* Contact Information */}
        <Box>
          <Typography variant="h4" component="h2" gutterBottom color="primary">
            Contact Information
          </Typography>
          <Typography variant="body1" paragraph>
            If you have any questions about this Privacy Policy and Terms of Service, 
            please contact us at:
          </Typography>
          <Box sx={{ pl: 2 }}>
            <Typography variant="body1">
              <strong>POWER Healthcare IT Systems</strong>
            </Typography>
            <Typography variant="body1">
              Email: support@powerhealthcareit.com
            </Typography>
            <Typography variant="body1">
              Website: https://powerhealthcareit.com
            </Typography>
          </Box>
        </Box>

        <Box sx={{ mt: 4, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
          <Typography variant="caption" color="text.secondary">
            This Privacy Policy and Terms of Service document is effective as of August 19, 2025. 
            We may update this document from time to time to reflect changes in our practices or 
            applicable laws. Please check this page periodically for updates.
          </Typography>
        </Box>
      </Paper>
    </Container>
  );
}

export default PrivacyAndTermsPage;
