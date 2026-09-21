# VeinDrop System Knowledge Base for Thesis-Writing AI

> Repository snapshot reviewed: September 15, 2026  
> For use with Claude, ChatGPT, Gemini, or another AI assistant

## Instructions to the AI assistant

Treat this file as the primary factual context for the project.

1. Use **VeinDrop** as the current product name. **BloodConnect** is an older/internal name still found in code, page titles, SQL, and the legacy API.
2. Always distinguish between **implemented/database-backed**, **partial or deployment-dependent**, **prototype/demo-only**, and **proposed future** features.
3. Do not invent respondents, sample sizes, survey scores, accuracy/performance results, partnerships, deployments, ethical approvals, or compliance certifications.
4. Do not claim that VeinDrop performs laboratory blood typing, cross-matching, medical screening, transfusion decisions, or hospital inventory issuance.
5. Do not reveal credentials, keys, hashes, tokens, private documents, or personal/health data.
6. SQL files describe the intended cumulative database. Confirm the hosted database before claiming every migration or manual patch is deployed.
7. Ask the student for missing research facts instead of guessing.

## 1. System identity and purpose

**Name:** VeinDrop  
**Type:** Responsive multi-page web application and installable Progressive Web Application (PWA).  
**Purpose:** Coordinate blood requests and donor participation, manage donor lifecycles, provide privacy-conscious donor discovery, record replacement donations, schedule blood drives, send in-app notifications, and support administrative inventory/reporting tasks.

VeinDrop connects recipients, registered donors, and authorized Blood Donation Coordinators. A recipient creates an emergency donor request or a hospital replacement-donor request. A coordinator privately checks evidence before publishing it. Eligible donors can receive alerts, view matching requests, and pledge. Emergency requests expire after 72 hours and can be closed when the recipient confirms receipt. Replacement campaigns remain open until enough facility-confirmed replacement donations are recorded or the requester cancels.

The repository also retains an older inventory-oriented admin workflow. It must not be confused with the newer community coordination model, which explicitly says the coordinator does not own or issue a treating hospital's inventory.

### September 15, 2026 update summary

- Canonical recipient routes were renamed from `patient_*` to `account_*` and `recipient_*`; old `patient_*.html` files now redirect while preserving query strings and hash navigation.
- Blood drives are no longer only fixed dashboard content. A migration adds database-backed blood-drive scheduling, donor registration, and in-app donor alerts.
- Donor pledges can record private support preferences such as meals, travel, allowance, or screening support; only the donor and request owner should see them.
- Account dashboard, notification, donor map, and admin dashboard scripts/styles were split and polished, with architecture checks updated for the new route names.

### Thesis-safe description

VeinDrop is a web-based blood donation coordination and management prototype supporting authenticated recipient and donor accounts, multi-role profiles, coordinator verification, privacy-conscious donor discovery, compatibility-based appeals, pledges, donor support preferences, blood-drive scheduling/registration, replacement-donation confirmation, notifications, donor/request lifecycle tracking, and administrative monitoring. Supabase is the sole active production backend; retired PHP/MySQL source remains only for historical reference. The system assists coordination and records management but does not replace clinical screening, laboratory compatibility testing, or licensed facility procedures.

## 2. Actors

### Visitor

Can view public pages, register, log in, and start password recovery. Protected pages redirect unauthenticated visitors.

### Recipient / patient

The interface increasingly says **recipient**, while the database uses `patient`. The actor can:

- Register, sign in, edit a profile, and activate donor capability on the same account;
- Submit emergency or replacement requests;
- Add a facility contact and optional private JPG, PNG, or PDF evidence;
- Track verification, operational, and community states;
- Edit an open request, delete one awaiting verification, or cancel one after coordination begins, subject to database rules;
- Read request and pledge notifications;
- Browse verified community requests (their own requests are excluded from the public feed);
- Respond to another request if they also have an eligible donor profile;
- View donor support preferences attached to pledges for their own request;
- Confirm receipt and close an active emergency request.

A recipient cannot directly complete a replacement campaign. It completes through itemized facility-confirmed donations recorded by a coordinator.

### Donor

Can register/activate a donor profile, manage availability, view eligibility and donation history, receive donor appeals, see matching verified requests, pledge support, state limited non-medical support preferences, and register for scheduled blood drives. Registration is not medical approval.

