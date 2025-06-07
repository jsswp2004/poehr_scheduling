// Test script to validate the appointments integration
const fs = require('fs');
const path = require('path');

// Read the PatientsPage.js file
const patientsPagePath = path.join(__dirname, 'frontend', 'src', 'pages', 'PatientsPage.js');
const content = fs.readFileSync(patientsPagePath, 'utf8');

console.log('Testing appointments integration in PatientsPage...');

// Check for required imports
const requiredImports = [
  'Pagination',
  'VisibilityIcon',
  'DeleteIcon'
];

const importErrors = [];
requiredImports.forEach(imp => {
  if (!content.includes(imp)) {
    importErrors.push(`Missing import: ${imp}`);
  }
});

// Check for required state variables
const requiredStateVars = [
  'appointmentsQuery',
  'appointmentsResults',
  'appointmentsPage',
  'selectedAppointment',
  'detailsOpen'
];

const stateErrors = [];
requiredStateVars.forEach(state => {
  if (!content.includes(state)) {
    stateErrors.push(`Missing state variable: ${state}`);
  }
});

// Check for required functions
const requiredFunctions = [
  'fetchAppointments',
  'handleAppointmentsSearch'
];

const functionErrors = [];
requiredFunctions.forEach(func => {
  if (!content.includes(func)) {
    functionErrors.push(`Missing function: ${func}`);
  }
});

// Check for appointments table structure
const tableStructureChecks = [
  'Clinic Event',
  'appointmentsResults',
  'appointmentsPage',
  'Appointment Details Dialog'
];

const structureErrors = [];
tableStructureChecks.forEach(check => {
  if (!content.includes(check)) {
    structureErrors.push(`Missing table structure: ${check}`);
  }
});

// Report results
console.log('\n=== TEST RESULTS ===');
if (importErrors.length === 0) {
  console.log('✅ All required imports present');
} else {
  console.log('❌ Import errors:', importErrors);
}

if (stateErrors.length === 0) {
  console.log('✅ All required state variables present');
} else {
  console.log('❌ State errors:', stateErrors);
}

if (functionErrors.length === 0) {
  console.log('✅ All required functions present');
} else {
  console.log('❌ Function errors:', functionErrors);
}

if (structureErrors.length === 0) {
  console.log('✅ All table structure elements present');
} else {
  console.log('❌ Structure errors:', structureErrors);
}

// Check if AppointmentsPage import was removed
if (content.includes("import AppointmentsPage from './AppointmentsPage'")) {
  console.log('❌ AppointmentsPage import should be removed');
} else {
  console.log('✅ AppointmentsPage import successfully removed');
}

// Check if AppointmentsPage component usage was removed
if (content.includes('<AppointmentsPage />')) {
  console.log('❌ AppointmentsPage component usage should be removed');
} else {
  console.log('✅ AppointmentsPage component usage successfully removed');
}

const totalErrors = importErrors.length + stateErrors.length + functionErrors.length + structureErrors.length;
console.log(`\n=== SUMMARY ===`);
console.log(`Total errors: ${totalErrors}`);
if (totalErrors === 0) {
  console.log('🎉 All tests passed! The appointments integration looks good.');
} else {
  console.log('⚠️  Some issues found. Please review the errors above.');
}
