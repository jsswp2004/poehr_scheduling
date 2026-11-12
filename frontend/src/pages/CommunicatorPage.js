import React, { useState, useEffect, useRef, useCallback } from "react";
import { Alert, Box } from "@mui/material";
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
  ConfirmDialog,
} from "../components/communicator";
import { CommunicatorToolbarSlotContext } from "../components/communicator/CommunicatorToolbarSlot";
import CommunicatorAssistantDock, { COMMUNICATOR_CHANGED_EVENT } from "../components/CommunicatorAssistantDock";
import AutoEmailSetUpPage from "./AutoEmailSetUpPage";
import AutoSMSSetUpPage from "./AutoSMSSetUpPage";
import ActivityTab from "../components/communicator/ActivityTab";

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
  const [selectedIds, setSelectedIds] = useState([]);
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

  // Frozen header block: title, tabs and the open tab's toolbar. Each tab renders its toolbar into toolbarSlot.
  const [toolbarSlot, setToolbarSlot] = useState(null);
  const stickyObserver = useRef(null);
  const stickyRef = useCallback((node) => {
    if (stickyObserver.current) {
      stickyObserver.current.disconnect();
      stickyObserver.current = null;
    }
    if (!node) return;
    // On the root so a table header can pin itself just beneath this block.
    const publish = () =>
      document.documentElement.style.setProperty("--communicator-sticky-h", `${node.getBoundingClientRect().height}px`);
    publish();
    if (typeof ResizeObserver !== "undefined") {
      stickyObserver.current = new ResizeObserver(publish);
      stickyObserver.current.observe(node);
    }
  }, []);

  // Custom hooks for business logic
  const contacts = useContacts(token);
  const contactForm = useContactForm();
  const bulkMessaging = useBulkMessaging(token);
  const utils = useCommunicatorUtils();
  // Drop selections for contacts that no longer exist (deleted, or the list reloaded).
  const selectedContactIds = selectedIds.filter((id) => contacts.contacts.some((c) => c.id === id));

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
    else if (route === "logs") setTab("activity");
  };

  // Page-level feedback shows as dismissible inline alerts (same as the Staffing Center).
  const [notice, setNotice] = useState("");
  const [pageError, setPageError] = useState("");
  const [dialogError, setDialogError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  // File upload with success callback
  const fileUpload = useFileUpload(token, (data) => {
    setPageError("");
    setNotice(`${data.created} contacts uploaded.`);
    contacts.refreshContacts();
  });

  // Handle contact save (create or update)
  const handleSaveContact = async () => {
    setSaving(true);
    setDialogError("");
    let success = false;
    const editing = !!contactForm.editingContact;

    if (editing) {
      success = await contacts.updateContact(
        contactForm.editingContact.id,
        contactForm.contactForm
      );
    } else {
      success = await contacts.createContact(contactForm.contactForm);
    }
    setSaving(false);

    if (success) {
      setPageError("");
      setNotice(editing ? "Contact updated." : "Contact added.");
      contactForm.closeDialog();
    } else {
      setDialogError(contacts.error || "Failed to save contact.");
    }
  };

  // Ask first, then delete
  const handleDeleteContact = (contact) => setDeleteTarget(contact);

  const performDeleteContact = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const success = await contacts.deleteContact(deleteTarget.id);
    setDeleting(false);
    if (success) {
      setPageError("");
      setNotice(`${deleteTarget.name} was deleted.`);
    } else {
      setPageError("Failed to delete contact. Please try again.");
    }
    setDeleteTarget(null);
  };

  // Handle file upload
  const handleFileUpload = async () => {
    const success = await fileUpload.uploadFile();
    if (!success && fileUpload.error) {
      setPageError(fileUpload.error);
    }
  };

  // Handle bulk message sending
  const handleSendBulkMessage = async (contactIds, expectedCount) => {
    const result = await bulkMessaging.sendBulkMessage(contactIds, expectedCount);
    if (result && result.success) {
      setPageError("");
      setNotice(`Message sent to ${result.sentCount} contacts.`);
      if (contactIds) setSelectedIds([]);
      setTab("activity");
    } else {
      setNotice("");
      setPageError((result && result.error) || bulkMessaging.error || "Failed to send message.");
    }
  };

  return (
    <Box sx={{ minHeight: "100%", p: 1.5, bgcolor: "background.paper", borderRadius: 2 }}>
      {/* Frozen: title row, tabs and the open tab's toolbar stay under the navy bar while the page scrolls
          (same as the Staffing Center). */}
      <Box ref={stickyRef} sx={{ position: "sticky", top: 64, zIndex: 1000, bgcolor: "background.paper", pt: "18px", mt: "-18px" }}>
        <CommunicatorHeader
          currentTab={tab}
          onTabChange={setTab}
          isAdmin={isAdmin}
          backTo="/login?redirect=communicator"
          chips={[]}
        />
        <Box ref={setToolbarSlot} />
      </Box>
      <CommunicatorToolbarSlotContext.Provider value={toolbarSlot}>

      {notice && (
        <Alert severity="success" sx={{ mb: 1 }} onClose={() => setNotice("")}>
          {notice}
        </Alert>
      )}
      {pageError && (
        <Alert severity="error" sx={{ mb: 1 }} onClose={() => setPageError("")}>
          {pageError}
        </Alert>
      )}

      {/* Contacts Tab */}
      {tab === "contacts" && (
        <ContactsTable
          contacts={contacts.contacts}
          loading={contacts.loading}
          onAddContact={() => { setDialogError(""); contactForm.openCreateDialog(); }}
          onEditContact={(c) => { setDialogError(""); contactForm.openEditDialog(c); }}
          onDeleteContact={handleDeleteContact}
          onUploadClick={fileUpload.openUploadDialog}
          onDownloadTemplate={fileUpload.downloadTemplate}
          onPrintContacts={utils.printContacts}
          formatDate={utils.formatDate}
          hasPhone={utils.hasPhone}
          hasEmail={utils.hasEmail}
          selectedIds={selectedContactIds}
          onSelectionChange={setSelectedIds}
          onMessageSelected={() => setTab("message")}
        />
      )}

      {/* Message Tab */}
      {tab === "message" && (
        <BulkMessageForm
          contacts={contacts.contacts}
          selectedIds={selectedContactIds}
          onChooseContacts={() => setTab("contacts")}
          messageForm={bulkMessaging.messageForm}
          sending={bulkMessaging.sending}
          error={bulkMessaging.error}
          onMessageChange={bulkMessaging.updateMessageForm}
          onCheckboxChange={bulkMessaging.updateMessageCheckbox}
          onSendMessage={handleSendBulkMessage}
        />
      )}

      {/* Activity: sent texts, sent emails and replies */}
      {tab === "activity" && <ActivityTab contacts={contacts.contacts} />}

      {/* Automations (admin-only): the automatic text and email schedules, same settings as the Messages page */}
      {tab === "automations" && isAdmin && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 3, alignItems: "flex-start" }}>
          <Box sx={{ flex: "1 1 440px", minWidth: 0 }}><AutoSMSSetUpPage embedded hideLog /></Box>
          <Box sx={{ flex: "1 1 440px", minWidth: 0 }}><AutoEmailSetUpPage embedded hideLog /></Box>
        </Box>
      )}

      </CommunicatorToolbarSlotContext.Provider>

      {token && <CommunicatorAssistantDock onNavigate={handleAssistantNavigate} />}

      {/* Contact Form Dialog */}
      <ContactFormDialog
        open={contactForm.dialogOpen}
        editingContact={contactForm.editingContact}
        contactForm={contactForm.contactForm}
        error={dialogError}
        saving={saving}
        onClose={() => {
          setDialogError("");
          contactForm.closeDialog();
        }}
        onSave={handleSaveContact}
        onFormChange={contactForm.updateContactForm}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete contact?"
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        confirmColor="error"
        busy={deleting}
        onConfirm={performDeleteContact}
        onClose={() => setDeleteTarget(null)}
      >
        {deleteTarget?.name} will be removed from your contacts.
      </ConfirmDialog>

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
