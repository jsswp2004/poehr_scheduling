import { useEffect, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import axios from "axios";
import { apiEndpoints } from "../config/api";
import AnnouncementCard from "./announcements/AnnouncementCard";

// The announcements an organization has switched on for this person today (patients or staff, by role).
const AnnouncementDisplay = () => {
  const [items, setItems] = useState([]);

  useEffect(() => {
    let cancelled = false;
    axios
      .get(`${apiEndpoints.communicatorAnnouncements}?view=portal`)
      .then((res) => {
        if (!cancelled) setItems(Array.isArray(res.data) ? res.data : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (items.length === 0) {
    return (
      <Box sx={{ p: 2, bgcolor: "grey.50", borderRadius: 1, border: "1px dashed", borderColor: "grey.300", textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No announcements at this time
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      {items.map((a) => (
        <AnnouncementCard key={a.id} announcement={a} />
      ))}
    </Stack>
  );
};

export default AnnouncementDisplay;