### Blood Donation Coordinator / admin

Can access the protected dashboard; review private request evidence; verify, clarify, or reject requests; publish verified requests; notify eligible donors; review pledges; record facility-confirmed replacement donations; schedule blood drives; manage donor check-in, medical approval, deferral, donation, map visibility, and inventory; and view reports/audit history.

Preferred authorization comes from `blood_bank.admin`. Client-side fallback admin-email handling remains for compatibility and is not the ideal long-term design.

### Multi-role accounts

One Supabase Auth identity can link to both `patient` and `donor` through `auth_user_id`. RPC results/database links are intended to be authoritative; editable Auth metadata is only a compatibility hint. Admin accounts are blocked from ordinary role activation.

## 3. Architecture

```text
Browser / installed PWA
  |-- root HTML routes + CSS
  |-- classic JavaScript page controllers
  |-- /supabase-client.js facade
  |
  +--> Supabase Auth
  +--> Supabase PostgreSQL
  |      |-- blood_bank operational schema
  |      `-- public password-reset tables
  +--> Supabase Storage (private request evidence)
  +--> Supabase Realtime
  `--> Supabase Deno/TypeScript Edge Functions
```

### Technologies

- HTML5, CSS3, and classic JavaScript;
- Vite 6 multi-page build/dev server;
- Supabase Auth, PostgreSQL, PostgREST/RPC, Realtime, Storage, and Edge Functions;
- Leaflet/OpenStreetMap for donor-area maps;
- Chart.js for coordinator reports;
- Service worker and web manifest for PWA behavior;
- Retired PHP/PDO/MySQL source retained outside the production build.

**Important correction:** this is not currently a React application. `package.json` contains Vite only; operational pages are classic multi-page HTML/JavaScript.

### Pages

| File | Purpose |
|---|---|
| `index.html` | Public home/entry |
| `learn_more.html` | Static system explanation |
| `register.html` | Recipient/donor registration |
| `login.html` | Login and role routing |
| `forgot-password.html` | OTP password recovery |
| `account_dashboard.html` | Recipient overview, requests, community feed, donor center |
| `donor_registration.html` | Add donor capability |
| `donor_pledge_details.html` | Donor response/screening instructions |
| `recipient_donor_map.html` | Privacy-conscious donor-area map |
| `account_notifications.html` | Notification history |
| `admin_dashboard.html` | Coordinator requests, donors, inventory, reports |

Legacy aliases `patient_dashboard.html`, `patient_donor_map.html`, and `patient_notifications.html` remain as redirect pages for compatibility. They should be described as backward-compatible routes, not separate feature screens.

### Edge Functions

| Function | Purpose |
|---|---|
| `bootstrap-admin-auth` | Bootstrap an Auth identity from a valid domain admin record |
| `add-donor` | Privileged donor creation |
| `update-donor-eligibility` | Privileged eligibility update |
| `list-donors` | Admin-authorized donor listing |
| `list-requests` | Admin-authorized request listing with recipient/campaign details |
| `overview-stats` | Aggregated dashboard statistics |
| `password-reset` | OTP, throttling, auditing, reset, and session revocation |

## 4. Processes and workflows

### Registration and login

1. User selects recipient or donor and provides identity/contact, DOB, gender, blood type, username, password, and optional medical note.
2. Client checks email, valid date, donor age of at least 18, one of eight blood types, and strong password rules.
3. Supabase Auth creates the identity; an RPC links the selected domain profile when a session is available.
4. Supabase is the only registration data store.
5. Login uses Supabase Auth. A valid domain admin may be bootstrapped into Auth.
6. Admins route to `admin_dashboard.html`; other roles route to `account_dashboard.html`.

### Password recovery

The Edge Function requests/verifies a six-digit email OTP, enforces application-level request and five-attempt limits, stores hashed email/IP audit identifiers, permits a one-time policy-compliant reset, synchronizes the Supabase admin hash when applicable, and revokes sessions. Production needs configured SMTP and secrets.

### Donor lifecycle

```text
registered -> checked_in -> approved -> donated
                  |            |
                  +----------> deferred
```

Older data may include `incomplete`. Staff check in and medically approve/defer donors. Recording a donation can update donor state, inventory, and donation history. A trigger blocks `donated` when fewer than 56 days have passed since the last donation; another sets `last_donation_date`. Some audit writes are best effort because the browser coordinates multiple operations.

