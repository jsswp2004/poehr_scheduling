import React from "react";
import { Container, Grid } from "@mui/material";
import {
  useMaintenanceData,
  useScheduleManagement,
  useScheduleForm,
  useTableAutoScroll,
} from "../hooks/maintenance";
import { ScheduleForm, ScheduleOverview } from "../components/maintenance";
import { min } from "date-fns";

function MaintenancePage() {
  // Custom hooks
  const { doctors, holidays, selectedDoctor, handleDoctorChange, token } =
    useMaintenanceData();

  const { schedules, editingId, setEditingId, fetchSchedules, handleDelete } =
    useScheduleManagement(selectedDoctor, token);

  const {
    formData,
    handleChange,
    updateFormData,
    handleSubmit,
    handleCancel,
    populateEditForm,
  } = useScheduleForm(
    selectedDoctor,
    token,
    editingId,
    setEditingId,
    fetchSchedules,
    holidays
  );

  const { availabilityTableRef, blockedTableRef } =
    useTableAutoScroll(schedules);

  // Handle edit action
  const handleEdit = (schedule) => {
    populateEditForm(schedule, doctors);
    const doc = doctors.find((doc) => doc.id === schedule.doctor);
    if (doc) {
      handleDoctorChange(doc.id);
    }
  };

  return (
    <Container
      maxWidth={false}
      disableGutters
      sx={{
        py: 0,
        px: 0,
        textAlign: "left",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <Grid
        container
        spacing={4}
        justifyContent="flex-start"
        alignItems="stretch"
        sx={{ ml: 0, height: "calc(100vh - 120px)" }}
      >
        {/* LEFT: Schedule Maintenance Form */}
        <Grid
          item
          xs={12}
          md={6}
          lg={6}
          xl={6}
          sx={{
            pl: 0,
            display: "flex",
            flexDirection: "column",
           
          }}
        >
          <ScheduleForm
            formData={formData}
            editingId={editingId}
            doctors={doctors}
            selectedDoctor={selectedDoctor}
            onDoctorChange={handleDoctorChange}
            onFormChange={handleChange}
            onUpdateFormData={updateFormData}
            onSubmit={handleSubmit}
            onCancel={handleCancel}
          />
        </Grid>

        {/* RIGHT: Schedule Overview */}
        <Grid
          item
          xs={12}
          md={6}
          lg={6}
          xl={6}
          sx={{
            pl: 0,
            display: "flex",
            flexDirection: "column"
        
          }}
        >
          <ScheduleOverview
            schedules={schedules}
            doctors={doctors}
            availabilityTableRef={availabilityTableRef}
            blockedTableRef={blockedTableRef}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        </Grid>
      </Grid>
    </Container>
  );
}

export default MaintenancePage;
