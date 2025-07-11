import React from 'react';

/**
 * TabNavigation Component
 * Handles the tab navigation for Personal, Clinic, and Group plans
 */
const TabNavigation = ({ activeTab, onTabClick }) => {
    const tabs = [
        { id: 'personal', label: 'Personal' },
        { id: 'clinic', label: 'Clinic' },
        { id: 'group', label: 'Group' }
    ];

    return (
        <div className="tab-navigation">
            <div className="tab-container">
                {tabs.map((tab) => (
                    <div
                        key={tab.id}
                        className={`tab-item ${activeTab === tab.id ? 'active' : ''}`}
                        onClick={() => onTabClick(tab.id)}
                    >
                        {tab.label}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TabNavigation;
