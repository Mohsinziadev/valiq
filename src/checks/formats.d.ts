/**
 * Practical email check: dot-atom local part (max 64 chars), a domain with at least one dot,
 * total length at most 254. Quoted local parts, IP-literal domains and non-ASCII are rejected.
 */
export declare function isEmail(value: string): boolean;
/**
 * RFC 5321 `Mailbox`, as required by JSON Schema's `email` format: dot-string or quoted local
 * part, and a domain or an address literal (`[192.0.2.1]`, `[IPv6:...]`). ASCII only.
 */
export declare function isMailbox(value: string): boolean;
/** RFC 9562 textual form, any version or variant (including the nil and max UUIDs). */
export declare function isUUID(value: string): boolean;
/** Dotted-quad IPv4; leading zeros are rejected because they are ambiguous (octal). */
export declare function isIPv4(value: string): boolean;
/** RFC 4291 text form, including `::` compression and an embedded IPv4 tail. No zone IDs. */
export declare function isIPv6(value: string): boolean;
/** RFC 1123 hostname: dot-separated labels of 1-63 letters, digits and inner hyphens. */
export declare function isHostname(value: string): boolean;
/** RFC 3339 full-date `YYYY-MM-DD` with a real calendar day. */
export declare function isDate(value: string): boolean;
/**
 * RFC 3339 full-time `HH:MM:SS[.frac](Z|±HH:MM)`. A leap second (`:60`) is accepted only when the
 * time is 23:59 UTC.
 */
export declare function isRFC3339Time(value: string): boolean;
/** RFC 3339 date-time: full-date, `T`, full-time. */
export declare function isRFC3339DateTime(value: string): boolean;
/** Local time `HH:MM`, `HH:MM:SS` or `HH:MM:SS.fff`, as produced by `<input type="time">`. */
export declare function isLocalTime(value: string): boolean;
/** Local date-time `YYYY-MM-DDTHH:MM[:SS[.fff]]`, as produced by `<input type="datetime-local">`. */
export declare function isLocalDateTime(value: string): boolean;
/** RFC 3339 Appendix A (ISO 8601) duration, e.g. `P1Y2M10DT2H30M` or `P3W`. */
export declare function isDuration(value: string): boolean;
/** RFC 3986 absolute URI (any scheme). */
export declare function isURI(value: string): boolean;
/** RFC 3986 URI-reference: an absolute URI or a relative reference. */
export declare function isURIReference(value: string): boolean;
/**
 * A web URL: parsable by the WHATWG `URL` parser, written with an explicit `scheme://` and no
 * whitespace, using one of `protocols` (default `http` and `https`).
 */
export declare function isURL(value: string, protocols?: readonly string[]): boolean;
/** JSON Pointer (RFC 6901). */
export declare function isJSONPointer(value: string): boolean;
/** Relative JSON Pointer (draft-handrews-relative-json-pointer-01). */
export declare function isRelativeJSONPointer(value: string): boolean;
/** RFC 6570 URI Template (up to level 4). */
export declare function isURITemplate(value: string): boolean;
/** A JavaScript regular expression source with the `u` flag (closest to ECMA-262 semantics). */
export declare function isRegex(value: string): boolean;
