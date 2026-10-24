// String format checks. Every regular expression here is linear-time: no nested or overlapping
// quantifiers, so they are safe against ReDoS. Lengths are checked before matching.

const EMAIL =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/**
 * Practical email check: dot-atom local part (max 64 chars), a domain with at least one dot,
 * total length at most 254. Quoted local parts, IP-literal domains and non-ASCII are rejected.
 */
export function isEmail(value: string): boolean {
  if (value.length > 254) return false;
  const at = value.lastIndexOf('@');
  if (at < 1 || at > 64) return false;
  return EMAIL.test(value);
}

const DOT_STRING = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const QUOTED_STRING = /^"(?:[\x20\x21\x23-\x5b\x5d-\x7e]|\\[\x20-\x7e])*"$/;
const GENERAL_LITERAL = /^[A-Za-z0-9-]*[A-Za-z0-9]:[\x21-\x5a\x5e-\x7e]+$/;

/**
 * RFC 5321 `Mailbox`, as required by JSON Schema's `email` format: dot-string or quoted local
 * part, and a domain or an address literal (`[192.0.2.1]`, `[IPv6:...]`). ASCII only.
 */
export function isMailbox(value: string): boolean {
  if (value.length > 320) return false;
  const at = value.lastIndexOf('@');
  if (at < 1) return false;
  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!(DOT_STRING.test(local) || QUOTED_STRING.test(local))) return false;
  if (domain.startsWith('[') && domain.endsWith(']')) {
    const literal = domain.slice(1, -1);
    if (/^ipv6:/i.test(literal)) return isIPv6(literal.slice(5));
    return isIPv4(literal) || (!literal.includes('.') && GENERAL_LITERAL.test(literal) && !/^ipv6:/i.test(literal));
  }
  return isHostname(domain);
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** RFC 9562 textual form, any version or variant (including the nil and max UUIDs). */
export function isUUID(value: string): boolean {
  return value.length === 36 && UUID.test(value);
}

