# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js (App Router) + React. Auth is Firebase Email/Password. Persistence is Cloud Firestore. FedEx Track API and Google Maps stay as operator-provided integrations.

## Users

- **Clients** sign in and open only their company's live board (`/track/[slug]`). They cannot see another company.
- **Admins** create/edit/delete companies, invite or revoke client/tracker/admin users, set per-company board colors and logo, and download a credentials PDF to email.
- **Trackers** add, edit, and delete FedEx tracking numbers for their assigned company only, with an audit log of those changes.

## Product Purpose

Give each company a live, branded one-pager of its FedEx shipments, fed by Tracker Team input and the FedEx Track API. Success is a client opening `/track/ronin` (or another company slug) and immediately seeing real status, facts, map, and history for every assigned number.

## Positioning

The product is not a generic “track a number” form. It is a **company-scoped live board**: one URL per company, many shipments, always current from FedEx.

## Operating Context

1. Admin signs in, creates a company, sets board colors/logo, and invites users (PDF credentials).
2. Tracker Team signs in, stays inside their company, pastes or edits FedEx tracking numbers (audited).
3. The system fetches and caches live FedEx track results (status, events, location, facts).
4. The client signs in and opens only their company tracking page.

Credentials the operator must supply (not invented): Firebase project (Auth + Firestore), FedEx API key/secret/account, Google Maps JavaScript API key, and initial Admin/Tracker login emails and passwords.

## Capabilities and Constraints

- Dynamic tracking page per company, keyed by slug.
- Admin can create companies.
- Tracker Team can attach FedEx tracking numbers to a company.
- Client page shows, per tracking number: status updates, shipment facts, Google Map, travel history.
- Tracking data comes from the **live FedEx Track API** (operator-provided credentials).
- Map is **Google Maps** from day one (operator-provided API key).
- Access is **email/password with Firestore RBAC** (`admin` | `tracker` | `client`). Company data is isolated: trackers and clients cannot read another tenant.
- Client tracking pages require sign-in; they are not a public company index.
- Undecided / not confirmed: multi-carrier support, notifications, billing, multi-tenant SSO.

## Brand Commitments

- Product domain: shipment tracking for named companies, starting with Ronin.
- Visual constraints volunteered by the user: UI UX Pro Max; aesthetically clean but eye-catching; anime.js for motion.
- Do not invent a company brand beyond the name Ronin unless assets are provided.

## Evidence on Hand

- No FedEx credentials, Google Maps key, logos, or real shipment payloads are in the repo.
- No testimonials, customer quotes, or SLA claims exist. Do not fabricate them.
- Demonstration shipments may appear only after a Tracker pastes real numbers, or as clearly labeled empty states.

## Product Principles

- One company, one URL, many live shipments.
- Tracker input is the only way a number joins a board; FedEx is the source of status truth.
- Clients should understand a shipment after signing in, without using FedEx’s own site.
- Admin and Tracker tools serve the board; they never replace it.
- Empty, error, and credential-missing states must be honest — never fake a delivered package.

## Accessibility & Inclusion

No product-specific accessibility standard was established. Default to WCAG-minded contrast, keyboard access, and visible focus on operate surfaces.
