# Shipment Tracker

Company-scoped live FedEx boards. Each company is a sealed tenant. Clients sign in to `/track/[slug]`. Admin creates companies, invites users, and brands boards. Tracker Team adds FedEx tracking numbers with an audit log.

Auth and data live in Firebase project `hhi-shipiment-tracker` (Email/Password + Cloud Firestore). Roles are stored on `users/{uid}` and enforced in Firestore rules.

## Run

1. Copy `.env.example` to `.env.local` if needed. Firebase web config is already filled in.
2. In the [Firebase console](https://console.firebase.google.com/project/hhi-shipiment-tracker):
   - Authentication → Sign-in method → enable **Email/Password**
   - Firestore Database → create the default database if it does not exist
   - Deploy rules: `firebase deploy --only firestore:rules,storage`
3. `npm install`
4. `npm run dev`
5. Open [http://localhost:3000](http://localhost:3000)

First successful boot ensures the platform admin (from `PLATFORM_ADMIN_*`) and the Ronin company. It does not create `admin@ronin.local` or `tracker@ronin.local`.

## Accounts

Defaults (override in `.env.local`, and keep platform admin emails in `firestore.rules` in sync):

- Platform admin: `PLATFORM_ADMIN_EMAIL` / `PLATFORM_ADMIN_PASSWORD` → `/admin`
- Trackers and clients: invited from Admin → Users

Boards require sign-in. Tracker and client accounts cannot read another company's shipments.

## Required credentials

- **Firebase:** Email/Password auth, Firestore, and Storage for logos. Web config is in `.env.local` as `NEXT_PUBLIC_FIREBASE_*`.
- **FedEx:** create a Track API project at [developer.fedex.com](https://developer.fedex.com). Set `FEDEX_CLIENT_ID` and `FEDEX_CLIENT_SECRET`. Use sandbox until production is approved (`FEDEX_USE_SANDBOX=true`).
- **Google Maps:** enable Maps JavaScript API (and Geocoding API for scan locations not in the built-in hub table). Set `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.

Without FedEx/Maps keys the UI still runs: the board, admin, and tracker consoles work, and missing-credential states stay honest.
