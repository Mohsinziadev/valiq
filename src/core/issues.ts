/** A segment of an issue path: an object key or an array index. */
export type PathKey = string | number;

/** What a size constraint was measured on. */
export type SizeOrigin = 'string' | 'number' | 'array' | 'object' | 'date' | 'contains';

interface IssueBase {
  /** Location of the failing value, from the root of the input. Empty for the root itself. */
  path: PathKey[];
  /** Human-readable description. Never contains the input value. */
  message: string;
  /** JSON Schema keyword that produced the issue (JSON Schema validators only). */
  keyword?: string;
  /** JSON Pointer to that keyword inside the schema (JSON Schema validators only). */
  schemaPath?: string;
}

/** The value has the wrong type. `received` is a type name, never the value. */
export interface InvalidTypeIssue extends IssueBase {
  code: 'invalid_type';
  expected: string;
  received: string;
}

/** A required object property is missing (or `undefined`). */
export interface RequiredIssue extends IssueBase {
  code: 'required';
}

/** The value is not one of the allowed literal values. */
export interface InvalidValueIssue extends IssueBase {
  code: 'invalid_value';
  values: readonly unknown[];
}

/** A string, number, array, object or date is below its lower bound. */
export interface TooSmallIssue extends IssueBase {
  code: 'too_small';
  origin: SizeOrigin;
  minimum: number;
  inclusive: boolean;
  /** Set when the constraint is an exact length. */
  exact?: true;
}

/** A string, number, array, object or date is above its upper bound. */
export interface TooBigIssue extends IssueBase {
  code: 'too_big';
  origin: SizeOrigin;
  maximum: number;
  inclusive: boolean;
  exact?: true;
}

export interface NotMultipleOfIssue extends IssueBase {
  code: 'not_multiple_of';
  divisor: number;
}

/** A string does not match a named format such as `email` or `uuid`. */
export interface InvalidFormatIssue extends IssueBase {
  code: 'invalid_format';
  format: string;
}

/** A string does not match a regular expression. */
export interface InvalidPatternIssue extends IssueBase {
  code: 'invalid_pattern';
  pattern: string;
}

/** A strict object received properties that are not part of its shape. */
export interface UnrecognizedKeysIssue extends IssueBase {
  code: 'unrecognized_keys';
  /** The unexpected keys (at most 100 are listed). */
  keys: string[];
}

/** A record or object key failed its key schema. `issues` describe the key itself. */
export interface InvalidKeyIssue extends IssueBase {
  code: 'invalid_key';
  issues: Issue[];
}

/** No union member (or, for `oneOf`, not exactly one member) accepted the value. */
export interface InvalidUnionIssue extends IssueBase {
  code: 'invalid_union';
  /** Issues reported by each member, with absolute paths. Empty when `matched` is set. */
  branches: Issue[][];
  /** For JSON Schema `oneOf`: how many members matched when more than one did. */
  matched?: number;
}

/** Two array items are deeply equal although the array must be unique. */
export interface NotUniqueIssue extends IssueBase {
  code: 'not_unique';
  indexes: [number, number];
}

/** The value is not allowed at all (JSON Schema `false` or `not`). */
export interface ForbiddenIssue extends IssueBase {
  code: 'forbidden';
}

/** Validation stopped because recursive schemas nested deeper than `maxDepth`. */
export interface TooDeepIssue extends IssueBase {
  code: 'too_deep';
  maxDepth: number;
}

/** Produced by `.refine()` and `v.custom()`. */
export interface CustomIssue extends IssueBase {
  code: 'custom';
  params?: Record<string, unknown> | undefined;
}

export type Issue =
  | InvalidTypeIssue
  | RequiredIssue
  | InvalidValueIssue
  | TooSmallIssue
  | TooBigIssue
  | NotMultipleOfIssue
  | InvalidFormatIssue
  | InvalidPatternIssue
  | UnrecognizedKeysIssue
  | InvalidKeyIssue
  | InvalidUnionIssue
  | NotUniqueIssue
  | ForbiddenIssue
  | TooDeepIssue
  | CustomIssue;

export type IssueCode = Issue['code'];

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Issue fields supplied when reporting; `message` is resolved later and `path` defaults to `[]`. */
export type IssueData = DistributiveOmit<Issue, 'message' | 'path'> & { path?: PathKey[] };

