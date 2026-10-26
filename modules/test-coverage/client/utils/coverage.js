/** Filter coverage rows to one working group; an empty key returns all rows. */
export function filterByGroup(rows, groupKey) {
  return groupKey ? (rows || []).filter((row) => row.group === groupKey) : (rows || [])
}