const IPV4 = /^(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?:\.(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

/** Dotted-quad IPv4; leading zeros are rejected because they are ambiguous (octal). */
export function isIPv4(value: string): boolean {
  return value.length <= 15 && IPV4.test(value);
}

const HEX_GROUP = /^[0-9a-fA-F]{1,4}$/;

/** RFC 4291 text form, including `::` compression and an embedded IPv4 tail. No zone IDs. */
export function isIPv6(value: string): boolean {
  if (value.length < 2 || value.length > 45) return false;
  const halves = value.split('::');
  if (halves.length > 2) return false;
  const groups: string[] = [];
  const parts = halves.map((half) => (half === '' ? [] : half.split(':')));
  for (const part of parts) groups.push(...part);
  let count = groups.length;
  const last = groups[groups.length - 1];
  if (last !== undefined && last.includes('.')) {
    if (!isIPv4(last)) return false;
    groups.pop();
    count += 1; // An IPv4 tail occupies two groups.
  }
  for (const group of groups) if (!HEX_GROUP.test(group)) return false;
  return halves.length === 2 ? count <= 7 : count === 8;
}

const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

/** RFC 1123 hostname: dot-separated labels of 1-63 letters, digits and inner hyphens. */
export function isHostname(value: string): boolean {
  if (value.length === 0 || value.length > 253) return false;
  for (const label of value.split('.')) {
    if (!LABEL.test(label)) return false;
    // RFC 5891: "--" in positions 3-4 is reserved for A-labels (xn--).
    if (label[2] === '-' && label[3] === '-' && label.slice(0, 2).toLowerCase() !== 'xn') return false;
  }
  return true;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAYS = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeap(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

/** RFC 3339 full-date `YYYY-MM-DD` with a real calendar day. */
export function isDate(value: string): boolean {
  const m = DATE.exec(value);
  if (m === null) return false;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= (month === 2 && isLeap(year) ? 29 : DAYS[month]!);
}

const RFC_TIME = /^(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?([Zz]|([+-])(\d{2}):(\d{2}))$/;

/**
 * RFC 3339 full-time `HH:MM:SS[.frac](Z|±HH:MM)`. A leap second (`:60`) is accepted only when the
 * time is 23:59 UTC.
 */
export function isRFC3339Time(value: string): boolean {
  const m = RFC_TIME.exec(value);
  if (m === null) return false;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  const second = Number(m[3]);
  const offH = m[6] === undefined ? 0 : Number(m[6]);
  const offM = m[7] === undefined ? 0 : Number(m[7]);
  if (hour > 23 || minute > 59 || second > 60 || offH > 23 || offM > 59) return false;
  if (second === 60) {
    const sign = m[5] === '-' ? 1 : -1;
    const utc = (((hour * 60 + minute + sign * (offH * 60 + offM)) % 1440) + 1440) % 1440;
    return utc === 23 * 60 + 59;
  }
  return true;
}

/** RFC 3339 date-time: full-date, `T`, full-time. */
export function isRFC3339DateTime(value: string): boolean {
  const separator = value[10];
  return (separator === 'T' || separator === 't') && isDate(value.slice(0, 10)) && isRFC3339Time(value.slice(11));
}

const LOCAL_TIME = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?$/;

/** Local time `HH:MM`, `HH:MM:SS` or `HH:MM:SS.fff`, as produced by `<input type="time">`. */
export function isLocalTime(value: string): boolean {
  const m = LOCAL_TIME.exec(value);
  if (m === null) return false;
  return Number(m[1]) <= 23 && Number(m[2]) <= 59 && (m[3] === undefined || Number(m[3]) <= 59);
}

/** Local date-time `YYYY-MM-DDTHH:MM[:SS[.fff]]`, as produced by `<input type="datetime-local">`. */
export function isLocalDateTime(value: string): boolean {
  return value[10] === 'T' && isDate(value.slice(0, 10)) && isLocalTime(value.slice(11));
}

const DURATION =
  /^P(?:(?:\d+Y(?:\d+M(?:\d+D)?)?|\d+M(?:\d+D)?|\d+D)(?:T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S))?|T(?:\d+H(?:\d+M(?:\d+S)?)?|\d+M(?:\d+S)?|\d+S)|\d+W)$/;

/** RFC 3339 Appendix A (ISO 8601) duration, e.g. `P1Y2M10DT2H30M` or `P3W`. */
export function isDuration(value: string): boolean {
  return DURATION.test(value);
}

// RFC 3986 URI and URI-reference. Built from the ABNF with no nested quantifiers.
const PCT = '%[0-9A-Fa-f]{2}';
const UNRESERVED = "A-Za-z0-9\\-._~!$&'()*+,;=";
const PCHAR = `(?:[${UNRESERVED}:@]|${PCT})`;
const USERINFO = `(?:[${UNRESERVED}:]|${PCT})*`;
const IP_LITERAL = '\\[[0-9A-Fa-f:.vV]+\\]';
const REG_NAME = `(?:[${UNRESERVED}]|${PCT})*`;
const AUTHORITY = `(?:${USERINFO}@)?(?:${IP_LITERAL}|${REG_NAME})(?::\\d*)?`;
const PATH_ABEMPTY = `(?:/${PCHAR}*)*`;
const PATH_ABSOLUTE = `/(?:${PCHAR}+${PATH_ABEMPTY})?`;
const PATH_ROOTLESS = `${PCHAR}+${PATH_ABEMPTY}`;
const PATH_NOSCHEME = `(?:[${UNRESERVED}@]|${PCT})+${PATH_ABEMPTY}`;
const QUERY = `(?:\\?(?:${PCHAR}|[/?])*)?`;
const FRAGMENT = `(?:#(?:${PCHAR}|[/?])*)?`;
const HIER = `(?://${AUTHORITY}${PATH_ABEMPTY}|${PATH_ABSOLUTE}|${PATH_ROOTLESS}|)`;
const RELATIVE = `(?://${AUTHORITY}${PATH_ABEMPTY}|${PATH_ABSOLUTE}|${PATH_NOSCHEME}|)`;
const URI = /* @__PURE__ */ new RegExp(`^[A-Za-z][A-Za-z0-9+\\-.]*:${HIER}${QUERY}${FRAGMENT}$`);
const URI_REFERENCE = /* @__PURE__ */ new RegExp(
  `^(?:[A-Za-z][A-Za-z0-9+\\-.]*:${HIER}|${RELATIVE})${QUERY}${FRAGMENT}$`,
);

const IP_FUTURE = /^v[0-9A-Fa-f]+\.[A-Za-z0-9\-._~!$&'()*+,;=:]+$/;

/** The bracketed host of a URI, if any, must be a valid IPv6 address or IPvFuture literal. */
function validIPLiteral(value: string): boolean {
  const open = value.indexOf('[');
  if (open === -1) return true;
  const close = value.indexOf(']', open);
  if (close === -1) return false;
  const literal = value.slice(open + 1, close);
  return isIPv6(literal) || IP_FUTURE.test(literal);
}

/** RFC 3986 absolute URI (any scheme). */
export function isURI(value: string): boolean {
  return URI.test(value) && validIPLiteral(value);
}

/** RFC 3986 URI-reference: an absolute URI or a relative reference. */
export function isURIReference(value: string): boolean {
  return URI_REFERENCE.test(value) && validIPLiteral(value);
}

const HTTP_PROTOCOLS: readonly string[] = ['http', 'https'];

/**
 * A URL that the WHATWG `URL` parser accepts, contains no whitespace, is at most 8192 characters
 * and uses one of `protocols` (default `http` and `https`, compared case-insensitively).
 */
export function isURL(value: string, protocols: readonly string[] = HTTP_PROTOCOLS): boolean {
  if (value.length > 8192 || /\s/.test(value)) return false;
  const colon = value.indexOf(':');
  if (colon < 1) return false;
  const scheme = value.slice(0, colon).toLowerCase();
  if (!protocols.includes(scheme)) return false;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** JSON Pointer (RFC 6901). */
export function isJSONPointer(value: string): boolean {
  return /^(?:\/(?:[^~/]|~[01])*)*$/.test(value);
}

/** Relative JSON Pointer (draft-handrews-relative-json-pointer-01). */
export function isRelativeJSONPointer(value: string): boolean {
  return /^(?:0|[1-9]\d*)(?:#|(?:\/(?:[^~/]|~[01])*)*)$/.test(value);
}

const VARSPEC = '(?:\\w|%[0-9A-Fa-f]{2})(?:\\.?(?:\\w|%[0-9A-Fa-f]{2}))*(?::[1-9]\\d{0,3}|\\*)?';
const URI_TEMPLATE = /* @__PURE__ */ new RegExp(
  `^(?:[^\\x00-\\x20\\x7f"<>%\\\\^\`{|}]|%[0-9A-Fa-f]{2}|\\{[+#./;?&=,!@|]?${VARSPEC}(?:,${VARSPEC})*\\})*$`,
);

/** RFC 6570 URI Template (up to level 4). */
export function isURITemplate(value: string): boolean {
  return URI_TEMPLATE.test(value);
}

/** A JavaScript regular expression source with the `u` flag (closest to ECMA-262 semantics). */
export function isRegex(value: string): boolean {
  try {
    new RegExp(value, 'u');
    return true;
  } catch {
    return false;
  }
}
