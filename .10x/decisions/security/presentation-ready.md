# Security: presentation-ready
- No auth or policy changes. RLS read back from the live project; matches the 2026-11-11 audit.
- Considered and rejected: a self-service "create account" on /dealer. With confirmation on, an attacker could pre-register a dealer's email with their own password before the dealer confirms (pre-account takeover). Logins stay created by FORGED (dashboard) or via Google.
- The new inbox line exposes only the public brand contact email.
- Tripo key: never in the repo or chat; owner declined the secure form, so none is stored.
