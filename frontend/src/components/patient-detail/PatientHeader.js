import React from 'react';
import { API_BASE_URL } from '../../config/api';

function PatientHeader({ patient }) {
    return (
        <>
            {/* Show profile picture if available */}
            {patient?.profile_picture && (
                <div className="mb-3 text-center">
                    <img
                        src={
                            patient.profile_picture.startsWith('http')
                                ? patient.profile_picture
                                : `${API_BASE_URL}${patient.profile_picture}`
                        }
                        alt="Profile"
                        style={{
                            width: 120,
                            height: 120,
                            borderRadius: '50%',
                            objectFit: 'cover',
                            border: '2px solid #ccc',
                        }}
                    />
                </div>
            )}
        </>
    );
}

export default PatientHeader;