/** A custom message: fixed text or a function of the issue (useful for i18n). */
export type MessageSpec = string | ((issue: Issue) => string);

const FORMAT_LABELS: Record<string, string> = {
  email: 'email address',
  url: 'URL',
  uri: 'URI',
  'uri-reference': 'URI reference',
  uuid: 'UUID',
  ipv4: 'IPv4 address',
  ipv6: 'IPv6 address',
  hostname: 'hostname',
  date: 'date (YYYY-MM-DD)',
  time: 'time',
  'date-time': 'date-time',
  duration: 'duration',
  regex: 'regular expression',
  'json-pointer': 'JSON pointer',
};

const UNITS: Record<SizeOrigin, string> = {
  string: 'character',
  number: '',
  array: 'item',
  object: 'property',
  date: '',
  contains: 'matching item',
};

function plural(n: number, unit: string): string {
  if (n === 1) return `${n} ${unit}`;
  return `${n} ${unit === 'property' ? 'properties' : `${unit}s`}`;
}

function show(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (typeof value === 'bigint') return `${value}n`;
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}

function sizeMessage(origin: SizeOrigin, bound: number, inclusive: boolean, exact: boolean, small: boolean): string {
  if (origin === 'number') {
    return `Expected a number ${small ? 'greater' : 'less'} than ${inclusive ? 'or equal to ' : ''}${bound}`;
  }
  if (origin === 'date') {
    const when = new Date(bound).toISOString();
    return `Expected a date ${inclusive ? 'on or ' : ''}${small ? 'after' : 'before'} ${when}`;
  }
  const unit = UNITS[origin];
  if (exact) return `Expected exactly ${plural(bound, unit)}`;
  if (inclusive) return `Expected ${small ? 'at least' : 'at most'} ${plural(bound, unit)}`;
  return `Expected ${small ? 'more' : 'fewer'} than ${plural(bound, unit)}`;
}

/** The built-in English message for an issue. */
export function defaultMessage(issue: Issue): string {
  switch (issue.code) {
    case 'invalid_type':
      return `Expected ${issue.expected}, received ${issue.received}`;
    case 'required':
      return 'Required';
    case 'invalid_value': {
      const values = issue.values;
      if (values.length === 1) return `Expected ${show(values[0])}`;
      const shown = values.slice(0, 10).map(show).join(', ');
      return `Expected one of ${shown}${values.length > 10 ? `, ... (${values.length} options)` : ''}`;
    }
    case 'too_small':
      return sizeMessage(issue.origin, issue.minimum, issue.inclusive, issue.exact === true, true);
    case 'too_big':
      return sizeMessage(issue.origin, issue.maximum, issue.inclusive, issue.exact === true, false);
    case 'not_multiple_of':
      return `Expected a multiple of ${issue.divisor}`;
    case 'invalid_format':
      return `Invalid ${FORMAT_LABELS[issue.format] ?? issue.format}`;
    case 'invalid_pattern':
      return `Expected a string matching /${issue.pattern}/`;
    case 'unrecognized_keys':
      return `Unrecognized ${issue.keys.length === 1 ? 'key' : 'keys'}: ${issue.keys.slice(0, 10).map(show).join(', ')}`;
    case 'invalid_key':
      return `Invalid key: ${issue.issues[0]?.message ?? 'rejected by key schema'}`;
    case 'invalid_union':
      return issue.matched === undefined
        ? 'Value does not match any of the allowed types'
        : `Value must match exactly one schema in oneOf, but matched ${issue.matched}`;
    case 'not_unique':
      return `Expected unique items, but items ${issue.indexes[0]} and ${issue.indexes[1]} are equal`;
    case 'forbidden':
      return 'Value is not allowed here';
    case 'too_deep':
      return `Value is nested too deeply (maximum depth ${issue.maxDepth})`;
    case 'custom':
      return 'Invalid value';
  }
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/**
 * Formats a path the way it would be written in JavaScript: `items[0].name`, `headers["content-type"]`.
 * The root path formats as an empty string.
 */
export function formatPath(path: readonly PathKey[]): string {
  let out = '';
  for (const key of path) {
    if (typeof key === 'number') out += `[${key}]`;
    else if (IDENTIFIER.test(key)) out += out === '' ? key : `.${key}`;
    else out += `[${JSON.stringify(key)}]`;
  }
  return out;
}
