/**
 * The units offered by the Unit filter on the Acute Care list: the inpatient units of the organization.
 *
 * The facility is added to a unit's label ("Medicine (Riverside Hospital)") only when units from MORE THAN ONE
 * facility are on offer, so that two units with the same name can be told apart. A facility with no inpatient
 * units (a clinic, say) offers nothing and so never triggers it. `short` is the unit's own name, which is what
 * the closed filter shows so it takes little room.
 */
export function unitOptionsFrom(tree) {
  const offered = (tree || [])
    .map((f) => ({ facility: f, units: (f.units || []).filter((u) => u.care_type === "inpatient") }))
    .filter((f) => f.units.length > 0);
  const several = offered.length > 1;
  return offered.flatMap(({ facility, units }) =>
    units.map((u) => ({ id: u.id, name: several ? `${u.name} (${facility.name})` : u.name, short: u.name }))
  );
}
