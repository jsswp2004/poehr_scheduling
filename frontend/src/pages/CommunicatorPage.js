import React, { useState, useEffect } from "react";
import { Box } from "@mui/material";
import { useNavigate } from "react-router-dom";
import { jwtDecode } from "jwt-decode";

// Custom hooks
import { useContacts } from "../hooks/useContacts";
import { useFileUpload } from "../hooks/useFileUpload";
import { useBulkMessaging } from "../hooks/useBulkMessaging";
import { useContactForm } from "../hooks/useContactForm";
import { useCommunicatorUtils } from "../hooks/useCommunicatorUtils";

// Components
import {
  ContactsTable,
  BulkMessageForm,
  ContactFormDialog,
  FileUploadDialog,
  CommunicatorHeader,
} from "../components/communicator";
import BackButton from "../components/BackButton";
import { toast } from "../components/SimpleToast";

/**
 * Refactored CommunicatorPage with modular components and hooks
 *
 * Features:
 * - Contact management (CRUD operations)
 * - CSV file upload for bulk contact import
 * - Bulk messaging (SMS and Email)
 * - Print functionality for contacts
 * - Role-based authentication
 * - Tabbed interface (Contacts/Send Message)
 */
function CommunicatorPage() {
  const [tab, setTab] = useState("contacts");
  const navigate = useNavigate();
  const token = localStorage.getItem("access_token");

  // Role check and authentication
  useEffect(() => {
    if (!token) {
      navigate("/login");
      return;
    }
    try {
      const decoded = jwtDecode(token);
      const role = decoded.role || "";
      if (role !== "admin" && role !== "system_admin" && role !== "registrar") {
        navigate("/");
      }
    } catch (err) {
      navigate("/login");
    }
  }, [navigate, token]);

  // Custom hooks for business logic
  const contacts = useContacts(token);
  const contactForm = useContactForm();
  const bulkMessaging = useBulkMessaging(token);
  const utils = useCommunicatorUtils();

  // File upload with success callback
  const fileUpload = useFileUpload(token, (data) => {
    toast.success(`${data.created} contacts uploaded successfully`);
    contacts.refreshContacts();
  });

  // Handle contact save (create or update)
  const handleSaveContact = async () => {
    let success = false;

    if (contactForm.editingContact) {
      success = await contacts.updateContact(
        contactForm.editingContact.id,
        contactForm.contactForm
      );
      if (success) {
        toast.success("Contact updated successfully");
      }
    } else {
      success = await contacts.createContact(contactForm.contactForm);
      if (success) {
        toast.success("Contact created successfully");
      }
    }

    if (success) {
      contactForm.closeDialog();
    } else {
      toast.error(contacts.error || "Failed to save contact");
    }
  };

  // Handle contact deletion with custom toast confirmation
  const handleDeleteContact = async (id) => {
    toast.warning(
      <div>
        <p>
          <strong>Are you sure you want to delete this contact?</strong>
        </p>
        <div style={{ marginTop: "10px" }}>
          <button
            onClick={() => performDeleteContact(id)}
            style={{
              marginRight: "10px",
              padding: "5px 15px",
              backgroundColor: "#d32f2f",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Yes, Delete
          </button>
          <button
            onClick={() => toast.dismiss()}
            style={{
              padding: "5px 15px",
              backgroundColor: "#757575",
              color: "white",
              border: "none",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
        </div>
      </div>,
      { duration: 0 } // Keep toast open until user decides
    );
  };

  // Perform actual contact deletion
  const performDeleteContact = async (id) => {
    toast.dismiss();

    const success = await contacts.deleteContact(id);
    if (success) {
      toast.success("Contact deleted successfully! 🗑️");
    } else {
      toast.error("Failed to delete contact. Please try again.");
    }
  };

  // Handle file upload
  const handleFileUpload = async () => {
    const success = await fileUpload.uploadFile();
    if (!success && fileUpload.error) {
      toast.error(fileUpload.error);
    }
  };

  // Handle bulk message sending
  const handleSendBulkMessage = async () => {
    const result = await bulkMessaging.sendBulkMessage();
    if (result.success) {
      toast.success(`Message sent to ${result.sentCount} contacts`);
    } else {
      toast.error(bulkMessaging.error || "Failed to send message");
    }
  };

  return (
    <Box sx={{ mt: 4, p: 3 }}>
      {/* Header with Tabs */}
      <CommunicatorHeader
        currentTab={tab}
        contactsCount={contacts.contacts.length}
        onTabChange={setTab}
      />

      {/* Back Button */}
      <Box sx={{ position: "absolute", top: 16, right: 16 }}>
        <BackButton to="/login?redirect=communicator" />
      </Box>

      {/* Contacts Tab */}
      {tab === "contacts" && (
        <ContactsTable
          contacts={contacts.contacts}
          loading={contacts.loading}
          onAddContact={contactForm.openCreateDialog}
          onEditContact={contactForm.openEditDialog}
          onDeleteContact={handleDeleteContact}
          onUploadClick={fileUpload.openUploadDialog}
          onDownloadTemplate={fileUpload.downloadTemplate}
          onPrintContacts={utils.printContacts}
          formatDate={utils.formatDate}
          hasPhone={utils.hasPhone}
          hasEmail={utils.hasEmail}
        />
      )}

      {/* Message Tab */}
      {tab === "message" && (
        <BulkMessageForm
          contacts={contacts.contacts}
          messageForm={bulkMessaging.messageForm}
          sending={bulkMessaging.sending}
          onMessageChange={bulkMessaging.updateMessageForm}
          onCheckboxChange={bulkMessaging.updateMessageCheckbox}
          onSendMessage={handleSendBulkMessage}
        />
      )}

      {/* Contact Form Dialog */}
      <ContactFormDialog
        open={contactForm.dialogOpen}
        editingContact={contactForm.editingContact}
        contactForm={contactForm.contactForm}
        onClose={contactForm.closeDialog}
        onSave={handleSaveContact}
        onFormChange={contactForm.updateContactForm}
      />

      {/* File Upload Dialog */}
      <FileUploadDialog
        open={fileUpload.uploadDialogOpen}
        selectedFile={fileUpload.selectedFile}
        uploading={fileUpload.uploading}
        onClose={fileUpload.closeUploadDialog}
        onFileSelect={fileUpload.handleFileSelect}
        onUpload={handleFileUpload}
        onDownloadTemplate={fileUpload.downloadTemplate}
      />
    </Box>
  );
}

export default CommunicatorPage;
