import VisitRow from "./VisitRow";

/** The tracking board: a list of visits, or a short sentence telling staff what to do next. */
export default function Board({ items, loading, error, empty, label, ...rowProps }) {
  if (error && items.length === 0) {
    return (
      <p className="th-callout th-callout--alert" role="alert">
        We couldn't load the schedule. Check your connection; this page keeps trying.
      </p>
    );
  }
  if (loading && items.length === 0) return <p role="status">Loading visits…</p>;
  if (items.length === 0) return <p className="th-empty">{empty}</p>;
  return (
    <ul className="th-board" aria-label={label}>
      {items.map((item) => (
        <VisitRow key={item.appointment_id} item={item} {...rowProps} />
      ))}
    </ul>
  );
}
