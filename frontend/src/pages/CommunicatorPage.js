import React, { useState, useEffect, useRef } from "react";
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
import { toast } from "../components/SimpleToast";
import CommunicatorAssistantDock, { COMMUNICATOR_CHANGED_EVENT } from "../components/CommunicatorAssistantDock";
import AutoEmailSetUpPage from "./AutoEmailSetUpPage";
import AutoSMSSetUpPage from "./AutoSMSSetUpPage";

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
  const [isAdmin, setIsAdmin] = useState(false);
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
      // The Email/SMS auto-messaging setup tabs are admin-only -- registrars
      // can use Contacts/Send Message but not touch the automated
      // email/SMS schedule (same settings the Messages page controls).
      setIsAdmin(role === "admin" || role === "system_admin");
    } catch (err) {
      navigate("/login");
    }
  }, [navigate, token]);

  // Custom hooks for business logic
  const contacts = useContacts(token);
  const contactForm = useContactForm();
  const bulkMessaging = useBulkMessaging(token);
  const utils = useCommunicatorUtils();

  // The assistant dispatches this after a confirmed change (a contact it added, a message it sent).
  const refreshRef = useRef(null);
  refreshRef.current = contacts.refreshContacts;
  useEffect(() => {
    const onChanged = () => refreshRef.current && refreshRef.current();
    window.addEventListener(COMMUNICATOR_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(COMMUNICATOR_CHANGED_EVENT, onChanged);
  }, []);

  // Buttons under an assistant answer.
  const handleAssistantNavigate = (route) => {
    if (route === "contacts") setTab("contacts");
    else if (route === "send") setTab("message");
    else if (route === "logs") navigate("/messages");
  };

  // File upload with success callback
  const fileUpload = useFileUpload(token, (data) => {
    console.log("🔄 Upload success data:", data);
    toast.success(`${data.created} contacts uploaded successfully`);
    console.log("🔄 Calling contacts.refreshContacts()");
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
              backgroundColor: "#dc2626",
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
              backgroundColor: "#64748b",
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
    <Box sx={{ height: "100%", p: 1.5, bgcolor: "background.paper", borderRadius: 2 }}>
      {/* Title row + tabs (same layout as the Staffing Center) */}
      <CommunicatorHeader
        currentTab={tab}
        contactsCount={contacts.contacts.length}
        onTabChange={setTab}
        isAdmin={isAdmin}
        backTo="/login?redirect=communicator"
      />

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

      {/* Email Tab (admin-only, same auto-messaging setup as the Messages page) */}
      {tab === "email" && isAdmin && <AutoEmailSetUpPage embedded />}

      {/* SMS Tab (admin-only, same auto-messaging setup as the Messages page) */}
      {tab === "sms" && isAdmin && <AutoSMSSetUpPage embedded />}

      {token && <CommunicatorAssistantDock onNavigate={handleAssistantNavigate} />}

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
