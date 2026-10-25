import { type Issue } from './issues.ts';
/** Issues grouped for forms: messages for the root value and messages per field path. */
export interface FlattenedIssues {
  /** Messages about the value as a whole (issues with an empty path). */
  root: string[];
  /** Messages keyed by `formatPath(issue.path)`, e.g. `"address.city"` or `"items[0].sku"`. */
  fields: Record<string, string[]>;
}
/** Thrown by `parse()`. Carries every issue found, without echoing the input. */
export declare class ValiqError extends Error {
  readonly name = 'ValiqError';
  readonly issues: Issue[];
  constructor(issues: Issue[]);
  /** Groups messages by field path, which suits form libraries and API error bodies. */
  flatten(): FlattenedIssues;
  /** A multi-line report for logs and terminals. */
  format(): string;
}
/** True for errors thrown by valiq-js's `parse()`. Works across realms and duplicate installs. */
export declare function isValiqError(error: unknown): error is ValiqError;
