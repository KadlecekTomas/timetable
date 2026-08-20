// Compatibility shim for historical imports.
//
// The previous v3 preset contained two school-specific assumptions that are no
// longer authoritative: it rewrote 9.A/9.C PE staffing and merged JAZ2 across
// whole grades. V4 keeps the public API but derives structure from the imported
// teaching matrix instead.
export * from "./teaching-plan-school-v4";
