import { formatPath, type Issue } from './issues.ts';

/** Issues grouped for forms: messages for the root value and messages per field path. */
export interface FlattenedIssues {
  /** Messages about the value as a whole (issues with an empty path). */
  root: string[];
  /** Messages keyed by `formatPath(issue.path)`, e.g. `"address.city"` or `"items[0].sku"`. */
  fields: Record<string, string[]>;
}

function summarize(issues: readonly Issue[]): string {
  const shown = issues.slice(0, 3).map((issue) => {
    const where = formatPath(issue.path);
    return where === '' ? issue.message : `${where}: ${issue.message}`;
  });
  const more = issues.length > 3 ? ` (and ${issues.length - 3} more)` : '';
  return `Validation failed: ${shown.join('; ')}${more}`;
}

/** Thrown by `parse()`. Carries every issue found, without echoing the input. */
export class ValiqError extends Error {
  override readonly name = 'ValiqError';
  readonly issues: Issue[];

  constructor(issues: Issue[]) {
    super(summarize(issues));
    this.issues = issues;
  }

  /** Groups messages by field path, which suits form libraries and API error bodies. */
  flatten(): FlattenedIssues {
    const root: string[] = [];
    const fields: Record<string, string[]> = Object.create(null) as Record<string, string[]>;
    for (const issue of this.issues) {
      if (issue.path.length === 0) {
        root.push(issue.message);
      } else {
        const key = formatPath(issue.path);
        (fields[key] ??= []).push(issue.message);
      }
    }
    return { root, fields };
  }

  /** A multi-line report for logs and terminals. */
  format(): string {
    return this.issues
      .map((issue) => {
        const where = formatPath(issue.path);
        return `✖ ${issue.message}${where === '' ? '' : `\n  → at ${where}`}`;
      })
      .join('\n');
  }
}

/** True for errors thrown by Valiq's `parse()`. Works across realms and duplicate installs. */
export function isValiqError(error: unknown): error is ValiqError {
  return (
    error instanceof ValiqError ||
    (error instanceof Error && error.name === 'ValiqError' && Array.isArray((error as ValiqError).issues))
  );
}
