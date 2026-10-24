# Security policy

## Supported versions

Only the latest published minor version receives security fixes while Valiq is in 0.x.

## Reporting a vulnerability

Please report vulnerabilities privately. Do not open a public issue.

- Use GitHub's private vulnerability reporting ("Report a vulnerability" under the repository's
  Security tab), or
- email the maintainer at mohsinziadev@gmail.com with "valiq security" in the subject.

Include the Valiq version, a minimal schema and input that reproduce the problem, and the impact
you expect (for example "validation accepts X" or "validation hangs on Y"). You should get an
acknowledgement within 5 working days. Once a fix is released, the advisory credits the reporter
unless they prefer otherwise.

## Scope

In scope: validation that accepts data it should reject, prototype pollution, input mutation,
denial of service through built-in checks (catastrophic regular expressions, unbounded recursion
or allocation), and information leaks through error messages.

Out of scope: regular expressions and callbacks supplied by the application (see
[docs/security.md](docs/security.md)), and JSON Schemas from untrusted sources compiled without
review.
