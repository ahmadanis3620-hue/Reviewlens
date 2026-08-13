/**
 * `server-only` is a marker package whose default entry throws outside the
 * React Server runtime. Tests import server modules directly in Node, so it is
 * aliased to this no-op — the guard still applies to the real client bundle,
 * which is where it matters.
 */
export {};