### Donor map privacy

Visibility requires map consent, `location_status='verified'`, a map area, availability, an eligible screened status, and completion of the 56-day interval. `list_visible_donors()` exposes limited grouped-area data. Markers/distances are approximate, not exact home GPS. Fixed fallback map data is demonstrational.

### Creating a request

1. Choose `emergency_donor` or `replacement`.
2. Enter quantity, facility/donation point, needed date/time, reason, facility contact, and optional evidence. Emergency requests also use blood type and urgency. Replacement requests use the profile blood type for record consistency but accept donors of any eligible blood type.
3. Resolve/create the authenticated `patient_id` and validate blood type/file.
4. Insert one `blood_request` as operational `pending` and verification `pending`, with `inventory_id` deliberately null.
5. Facility/time values are encoded as tags in `note` because dedicated fields are missing.
6. Save private evidence metadata and upload the object to the private bucket.
7. A replacement request creates/synchronizes `replacement_campaign`.

### Private verification

Only the owner and coordinator can access support metadata; Storage objects are private. The coordinator selects `uploaded_document`, `physical_document`, `facility_confirmation`, or `other`. Each basis requires suitable evidence. `verify_blood_request()` records verifier metadata and changes verification to `verified` and operational status to `approved`. A trigger blocks approval without evidence. Expired emergency requests cannot be verified.

### Publishing and notifying donors

Only verified, approved, active requests are actionable. `notify_eligible_donors()` checks donor Auth linkage, availability, screened status, 56-day interval, self-request exclusion, and absence of an existing pledge. Emergency requests use red-cell compatibility; replacement requests allow any eligible blood type. It inserts deduplicated in-app `donor_appeal` notifications and an audit entry.

### Compatibility rule

| Recipient needs | Compatible red-cell donors |
|---|---|
| A+ | A+, A-, O+, O- |
| A- | A-, O- |
| B+ | B+, B-, O+, O- |
| B- | B-, O- |
| AB+ | All eight types |
| AB- | A-, B-, AB-, O- |
| O+ | O+, O- |
| O- | O- |

This is donor-discovery logic, not clinical cross-matching.

### Donor pledge

The RPC resolves the current donor and rechecks eligibility, verification, open state, self-request exclusion, and emergency compatibility. A partial unique index permits one active pledge per donor/request. The RPC accepts a quantity argument and stores at least one pledged unit. Active pledge units are summed; reaching quantity moves the community state from `active` to `covered`. The owner receives `pledge_received`. A pledge is intent, not inventory, completed donation, or confirmed receipt.

The September 15 support-preferences patch lets the donor submit a private JSON list of practical support needs or arrangements (`meals`, `travel`, `allowance`, `screening`). These are deliberately not medical self-screening answers. The donor and request owner may read them; they should not be described as public donor data.

### Emergency lifecycle

```text
submitted -> pending verification -> verified/approved -> active
          -> covered when enough pledges -> fulfilled when recipient confirms receipt
```

Other endings are clarification, rejection, requester cancellation, or expiry. `expires_at` is 72 hours after request time. A refresh RPC archives timed-out requests. Pledges alone do not prove receipt.

### Replacement lifecycle

```text
submitted -> pending verification campaign -> verified active campaign
          -> pledges/covered -> itemized facility confirmations
          -> complete/fulfilled when confirmed units reach target
```

Replacement campaigns have no timer (`expires_at=NULL`). Any eligible blood type can pledge. Each confirmation records units, date, facility, unique reference, app/external donor source, optional donor ID, and note. Units cannot exceed the target. Reaching the target completes both campaign and request. Linked app-donor confirmations can appear in donation history. The old aggregate completion RPC is retired so confirmations must be itemized.

### Blood drives

Blood-drive scheduling is now database-backed. Coordinators can create a drive with name, date, time window, venue, address, target units, focus blood type, and notes. The scheduling RPC validates coordinator access, future date, target range, time ordering, and focus blood type, then creates `blood_drive` and sends deduplicated `blood_drive_scheduled` in-app notifications to eligible linked donors.

Donors can register for an upcoming drive through `register_for_blood_drive()`. The RPC requires a donor profile, blocks completed/cancelled/past/full drives, upserts cancelled registrations back to registered, recalculates `registered_donors`, and marks the drive `full` when capacity is reached. Attendance remains a status value, but the repository does not yet demonstrate a complete attendance workflow.

