import React from 'react';
import SecureReferralPage from '../components/referrals/SecureReferralPage';

// Public page opened from the text or email sent with a referral. No login, no staff navigation: the link's key
// (in the URL fragment) and a code sent to the specialist's other contact are the only credentials.
function ReferralLinkPage() {
  return <SecureReferralPage />;
}

export default ReferralLinkPage;
