/**
 * Custom hook for communicator page utilities
 * Provides helper functions for printing and tab management
 */
export const useCommunicatorUtils = () => {
    // Generate print content for contacts
    const generatePrintContent = (contacts) => {
        const currentDate = new Date().toLocaleDateString();

        return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>POWER Communicator - Contacts List</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 20px;
            }
            .header {
              text-align: center;
              margin-bottom: 30px;
              border-bottom: 2px solid #1976d2;
              padding-bottom: 10px;
            }
            .header h1 {
              color: #1976d2;
              margin: 0;
            }
            .header p {
              margin: 5px 0;
              color: #666;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 12px;
              text-align: left;
            }
            th {
              background-color: #1976d2;
              color: white;
              font-weight: bold;
            }
            tr:nth-child(even) {
              background-color: #f5f5f5;
            }
            .footer {
              margin-top: 30px;
              text-align: center;
              color: #666;
              font-size: 12px;
            }
            .contact-info {
              display: flex;
              align-items: center;
              gap: 5px;
            }
            .empty-cell {
              color: #999;
              font-style: italic;
            }
            @media print {
              body { margin: 0; }
              .header { page-break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>POWER Communicator</h1>
            <p>Contacts Directory</p>
            <p>Generated on: ${currentDate}</p>
            <p>Total Contacts: ${contacts.length}</p>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Date Added</th>
              </tr>
            </thead>
            <tbody>
              ${contacts.length === 0 ?
                '<tr><td colspan="4" style="text-align: center; padding: 20px; font-style: italic;">No contacts found</td></tr>' :
                contacts.map(contact => `
                  <tr>
                    <td>${contact.name}</td>
                    <td>${contact.phone || '<span class="empty-cell">-</span>'}</td>
                    <td>${contact.email || '<span class="empty-cell">-</span>'}</td>
                    <td>${new Date(contact.created_at).toLocaleDateString()}</td>
                  </tr>
                `).join('')
            }
            </tbody>
          </table>
          
          <div class="footer">
            <p>POWER Communicator System - Printed on ${currentDate}</p>
          </div>
        </body>
      </html>
    `;
    };

    // Handle printing contacts
    const printContacts = (contacts) => {
        const printWindow = window.open('', '_blank');
        const printContent = generatePrintContent(contacts);

        printWindow.document.write(printContent);
        printWindow.document.close();

        // Wait for content to load, then print
        printWindow.onload = () => {
            printWindow.print();
            printWindow.close();
        };
    };

    // Format date for display
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString();
    };

    // Check if contact has phone
    const hasPhone = (contact) => {
        return contact.phone && contact.phone.trim() !== '';
    };

    // Check if contact has email
    const hasEmail = (contact) => {
        return contact.email && contact.email.trim() !== '';
    };

    return {
        printContacts,
        formatDate,
        hasPhone,
        hasEmail
    };
};
