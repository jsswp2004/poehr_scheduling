/**
 * The units offered by the Unit filter on the Acute Care list: the inpatient units of every facility.
 * With several facilities a unit's full label carries its facility ("Medicine (Riverside Hospital)") so two
 * units with the same name can be told apart in the open list; `short` is just the unit's own name, which
 * is what the closed filter shows so it takes little room.
 */
export function unitOptionsFrom(tree) {
  const facilities = tree || [];
  return facilities.flatMap((f) =>
    (f.units || [])
      .filter((u) => u.care_type === "inpatient")
      .map((u) => ({ id: u.id, name: facilities.length > 1 ? `${u.name} (${f.name})` : u.name, short: u.name }))
  );
}
