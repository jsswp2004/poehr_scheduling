/**
 * Landing page product features section component
 */
import React from 'react';
import DashboardSchedulingImage from '../../assets/dashboard_scheduling.jpg';
import DashboardTogetherImage from '../../assets/dashboard_together.png';

export const ProductFeaturesSection = ({ onGetStartedClick }) => {
    return (
        <>
            {/* POWER Scheduling Section */}
            <div className="work-management">
                <div className="content3">
                    <div className="headline">
                        <div className="text-block">
                            <div className="power-scheduling">
                                POWER Scheduling
                            </div>
                            {/* Feature description with bullet points */}
                            <div className="keep-your-patient-schedule-organized-with-power-upload-clinic-events-holidays-staff-lists-and-provider-lists-directly-from-the-app-manage-availability-and-block-times-seamlessly-easily-send-text-and-email-messages-to-patients-including-automated-appointment-reminders-and-bulk-sms-notifications-keep-all-essential-clinic-information-and-communication-in-one-secure-user-friendly-platform">
                                <span>
                                    <span className="keep-your-patient-schedule-organized-with-power-upload-clinic-events-holidays-staff-lists-and-provider-lists-directly-from-the-app-manage-availability-and-block-times-seamlessly-easily-send-text-and-email-messages-to-patients-including-automated-appointment-reminders-and-bulk-sms-notifications-keep-all-essential-clinic-information-and-communication-in-one-secure-user-friendly-platform-span">
                                        Keep your patient schedule organized with POWER:<br />
                                    </span>
                                    <ul className="keep-your-patient-schedule-organized-with-power-upload-clinic-events-holidays-staff-lists-and-provider-lists-directly-from-the-app-manage-availability-and-block-times-seamlessly-easily-send-text-and-email-messages-to-patients-including-automated-appointment-reminders-and-bulk-sms-notifications-keep-all-essential-clinic-information-and-communication-in-one-secure-user-friendly-platform-span2">
                                        <li>Upload clinic events, holidays, staff lists, and provider lists directly from the app.</li>
                                        <li>Manage availability and block times seamlessly.</li>
                                        <li>Easily send text and email messages to patients, including automated appointment reminders and bulk SMS notifications.</li>
                                        <li>Keep all essential clinic information and communication in one secure, user-friendly platform.</li>
                                    </ul>
                                </span>
                            </div>
                        </div>
                        <div className="btn-get-started3" onClick={onGetStartedClick} style={{ cursor: 'pointer' }}>
                            <div className="get-started3">Get Started</div>
                        </div>
                    </div>

                    {/* Feature image placeholder */}
                    <div className="work-together-image">
                        <img
                            src={DashboardSchedulingImage}
                            alt="POWER Healthcare Scheduler"
                            className="scheduling-dashboard-image"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                borderRadius: '16px',
                                padding: '5px'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* POWER Together Section */}
            <div className="work-management2">
                <div className="content4">
                    {/* Collaboration visualization placeholder */}
                    <div className="work-together-image">
                        <img
                            src={DashboardTogetherImage}
                            alt="POWER Healthcare Collaboration Dashboard"
                            className="collaboration-dashboard-image"
                            style={{
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                borderRadius: '16px',
                                padding: '5px'
                            }}
                        />
                    </div>
                    <div className="headline">
                        <div className="text-block">
                            <div className="power-together">POWER together</div>
                            <div className="with-power-securely-share-schedules-notes-and-updates-with-your-team-for-real-time-collaboration-collaborate-important-information-or-announcements-and-share-links-with-staff-or-providers-as-needed">
                                With POWER, securely share schedules, notes, and updates with
                                your team for real-time collaboration. Collaborate important
                                information or announcements and share links with staff or
                                providers as needed.
                            </div>
                        </div>
                        <div className="btn-get-started3" onClick={onGetStartedClick} style={{ cursor: 'pointer' }}>
                            <div className="try-it-now">Try it now</div>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
};
