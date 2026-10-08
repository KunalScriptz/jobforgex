# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Use GitHub's private reporting instead:
**Security → Report a vulnerability** on this repository.

Include what you found, how to reproduce it, and the impact you expect. You will get an acknowledgement as soon as the maintainers see it, and we will credit you in the fix unless you prefer otherwise.

## Scope

This project handles personal career data and API keys. Particularly relevant: authentication and token handling, cross-workspace data access, file download endpoints, and the Chrome extension token.

## If you self-host

- Replace every default secret in `.env` before exposing the app.
- Serve it over HTTPS and restrict `CORS_ORIGINS` to your own domain.
- Never commit your `.env`.
