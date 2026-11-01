import React, { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import RegistrationConfig from "./RegistrationConfig";
import RegistrationFieldSettings from "./RegistrationFieldSettings";
import RegistrationDictionaries from "./RegistrationDictionaries";
import InsuranceSetup from "./InsuranceSetup";
import CustomFormsBuilder from "./CustomFormsBuilder";
import RegionalSettings from "./RegionalSettings";

const PARTS = [
  { value: "steps", label: "Step sequence" },
  { value: "fields", label: "Field settings" },
  { value: "dictionaries", label: "Dictionaries" },
  { value: "insurance", label: "Insurance setup" },
  { value: "forms", label: "Forms" },
  { value: "regional", label: "Regional and ZIP" },
];

/** The Configuration tab of the Register page. Administrators only. */
export default function RegistrationSetup() {
  const [part, setPart] = useState("steps");
  return (
    <Box data-testid="registration-setup">
      <Tabs value={part} onChange={(e, v) => setPart(v)} sx={{ mb: 2, minHeight: 36, "& .MuiTab-root": { minHeight: 36, textTransform: "none" } }}>
        {PARTS.map((p) => (
          <Tab key={p.value} value={p.value} label={p.label} data-testid={`setup-tab-${p.value}`} />
        ))}
      </Tabs>
      {part === "steps" && <RegistrationConfig />}
      {part === "fields" && <RegistrationFieldSettings />}
      {part === "dictionaries" && <RegistrationDictionaries />}
      {part === "insurance" && <InsuranceSetup />}
      {part === "forms" && <CustomFormsBuilder />}
      {part === "regional" && <RegionalSettings />}
    </Box>
  );
}
