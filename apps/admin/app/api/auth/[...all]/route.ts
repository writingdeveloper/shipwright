// Better Auth route handler — the SAME shared @repo/auth instance the web app
// uses. A second app in the monorepo gets working auth from one import; in
// production point both apps at one canonical BETTER_AUTH_URL to share sessions.
export { GET, POST } from "@repo/auth/next";