### Owner actions

- **Delete:** only an open request awaiting verification can be permanently deleted. Related rows cascade, and the client removes the reported Storage object.
- **Cancel:** used after coordination begins. It cancels active pledges/campaign, sets operational status `cancelled`, archives community state as `expired`, and logs the action.
- **Complete:** only the owner can confirm receipt for an active/covered emergency request.

### Notifications and Realtime

Database types include `donor_appeal`, `pledge_received`, and `request_updated`. Owners receive verification/status/community updates. Users can read and mark only their own notifications through RLS. Realtime refreshes requests, pledges, inventory, and notifications. Hidden community cards and some UI state are browser/session-local.

An older `blood_request_notification_queue` can queue SMS/email, but no delivery worker/provider exists. Never claim those messages were delivered.

### Inventory and older fulfillment

Inventory tracks donor, blood type, units, stock date/status, expiry, remarks, and generated bag ID. `auto_expire_inventory()` exists, but no scheduler is shown.

Older admin code includes a finite-state request workflow and greedy exact-type deduction, prioritizing linked/older stock. It performs multiple browser-issued writes and is not atomic. The newer request path intentionally leaves inventory unallocated and mobilizes donors. Therefore, do not claim every community request automatically deducts VeinDrop inventory.

## 5. Database knowledge base

### Source-of-truth warning

`supabase/migrations/` is canonical forward history. Root `supabase-*.sql` files are manual setup/repair/compatibility scripts. Some donor logs, request logs, and inventory enhancements still come from manual scripts. A deployment can differ depending on applied files.

### Core tables

| Table | Purpose / important fields |
|---|---|
| `donor` | Donor identity, Auth link, contact, blood type, demographics, availability, lifecycle, last donation, deferral, map consent/status/area |
| `patient` | Recipient identity, Auth link, contact, needed blood type, hospital, address |
| `admin` | Coordinator authorization record and legacy password hash |
| `blood_request` | Patient, nullable inventory, unified requester, blood/quantity/urgency, operational status, note, type, verification, hospital reference, receipt, community state/expiry |
| `blood_inventory` | Donor links, blood type, units, stock date/status, update time, expiry, remarks, generated bag ID |
| `donation_record` | Standard donor/inventory-linked quantity, type, date, status, notes/reason |
| `blood_drive` | Scheduled donation campaign with date/time, venue, target units, focus blood type, status, creator, and notes |
| `blood_drive_registration` | Donor registration/attendance status for a blood drive; unique by drive and donor |

### Additive account-unification tables

| Table | Purpose |
|---|---|
| `users` | One Auth-linked person with shared identity/contact and legacy IDs |
| `recipient_details` | One-to-one recipient fields keyed by `users.user_id` |
| `donor_details` | One-to-one donor fields keyed by `users.user_id` |

These preserve legacy tables during migration. The frontend still heavily uses `patient`, `donor`, and `get_my_account_profiles()`; unification is not complete retirement.

### Coordination tables

| Table | Purpose |
|---|---|
| `donor_pledge` | Donor response, units, status, schedule/contact/notes |
| `donor_pledge_support_preferences` | Private practical support choices attached to a pledge |
| `replacement_campaign` | Target, pledged and confirmed units; campaign state/timestamps |
| `replacement_donation_confirmation` | Itemized facility-confirmed replacement donation with app/external source and audit fields |
| `notifications` | Auth-recipient alert with request or drive, type, title, message, read/created times |
| `request_verification_support` | Private facility/file metadata and verification method/note/verifier/time |
| `blood_request_status_log` | Request transition audit |
| `blood_request_notification_queue` | Undelivered outbound-message queue |
| `donor_checkin` | Check-in history |
| `donor_status_log` | Donor lifecycle audit |

### Password-reset tables (`public` schema)

- `password_reset_challenges`: challenge attempts, verification, expiry, and consumption.
- `password_reset_events`: hashed email/IP rate-limit and audit events.

### Storage

Private bucket `request-supporting-documents` uses paths containing owner UUID and request ID. Owners can upload/read/delete; coordinators can read. Signed viewing URLs last about five minutes.

### Relationships

