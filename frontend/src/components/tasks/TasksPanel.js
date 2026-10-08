import TaskWorklist from "./TaskWorklist";

/** The Task List chart tab: the selected patient's tasks. */
export default function TasksPanel({ patient }) {
  return <TaskWorklist key={patient.id} patient={patient} />;
}
