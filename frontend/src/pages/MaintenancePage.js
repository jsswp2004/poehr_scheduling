import { useState, useEffect, useRef, useCallback } from "react";
import axios from "axios";
import {
  Box,
  Stack,
  Typography,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select as MUISelect,
  MenuItem,
  Checkbox,
  FormControlLabel,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Container,
  IconButton,
  Tooltip,
} from "@mui/material";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash } from "@fortawesome/free-solid-svg-icons";
import { toast } from "react-toastify";

function MaintenancePage() {
  const [editingId, setEditingId] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [doctors, setDoctors] = useState([]);
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [holidays, setHolidays] = useState([]);

  // Refs for auto-scrolling tables
  const availabilityTableRef = useRef(null);
  const blockedTableRef = useRef(null);
  const [formData, setFormData] = useState({
    start_time: getTodayAt(8),
    end_time: getTodayAt(17),
    is_blocked: false,
    recurrence: "none",
    recurrence_end_date: "",
    block_type: "Lunch", // NEW
  });

  const token = localStorage.getItem("access_token");
  const isFetchingRef = useRef(false);

  function getTodayAt(hour, minute = 0) {
    const date = new Date();
    date.setHours(hour, minute, 0, 0);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
  }

  // Unique by doctor, start_time, end_time, is_blocked (dedupes recurrences)
  const uniqueByTime = (arr) => {
    const seen = new Set();
    return arr.filter((item) => {
      const key = `${item.doctor}_${item.start_time}_${item.end_time}_${item.is_blocked}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const res = await axios.get(
          "http://127.0.0.1:8000/api/users/doctors/",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setDoctors(res.data);
      } catch (err) {
        toast.error("Error loading doctors.");
      }
    };
    fetchDoctors();
  }, [token]);

  useEffect(() => {
    const fetchHolidays = async () => {
      try {
        const res = await axios.get("http://127.0.0.1:8000/api/holidays/", {
          headers: { Authorization: `Bearer ${token}` },
        });
        setHolidays(res.data.filter((h) => h.is_recognized));
      } catch { }
    };
    fetchHolidays();
  }, [token]);
  const fetchSchedules = useCallback(async () => {
    if (!selectedDoctor || isFetchingRef.current) return;
    try {
      isFetchingRef.current = true;
      const res = await axios.get("http://127.0.0.1:8000/api/availability/", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const doctorSchedules = res.data.filter(
        (s) => String(s.doctor) === String(selectedDoctor.value)
      );
      console.log("Doctor schedules:", doctorSchedules); // Debug log
      setSchedules(uniqueByTime(doctorSchedules));
    } catch {
      toast.error("Failed to load schedules.");
    } finally {
      isFetchingRef.current = false;
    }
  }, [selectedDoctor, token]);

  useEffect(() => {
    if (selectedDoctor) fetchSchedules();
  }, [selectedDoctor, fetchSchedules]);

  // Auto-scroll effect for tables when schedules change
  useEffect(() => {
    if (schedules.length > 0) {
      // Auto-scroll availability table to bottom with smooth behavior
      if (availabilityTableRef.current) {
        const availabilityContainer = availabilityTableRef.current;
        setTimeout(() => {
          availabilityContainer.scrollTo({
            top: availabilityContainer.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      }

      // Auto-scroll blocked table to bottom with smooth behavior
      if (blockedTableRef.current) {
        const blockedContainer = blockedTableRef.current;
        setTimeout(() => {
          blockedContainer.scrollTo({
            top: blockedContainer.scrollHeight,
            behavior: "smooth",
          });
        }, 100);
      }
    }
  }, [schedules]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({ ...formData, [name]: type === "checkbox" ? checked : value });
  };

  const isHoliday = (dateStr) => {
    const date = new Date(dateStr);
    return holidays.some(
      (h) => new Date(h.date).toDateString() === date.toDateString()
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedDoctor || !formData.start_time || !formData.end_time) return;
    const startDate = new Date(formData.start_time);
    if ([0, 6].includes(startDate.getDay()) || isHoliday(formData.start_time))
      return;

    const payload = {
      doctor: selectedDoctor.value,
      start_time: new Date(formData.start_time).toISOString(),
      end_time: new Date(formData.end_time).toISOString(),
      is_blocked: formData.is_blocked,
      recurrence: formData.recurrence,
      recurrence_end_date: formData.recurrence_end_date || null,
      block_type: formData.is_blocked ? formData.block_type : null, // NEW
    };

    try {
      if (editingId) {
        await axios.put(
          `http://127.0.0.1:8000/api/availability/${editingId}/`,
          payload,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        toast.success("Schedule updated!");
      } else {
        await axios.post("http://127.0.0.1:8000/api/availability/", payload, {
          headers: { Authorization: `Bearer ${token}` },
        });
        toast.success("Schedule saved!");
      }
      setFormData({
        start_time: getTodayAt(8),
        end_time: getTodayAt(17),
        is_blocked: false,
        recurrence: "none",
        recurrence_end_date: "",
        block_type: "Lunch",
      });
      setEditingId(null);
      await fetchSchedules();
    } catch {
      toast.error("Failed to save schedule.");
    }
  };

  const handleEdit = (schedule) => {
    setEditingId(schedule.id);
    setFormData({
      start_time: toLocalDatetimeInputValue(schedule.start_time),
      end_time: toLocalDatetimeInputValue(schedule.end_time),
      is_blocked: schedule.is_blocked,
      recurrence: schedule.recurrence || "none",
      recurrence_end_date: schedule.recurrence_end_date || "",
      block_type: schedule.block_type || "Lunch", // NEW
    });
    const doc = doctors.find((doc) => doc.id === schedule.doctor);
    setSelectedDoctor(
      doc
        ? { value: doc.id, label: `Dr. ${doc.first_name} ${doc.last_name}` }
        : null
    );
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this schedule?")) return;
    try {
      await axios.delete(`http://127.0.0.1:8000/api/availability/${id}/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      toast.success("Deleted.");
      await fetchSchedules();
    } catch {
      toast.error("Failed to delete schedule.");
    }
  };

  const handleCancel = () => {
    setFormData({
      start_time: "",
      end_time: "",
      is_blocked: false,
      recurrence: "none",
      recurrence_end_date: "",
    });
    setEditingId(null);
  };

  const toLocalDatetimeInputValue = (isoString) => {
    const local = new Date(isoString);
    local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
    return local.toISOString().slice(0, 16);
  };

  return (
    <Container
      maxWidth={false}
      disableGutters
      sx={{
        py: 0,
        px: 0,
        textAlign: "left",
        height: "calc(100vh - 220px)", // Adjust for header height
        overflow: "hidden",
      }}
    >
      {/*<Box sx={{ mt: 4, boxShadow: 2, borderRadius: 2, bgcolor: 'background.paper', p: 3 }} >
        <Typography variant="h5" sx={{ mb: 2 }}>
          Clinician Schedule Maintenance 
        </Typography>
      </Box>*/}
      <Grid
        container
        spacing={1}
        justifyContent="flex-start"
        alignItems="stretch"
        sx={{ ml: 0, height: "50%", pt: 1 }}
      >
        {/* LEFT: Schedule Maintenance Form */}
        <Grid
          item
          xs={12}
          md={6}
          lg={6}
          xl={6}
          sx={{ pl: 0, display: "flex", flexDirection: "column" }}
        >
          <Box
            sx={{
              p: 1,
              minWidth: 400,
              width: "100%",
              textAlign: "left",
              flex: 1,
              display: "flex",
              flexDirection: "column",
              maxHeight: "100vh",
            }}
          >
            <form
              onSubmit={handleSubmit}
              style={{
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              <Stack spacing={2} sx={{ textAlign: "left" }}>
                <FormControl fullWidth>
                  <InputLabel shrink>Select Clinician</InputLabel>
                  <MUISelect
                    value={selectedDoctor?.value || ""}
                    label="Select Clinician"
                    displayEmpty
                    onChange={(e) => {
                      const doc = doctors.find((d) => d.id === e.target.value);
                      setSelectedDoctor(
                        doc
                          ? {
                            value: doc.id,
                            label: `Dr. ${doc.first_name} ${doc.last_name}`,
                          }
                          : null
                      );
                    }}
                  >
                    {doctors.map((doc) => (
                      <MenuItem
                        key={doc.id}
                        value={doc.id}
                      >{`Dr. ${doc.first_name} ${doc.last_name}`}</MenuItem>
                    ))}
                  </MUISelect>
                </FormControl>{" "}
                <TextField
                  fullWidth
                  label="Start Time"
                  type="datetime-local"
                  name="start_time"
                  value={formData.start_time}
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                  sx={{ "& .MuiInputBase-input": { fontSize: "0.875rem" } }}
                />
                <TextField
                  fullWidth
                  label="End Time"
                  type="datetime-local"
                  name="end_time"
                  value={formData.end_time}
                  onChange={handleChange}
                  InputLabelProps={{ shrink: true }}
                  sx={{ "& .MuiInputBase-input": { fontSize: "0.875rem" } }}
                />
                <FormControl fullWidth>
                  <InputLabel shrink>Recurrence</InputLabel>
                  <MUISelect
                    value={formData.recurrence}
                    label="Recurrence"
                    onChange={(e) =>
                      setFormData({ ...formData, recurrence: e.target.value })
                    }
                    displayEmpty
                  >
                    <MenuItem value="none">None</MenuItem>
                    <MenuItem value="daily">Daily</MenuItem>
                    <MenuItem value="weekly">Weekly</MenuItem>
                    <MenuItem value="monthly">Monthly</MenuItem>
                  </MUISelect>
                </FormControl>
                <TextField
                  fullWidth
                  type="date"
                  label="Recurrence End Date"
                  value={formData.recurrence_end_date || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      recurrence_end_date: e.target.value,
                    })
                  }
                  InputLabelProps={{ shrink: true }}
                  sx={{ "& .MuiInputBase-input": { fontSize: "0.875rem" } }}
                />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.is_blocked}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          is_blocked: e.target.checked,
                        })
                      }
                    />
                  }
                  label="Block this schedule"
                />
                {formData.is_blocked && (
                  <FormControl fullWidth>
                    <InputLabel shrink>Block Type</InputLabel>
                    <MUISelect
                      value={formData.block_type}
                      label="Block Type"
                      displayEmpty
                      onChange={(e) =>
                        setFormData({ ...formData, block_type: e.target.value })
                      }
                    >
                      <MenuItem value="Lunch">Lunch</MenuItem>
                      <MenuItem value="Meeting">Meeting</MenuItem>
                      <MenuItem value="Vacation">Vacation</MenuItem>
                      <MenuItem value="On Leave">On Leave</MenuItem>
                    </MUISelect>
                  </FormControl>
                )}
                <Box sx={{ mt: "auto", pt: 2 }}>
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    sx={{ mb: 1 }}
                  >
                    {editingId ? "Update" : "Save"}
                  </Button>
                  {editingId && (
                    <Button variant="outlined" onClick={handleCancel} fullWidth>
                      Cancel
                    </Button>
                  )}
                </Box>
              </Stack>
            </form>
          </Box>
        </Grid>
        {/* RIGHT: Schedule Overview */}
        <Grid item xs={12} md={6} lg={6} xl={6}>
          <Box
            sx={{
              p: 1,
              display: "flex",
              flexDirection: "column",
              //height: "100%",
              maxHeight: "100vh",
              overflowY: "hidden",
            }}
          >
            <Typography variant="h6" gutterBottom>
              Schedule Overview
            </Typography>
            <Box
              sx={{
                flex: 1,
                display: "flex",
                flexDirection: "row",
                gap: 1,
                minHeight: 0,
                maxHeight: "calc(100vh - 150px)",
              }}
            >
              {/* Availability Section */}
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  maxHeight: "100%",
                }}
              >
                <Typography color="success.main" sx={{ mb: 1 }}>
                  ✅ Availability
                </Typography>
                <TableContainer
                  component={Paper}
                  ref={availabilityTableRef}
                  sx={{
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    boxShadow: "none",
                    borderRadius: 0,
                    border: "1px solid #e0e0e0",
                    maxHeight: "calc(100vh - 200px)",
                    "&::-webkit-scrollbar": {
                      width: "8px",
                    },
                    "&::-webkit-scrollbar-track": {
                      background: "#f1f1f1",
                    },
                    "&::-webkit-scrollbar-thumb": {
                      background: "#888",
                      borderRadius: "4px",
                    },
                    "&::-webkit-scrollbar-thumb:hover": {
                      background: "#555",
                    },
                  }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date/Time</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {schedules.filter((s) => !s.is_blocked).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            align="center"
                            sx={{ py: 4, color: "text.secondary" }}
                          >
                            No availability schedules found
                          </TableCell>
                        </TableRow>
                      ) : (
                        schedules
                          .filter((s) => !s.is_blocked)
                          .map((s) => (
                            <TableRow key={s.id}>
                              <TableCell>{`${new Date(
                                s.start_time
                              ).toLocaleString()} — ${new Date(
                                s.end_time
                              ).toLocaleString()}`}</TableCell>
                              <TableCell align="right">
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexDirection: "row",
                                    justifyContent: "center",
                                    gap: 1,
                                  }}
                                >
                                  <Tooltip
                                    title="Edit schedule"
                                    placement="top"
                                  >
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      sx={{
                                        width: 36,
                                        height: 36,
                                        minWidth: 0,
                                        padding: 0,
                                        mr: 1,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                      onClick={() => handleEdit(s)}
                                    >
                                      <FontAwesomeIcon icon={faEdit} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip
                                    title="Delete schedule"
                                    placement="top"
                                  >
                                    <IconButton
                                      size="small"
                                      color="error"
                                      sx={{
                                        width: 36,
                                        height: 36,
                                        minWidth: 0,
                                        padding: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                      onClick={() => handleDelete(s.id)}
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>

              {/* Blocked Section */}
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  minHeight: 0,
                  maxHeight: "100%",
                }}
              >
                <Typography color="error.main" sx={{ mb: 1 }}>
                  🚫 Blocked
                </Typography>
                <TableContainer
                  component={Paper}
                  ref={blockedTableRef}
                  sx={{
                    flex: 1,
                    overflowY: "auto",
                    overflowX: "hidden",
                    boxShadow: "none",
                    borderRadius: 0,
                    border: "1px solid #e0e0e0",
                    maxHeight: "calc(100vh - 200px)",
                    "&::-webkit-scrollbar": {
                      width: "8px",
                    },
                    "&::-webkit-scrollbar-track": {
                      background: "#f1f1f1",
                    },
                    "&::-webkit-scrollbar-thumb": {
                      background: "#888",
                      borderRadius: "4px",
                    },
                    "&::-webkit-scrollbar-thumb:hover": {
                      background: "#555",
                    },
                  }}
                >
                  <Table size="small" stickyHeader>
                    <TableHead>
                      <TableRow>
                        <TableCell>Date/Time</TableCell>
                        <TableCell align="right">Actions</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {schedules.filter((s) => s.is_blocked).length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={2}
                            align="center"
                            sx={{ py: 4, color: "text.secondary" }}
                          >
                            No blocked schedules found
                          </TableCell>
                        </TableRow>
                      ) : (
                        schedules
                          .filter((s) => s.is_blocked)
                          .map((s) => (
                            <TableRow key={s.id}>
                              <TableCell>{`${new Date(
                                s.start_time
                              ).toLocaleString()} — ${new Date(
                                s.end_time
                              ).toLocaleString()} | ${s.block_type || "No Type"
                                } | Dr. ${doctors.find((d) => d.id === s.doctor)
                                  ?.first_name || ""
                                } ${doctors.find((d) => d.id === s.doctor)
                                  ?.last_name || ""
                                }`}</TableCell>
                              <TableCell align="right">
                                <Box
                                  sx={{
                                    display: "flex",
                                    flexDirection: "row",
                                    justifyContent: "center",
                                    gap: 1,
                                  }}
                                >
                                  <Tooltip
                                    title="Edit schedule"
                                    placement="top"
                                  >
                                    <IconButton
                                      size="small"
                                      color="primary"
                                      sx={{
                                        width: 36,
                                        height: 36,
                                        minWidth: 0,
                                        padding: 0,
                                        mr: 1,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                      onClick={() => handleEdit(s)}
                                    >
                                      <FontAwesomeIcon icon={faEdit} />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip
                                    title="Delete schedule"
                                    placement="top"
                                  >
                                    <IconButton
                                      size="small"
                                      color="error"
                                      sx={{
                                        width: 36,
                                        height: 36,
                                        minWidth: 0,
                                        padding: 0,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                      }}
                                      onClick={() => handleDelete(s.id)}
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </IconButton>
                                  </Tooltip>
                                </Box>
                              </TableCell>
                            </TableRow>
                          ))
                      )}
                    </TableBody>
                  </Table>
                </TableContainer>
              </Box>
            </Box>
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
}

export default MaintenancePage;