```text
auth.users -> patient / donor / users / notifications
patient 1 -> many blood_request
blood_request 1 -> 0..1 request_verification_support
blood_request 1 -> many donor_pledge <- many-to-1 donor
blood_request 1 -> 0..1 replacement_campaign
blood_request 1 -> many replacement_donation_confirmation
blood_request 1 -> many status_log and notifications
donor 1 -> many donation_record, inventory, checkin, status_log
donor 1 -> many blood_drive_registration <- many-to-1 blood_drive
donor_pledge 1 -> 0..1 donor_pledge_support_preferences
```

`blood_request.inventory_id` is nullable. A future allocation junction table would better represent one request using multiple inventory batches.

### Important RPCs/functions

- Accounts: `get_my_account_profiles`, `get_my_account_context`, `activate_my_patient_profile`, `activate_my_donor_profile`, `set_my_donor_availability`.
- Donors: `get_my_donation_history`, `get_my_matching_requests`, `list_visible_donors`.
- Requests: `pledge_to_blood_request`, `complete_my_blood_request`, `manage_my_blood_request`, `refresh_community_request_lifecycle`.
- Verification: `verify_blood_request`, `notify_eligible_donors`, `is_requester_donor`, `is_red_cell_compatible`.
- Replacement: `record_replacement_donation`, `list_replacement_donations`, `refresh_replacement_confirmation_progress`.
- Blood drives: `schedule_blood_drive`, `register_for_blood_drive`.
- Maintenance: `canonical_blood_type`, `auto_expire_inventory`, waiting-period/status triggers.

### State values

| Field | Values |
|---|---|
| `blood_request.status` | `pending`, `approved`, `needs_clarification`, `rejected`, `fulfilled`, `cancelled` |
| `verification_status` | `pending`, `verified`, `needs_clarification`, `rejected` |
| `community_status` | `active`, `covered`, `fulfilled`, `expired` |
| `request_type` | `replacement`, `emergency_donor`, `unsure` (legacy/migrated) |
| Pledge | `pledged`, `cancelled` |
| Campaign | `pending_verification`, `active`, `pledged`, `complete`, `expired`, `cancelled` |
| Blood drive | `scheduled`, `recruiting`, `full`, `completed`, `cancelled` |
| Blood drive registration | `registered`, `attended`, `cancelled` |
| Verification method | `uploaded_document`, `physical_document`, `facility_confirmation`, `other` |
| Blood types | A+, A-, B+, B-, AB+, AB-, O+, O- |

### RLS caveat

New sensitive tables use owner/participant/coordinator RLS and security-definer authorization. However, older repair scripts contain broad authenticated policies, and one inventory patch disables inventory RLS. Do not claim fully audited least privilege until the deployed policy set is inspected and tested.

## 6. Main algorithms for thesis discussion

1. **Finite-state coordination:** operational, verification, and community states are related but distinct. Evidence gates publication; pledge totals drive coverage; receipt or confirmed donations drive fulfillment; time drives emergency expiry.
2. **Compatibility/eligibility filtering:** examines donor availability, screening state, 56-day interval, self-request status, previous pledge, open/verified state, and compatibility or replacement exemption. Filtering is approximately O(d) for d donors, excluding database query costs.
3. **Pledge aggregation:** sums active pledged units and marks coverage when total reaches request quantity. Coverage is not fulfillment.
4. **Replacement aggregation:** sums non-voided confirmed units, prevents exceeding target, and completes at target.
5. **Blood-drive capacity tracking:** counts active drive registrations, blocks over-capacity registration, and changes drive status to `full` when registered donors reach the target.
6. **Legacy greedy allocation:** deducts the smaller of each exact-type inventory row and remaining need, prioritizing linked/older stock. It is approximately O(n) after ordering but is not transactionally atomic.

## 7. Feature maturity

### Substantially implemented/database-backed

Authentication; multi-role profiles; profile editing; donor lifecycle/waiting rule; two request types; private evidence; evidence-gated verification; emergency expiry; non-expiring replacement campaigns; compatibility matching; community feed; pledges; private donor support preferences; itemized replacement confirmations; blood-drive scheduling and registration; owner delete/cancel/receipt actions; in-app notifications; Realtime refresh; inventory/donations/reporting; privacy-conscious map; password reset; PWA shell.

### Partial or deployment-dependent

