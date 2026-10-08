import { Box } from "@mui/material";
import ChartPageShell from "../components/patients/ChartPageShell";
import TaskWorklist from "../components/tasks/TaskWorklist";

/**
 * Task Manager (/tasks): every nurse task made from signed orders -- medications due now,
 * what is overdue or missed, and what is coming up -- across the clinic.
 */
function TaskManagerPage() {
  return (
    <ChartPageShell>
      <Box data-testid="task-manager-page" sx={{ bgcolor: "background.paper", pb: 2 }}>
        <TaskWorklist />
      </Box>
    </ChartPageShell>
  );
}

export default TaskManagerPage;
