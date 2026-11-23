const DATABASE_NOW_RE =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,6})?Z$/;

/**
 * Accept only real UTC timestamps matching the database RPC metadata contract.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isValidDatabaseNow(value) {
  if (typeof value !== "string" || !DATABASE_NOW_RE.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 19) === value.slice(0, 19);
}