Applied schema state; best-effort audit writes; multi-write donor/inventory workflows; scheduled expiration; blood-drive attendance tracking; offline live data; approximate map distance; fallback admin emails; local profile images/UI preferences.

### Demo-only or not end-to-end

SMS/email delivery; direct recipient-donor chat/contact consent; laboratory/hospital-system integration; live GPS; predictive analytics/AI dispatch; compliance certification; production adoption; clinical validation; research results not separately supplied.

## 8. Security and ethical boundaries

Implemented safeguards include Auth sessions, password hashing, RLS on newer sensitive tables, coordinator checks, private Storage/signed URLs, hashed reset audit identifiers, throttles, ownership checks, self-pledge prevention, constraints, and reduced map detail.

Risks include broad legacy policies, disabled inventory RLS in a manual patch, fallback admin email logic, browser-orchestrated privileged workflows, and no complete retention/consent/breach-response program.

Do not claim Philippine Data Privacy Act, HIPAA, ISO 27001, or other compliance based on code alone.

## 9. Testing and build

```powershell
npm ci
npm run build
npm run verify:architecture
```

`build-tools/` also contains focused Node regression scripts for requests, verification, replacement workflows, expiry, owner actions, donor matching/preferences/filters, map/location, notifications/UI, and responsive cards/dialogs. They are not a clinical, load, security, or usability evaluation and provide no thesis survey result.

## 10. Known issues and future work

1. Align evidence size limits: client and Storage bucket allow 20 MB, but `request_verification_support_file_check` still appears capped at 5 MB.
2. Convert all required manual SQL into ordered migrations and test fresh/upgraded databases.
3. Audit live RLS and replace broad policies with least privilege.
4. Replace fallback email authorization with server-controlled roles/claims.
5. Make donor, inventory, and any inventory-allocation changes transactional with row locks.
6. Add a request-inventory allocation junction table if inventory issuance remains.
7. Add dedicated request facility, needed-time, and narrative columns instead of `note` tags.
8. Complete or abandon the `users`/details migration so one account model is authoritative.
9. Implement outbound notifications only with consent, retries, and delivery status.
10. Add scheduled request/inventory expiry.
11. Complete blood-drive attendance/outcome recording and cancellation flows if blood drives remain in thesis scope.
12. Add governed cross-device profile image storage if needed.
13. Add unit, integration, authorization, concurrency, accessibility, performance, backup/restore, and security tests.
14. Have qualified blood-service staff validate terminology and workflows.
15. Document production secrets, monitoring, backups, recovery, retention, and incident response.

## 11. Repository source map

- `README.md`, `docs/ARCHITECTURE.md`: architecture rules.
- `vite.config.js`, `package.json`: build setup.
- `public/supabase-client.js`: shared API/auth/domain facade.
- `public/scripts/pages/*.js`: page workflows.
- Root HTML/CSS: stable routes and UI; `patient_*.html` files are redirect aliases for the renamed account/recipient pages.
- `supabase/migrations/*.sql`: canonical forward schema.
- `supabase/functions/*/index.ts`: privileged functions.
- Root `supabase-*.sql`: manual setup/repair patches; do not apply blindly.
- `public/sw.js`, `public/manifest.webmanifest`: PWA.
- `api/*.php`, `data.sql`: retired PHP/MySQL source retained for historical reference.
- `build-tools/*.mjs`: verification/regression checks.
- `System_Proposal.txt`: older proposal; current code and this file supersede stale details.

## 12. Information to ask the student for

- Final title, researchers, institution/program, and school format;
- Study locale and actual partner facility/RHU;
- Research and software-development methodology;
- Approved functional/non-functional requirements;
- Respondent groups, population, sampling, and sample size;
- Evaluation framework (ISO/IEC 25010, SUS, TAM, etc.);
- Actual tests, survey data, statistics, and results;
- Ethics, consent, and privacy documents;
- Citation style/source-date limits;
- Deployment environment and migrations confirmed live.

Write these as visible placeholders until supplied.

## 13. Reusable prompt

> Help me write a thesis about VeinDrop using the attached system knowledge base as factual repository context. Separate implemented, partial, demo, and proposed features. Do not invent research data, deployment evidence, clinical validation, partnerships, or compliance. Ask for facts that are not provided. Prefer the September 15, 2026 workflow over older BloodConnect proposal text. I will now tell you which thesis section I need.
