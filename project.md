# PROJECT: DM LOCKGUARD

## Centralized Smart Lock Management, Access Control, and Security Monitoring Platform

**Project Name:** DM LockGuard
**Application Type:** Server-based smart lock control and security management platform
**Primary Device:** Eufy Smart Lock C30, Model T85D0
**Primary Objective:** Build a polished, secure, extensible server application that centrally manages smart locks, user accounts, access permissions, access codes, mobile access, location-aware entry, security monitoring, and comprehensive audit logging.

---

# 1. YOUR ROLE AND DEVELOPMENT OBJECTIVE

Act as a senior software architect, full-stack developer, security engineer, database architect, UI/UX designer, QA engineer, and technical documentation specialist.

Your task is to design, implement, test, document, and deliver a complete, production-oriented application named DM LockGuard.

This must be a functional application, not merely a mockup, prototype, dashboard demonstration, or collection of disconnected screens.

The finished product should have the usability and architectural quality expected of a professional access-control platform.

Prioritize:

* Security and reliability.
* A polished, intuitive interface.
* Strong separation of responsibilities.
* Modular architecture.
* Comprehensive user and permission management.
* Reliable communication with the Eufy ecosystem.
* Clear error handling.
* Detailed auditability.
* Configurable behavior.
* Maintainable code.
* Automated testing.
* Straightforward installation and administration.

Make reasonable engineering decisions independently. Do not repeatedly ask for approval on routine implementation choices.

When a decision could affect physical security, privacy, irreversible data changes, or the ability to access the property, select the safer default and document the decision.

Do not claim that a feature works until its implementation and relevant integration have been tested.

---

# 2. PROJECT DIRECTORY AND ENVIRONMENT

Before creating or modifying files:

1. Inspect the current development environment.
2. Confirm the working directory.
3. Inspect existing files and projects if the target directory already exists.
4. Identify installed programming languages, runtimes, package managers, database services, and development tools.
5. Identify any existing Eufy integration libraries or related source code.
6. Preserve useful existing work.
7. Do not overwrite unrelated files.
8. Create a backup before making substantial changes to an existing project.

Use this project directory unless the operator explicitly changes it:

`D:\aiprod\lockguard\`

If the project is being developed in a Linux environment, use the equivalent configured project directory rather than assuming that the Windows path exists.

Create a clear and maintainable directory structure.

Do not place the entire application in one file.

Separate frontend components, backend services, database migrations, integration code, configuration, documentation, tests, and deployment scripts.

---

# 3. MANDATORY ARCHITECTURAL PRINCIPLE

The LockGuard server must be the only application gateway communicating with the Eufy ecosystem.

The mobile web application and administrative frontend must never communicate directly with Eufy's cloud or receive Eufy account credentials.

All lock-control operations must pass through the LockGuard backend.

The required architecture is:

```text
                    LOCKGUARD CONTROL CENTER
                              |
                              |
                    LOCKGUARD BACKEND API
                              |
          +-------------------+-------------------+
          |                   |                   |
          v                   v                   v
     AUTHENTICATION       PERMISSION          AUDIT AND
        SERVICE             ENGINE             SECURITY
          |                   |                   |
          +-------------------+-------------------+
                              |
                     LOCK COMMAND SERVICE
                              |
                     EUFY INTEGRATION LAYER
                              |
                         EUFY CLOUD
                              |
                       EUFY T85D0 LOCK


                  MOBILE WEB APPLICATION
                              |
                         HTTPS / WSS
                              |
                     LOCKGUARD BACKEND API
```

The backend is the authoritative source for application permissions and access policies.

Hiding an interface button is not authorization.

Every API request must independently verify that the authenticated user is permitted to perform the requested operation.

The application must deny access by default when a required authorization check fails.

The application must never report a successful physical unlock merely because a web request succeeded.

---

# 4. TECHNOLOGY STACK

Use a modular architecture built around the following preferred technologies.

## Backend

* PHP using a supported PHP 8.x release.
* Apache HTTP Server.
* MySQL 8.x or a supported compatible MySQL release.
* A maintained PHP framework where appropriate, preferably Laravel.
* Versioned database migrations.
* Server-side validation.
* Structured application logging.
* Background jobs for asynchronous operations.
* A persistent job queue where needed.
* WebSockets or Server-Sent Events for live updates.

Use framework-supported authentication, authorization, validation, database transactions, and security features rather than reinventing them unnecessarily.

## Frontend

* React.
* TypeScript.
* Vite.
* Tailwind CSS.
* A maintained icon library.
* Accessible, reusable UI components.
* Responsive layouts for desktop, tablet, and mobile.

Use a consistent design system.

The administrative interface and mobile application may share components where appropriate, but they must provide different experiences optimized for their intended users.

## Eufy Integration

Investigate the most reliable currently available integration for the Eufy T85D0.

Evaluate maintained community integrations and their actual device support.

Determine whether the selected integration is best implemented in PHP, Node.js, or a separate service.

If a separate integration runtime is required, isolate it behind an authenticated internal API.

Do not force an unsupported device library into the PHP application merely to maintain a single programming language.

The integration service must not expose unrestricted lock-control operations to mobile clients.

## Deployment

Support a documented deployment path using Apache, PHP, and MySQL.

Provide development and production configuration examples.

Containerization may be offered as an optional deployment method, but do not make Docker mandatory if a direct installation is practical.

Never commit credentials, access tokens, private keys, or production secrets to source control.

---

# 5. PHASE ZERO: RESEARCH AND FEASIBILITY VALIDATION

Before implementing advanced functionality, investigate the Eufy T85D0 integration.

This phase is mandatory.

The target device is the Eufy Smart Lock C30, model T85D0.

Investigate:

* Supported authentication methods.
* Eufy account login and session handling.
* Multi-factor authentication or verification requirements.
* Device discovery.
* Lock-state retrieval.
* Lock commands.
* Unlock commands.
* Event delivery or polling.
* Battery information.
* Available device metadata.
* Error handling.
* Rate limits or throttling behavior.
* Session expiration.
* Reauthentication.
* Firmware compatibility.
* Known integration limitations.
* Community maintenance status.
* License compatibility.
* Long-term integration risks.

Prefer supported and documented interfaces when available.

If using a community integration, examine its source code, licensing, supported devices, release history, issue history, and security implications.

Do not assume that support for another Eufy lock means the T85D0 is supported.

Do not assume that an integration can program or revoke physical keypad codes simply because it can lock and unlock the device.

## Required proof of concept

Implement and test a small integration that can, where supported:

1. Authenticate to the Eufy service.
2. Discover the target T85D0.
3. Retrieve its reported state.
4. Issue a lock command.
5. Issue an unlock command.
6. Verify the resulting reported state.
7. Detect integration disconnection.
8. Handle expired authentication.
9. Recover from temporary communication failures.
10. Produce useful diagnostic logs.

Use the actual device when available.

If the physical lock or account is unavailable, implement the integration interface and automated tests, but clearly label physical-device testing as incomplete.

Do not claim successful device validation based solely on mocked responses.

## Feasibility report

Create:

`docs/EUFY_COMPATIBILITY_REPORT.md`

Document each capability using these statuses:

* VERIFIED: Tested successfully against the actual device.
* IMPLEMENTED: Implemented, but not yet verified against the actual device.
* SIMULATED: Demonstrated using a mock or simulator.
* PARTIAL: Some required behavior is implemented.
* UNSUPPORTED: No reliable implementation has been established.
* BLOCKED: Requires credentials, hardware, account access, or external approval.

Explain any limitations before relying on the affected functionality.

---

# 6. USER ACCOUNTS AND IDENTITY MANAGEMENT

Implement a complete user administration system.

Administrators must be able to create, edit, suspend, reactivate, and revoke user accounts through the GUI.

Each user profile should support:

* Internal user ID.
* Display name.
* Username or email address.
* Account status.
* Role assignments.
* Individual permission overrides.
* Assigned properties.
* Assigned locks.
* Access schedules.
* Enabled access methods.
* Remote-unlock permissions.
* Proximity-unlock permissions.
* Trusted devices.
* Multi-factor authentication settings.
* Account creation timestamp.
* Last successful login.
* Last relevant access event.
* Account expiration.
* Administrative notes.

Sensitive administrative actions must require appropriate authorization.

Account suspension must immediately prevent new access requests from that account.

Existing sessions must be invalidated when required by the suspension or revocation policy.

Provide an account security history.

---

# 7. ROLE-BASED AND GRANULAR PERMISSIONS

Implement a flexible role-based access-control system with per-user exceptions.

Provide these initial role templates:

1. Super Administrator.
2. Security Administrator.
3. Property Manager.
4. Resident.
5. Temporary Guest.
6. Service Provider.
7. Read-Only Auditor.

Allow authorized administrators to create additional roles.

Create individual permissions for:

## Lock Control

* View lock status.
* Request locking.
* Request unlocking.
* Request remote unlocking.
* Use proximity unlocking.
* View access history.

## User Management

* Create users.
* Edit users.
* Suspend users.
* Reactivate users.
* Revoke users.
* Assign roles.
* Modify individual permissions.

## Access Management

* Create temporary access grants.
* Revoke access grants.
* Manage access schedules.
* Manage access-code metadata.
* Synchronize supported physical access codes.

## Device Management

* View enrolled devices.
* Enroll devices.
* Rename devices.
* Revoke trusted devices.
* Revoke user sessions.

## Location and Privacy

* Use location-dependent access.
* View permitted location reports.
* View location history.
* Manage location policies.
* Review location-access audit records.

## Administration

* Manage integration settings.
* Manage security policies.
* Configure notifications.
* View security incidents.
* Export authorized reports.
* Manage audit retention.

Every permission must be enforced on the backend.

Implement deny-by-default behavior.

Define how conflicting role permissions and individual overrides are resolved.

Document the permission-resolution algorithm.

Build automated tests covering allowed and denied actions for every sensitive permission.

Provide a permission-preview interface so an administrator can see the effective permissions before saving changes.

---

# 8. EUFY DEVICE MANAGEMENT

Create a dedicated device-management module.

Support multiple locks in the database even if only one lock is initially connected.

The interface should display:

* Device name.
* Device model.
* Device identifier, where available.
* Connection status.
* Reported lock state.
* Last state confirmation.
* Last successful communication.
* Battery level, if available.
* Firmware information, if available.
* Last command.
* Last command outcome.
* Integration errors.
* Device registration status.

Clearly distinguish:

* Connected.
* Disconnected.
* Degraded.
* Synchronizing.
* State unknown.
* State stale.

Do not infer that the door is locked simply because the last command was a lock command.

Use timestamps to identify stale information.

Allow administrators to select a registered lock and review its history.

Do not display unsupported telemetry as if it were available.

---

# 9. CENTRAL LOCK COMMAND SERVICE

All lock operations must use a single backend command service.

Do not implement separate, inconsistent authorization logic in individual API controllers.

The command service must:

1. Authenticate the requesting user.
2. Confirm that the account is active.
3. Validate the requested operation.
4. Resolve effective permissions.
5. Check lock-specific access.
6. Check the access schedule.
7. Evaluate required authentication strength.
8. Evaluate location requirements when applicable.
9. Check security holds and lockdown policies.
10. Create an auditable access request.
11. Record the authorization decision.
12. Issue the command through the Eufy integration if authorized.
13. Record the integration response.
14. Retrieve or await the resulting reported state.
15. Record the confirmation result.
16. Notify the user or administrator according to policy.

Represent the command lifecycle explicitly.

Recommended states:

* RECEIVED.
* AUTHENTICATING.
* AUTHORIZED.
* DENIED.
* QUEUED.
* SUBMITTED.
* CONFIRMED_SUCCESS.
* FAILED.
* UNKNOWN_RESULT.
* EXPIRED.
* CANCELLED.

Do not blindly retry unlock commands after an ambiguous timeout.

A timed-out command may already have reached the lock.

Reconcile the reported lock state before retrying where possible.

Use idempotency keys to prevent duplicate requests.

Commands must expire according to a configurable, documented policy.

Never queue an unlock request for execution at a later, unexpected time without a deliberate, explicit policy.

If the integration is unavailable, do not present the request as successful.

---

# 10. REMOTE UNLOCKING

Implement configurable remote-unlock policies.

Initial policies:

### Policy A: Standard Remote Unlock

An authorized user may remotely unlock after passing the required authentication and permission checks.

### Policy B: Location Required

The user must provide a sufficiently recent location report that meets the configured geographic policy.

### Policy C: Step-Up Authentication

Require additional authentication before a remote unlock.

### Policy D: Remote Unlock Disabled

The user cannot remotely unlock the door.

### Policy E: Temporary Remote Access

Allow remote unlocking only during a specified time window.

Administrators must be able to assign policies globally, per property, per lock, and per user where appropriate.

The most restrictive applicable rule must prevail unless an explicitly documented policy-resolution rule establishes otherwise.

When location is required but unavailable, inaccurate, stale, or denied, reject the request.

Do not use a missing location report as evidence that a user is in an approved location.

Display a clear reason for every denied request.

Require stronger authentication for sensitive actions when configured.

---

# 11. LOCATION-AWARE ACCESS

Build location functionality as a separate, configurable module.

It must support the mobile application's foreground location features and provide an extension point for a future native mobile companion.

Do not assume that a mobile browser can continuously track a user while closed or reliably execute background tasks.

## Location reporting

Where permission is granted, collect the minimum location information necessary for the enabled feature.

Store relevant metadata:

* User ID.
* Device ID.
* Timestamp.
* Latitude and longitude when required.
* Reported accuracy.
* Location source.
* Validation status.
* Purpose of collection.
* Retention category.

Validate all incoming location data.

Reject malformed coordinates, impossible accuracy values, stale reports, and timestamps outside accepted limits.

Treat client-reported locations as potentially unreliable.

Do not claim that browser location is tamper-proof.

## Geofence configuration

Allow administrators to configure:

* Property coordinates.
* Arrival radius.
* Geofence entry and exit behavior.
* Location freshness threshold.
* Minimum acceptable accuracy.
* Required proximity confirmation.
* Location reporting intervals where supported.
* Location-data retention.

Geofence entry must not, by itself, authorize unlocking.

## Proximity-unlock modes

Implement these operating modes:

1. DISABLED.
2. ARRIVAL_NOTIFICATION.
3. CONFIRMED_PROXIMITY.
4. AUTOMATIC_PROXIMITY_UNLOCK.

Make ARRIVAL_NOTIFICATION the default.

Keep automatic unlocking disabled until the necessary hardware, application behavior, security checks, and device compatibility have been validated.

For confirmed or automatic proximity unlocking, require all applicable checks:

* Active user.
* Active trusted device.
* Valid authentication state.
* Proximity-unlock permission.
* Valid access schedule.
* Recent location report.
* Approved geofence state.
* Near-door confirmation.
* No active security hold.
* Available lock integration.
* Valid, nonexpired authorization request.

Implement a dedicated near-door detection interface.

Possible implementations include compatible Bluetooth Low Energy hardware, a suitable local presence sensor, or a supported native application capability.

Do not pretend that GPS alone can reliably confirm the user is standing at the door.

If near-door detection is unavailable, disable the affected automatic-unlock mode and explain why.

Implement cooldowns, duplicate-event protection, and anti-replay controls.

Location uncertainty must fail safely.

---

# 12. LOST DEVICE AND COMPROMISED ACCOUNT WORKFLOW

Create a dedicated security workflow for lost or compromised devices.

Authorized administrators must be able to:

* Mark a device as lost.
* Revoke device trust.
* Invalidate its active sessions.
* Deny future unlock requests from it.
* Disable its proximity authorization.
* Increase authentication requirements for the associated account.
* Trigger security notifications.
* Review relevant access events.
* Preserve relevant audit records.
* Re-enroll a replacement device.

When a device is reported lost, execute the applicable revocation actions promptly and record their outcomes.

Show the last legitimately received location only when available and permitted.

Always display its timestamp and available accuracy information.

Do not attempt to bypass the phone's permissions or imply that the server can continue tracking a device that has stopped reporting.

Support security incidents involving:

* Lost phones.
* Stolen credentials.
* Suspicious logins.
* Unexpected unlock requests.
* Revoked devices.
* Unusual authorization activity.

Provide an incident timeline that combines relevant access requests, authentication events, device events, and administrative actions.

---

# 13. ACCESS-CODE MANAGEMENT

Build a complete interface for managing access-code records and their relationship to physical lock credentials.

Support:

* Assigning codes to users.
* Creating code records.
* Setting validity periods.
* Setting expiration dates.
* Recording revocation.
* Associating codes with specific locks.
* Tracking synchronization status.
* Recording administrative changes.
* Displaying code-management errors.
* Detecting unsupported operations.

Do not assume that all code-management operations are supported by the T85D0 integration.

Investigate whether the physical lock permits remote creation, modification, expiration, and deletion of codes through the selected integration.

If an operation is unsupported, clearly mark it as unavailable.

Do not store plaintext access codes in audit logs.

Avoid storing the actual code unless necessary for a supported workflow. Prefer protected storage and display only masked values after creation.

Do not claim that a code has been revoked from the physical lock until that revocation is confirmed through a supported mechanism.

If server-side account expiration cannot disable a PIN already stored in the lock, show an actionable warning.

Never log a user's password, MFA secret, session token, Eufy credential, or unmasked access code.

---

# 14. TEMPORARY ACCESS AND GUEST MANAGEMENT

Implement temporary access grants.

A grant should support:

* Recipient.
* Assigned property.
* Assigned lock.
* Start time.
* Expiration time.
* Permitted days.
* Permitted access methods.
* Remote-unlock permission.
* Proximity-unlock permission.
* Maximum usage count where enforceable.
* Status.
* Revocation.
* Audit history.

Build a guest invitation workflow.

Invited users must not be able to assign themselves additional permissions.

Temporary access must expire automatically at the configured time.

Distinguish expiration of a LockGuard account from expiration of a physical lock PIN.

Where the physical lock cannot enforce an expiration independently, document the limitation and warn the administrator.

---

# 15. LIVE ADMINISTRATIVE CONTROL CENTER

Create a polished, responsive control center.

Use a professional security-dashboard aesthetic.

Suggested visual design:

* Dark charcoal interface.
* Deep slate panels.
* Electric blue for primary controls.
* Green for confirmed normal states.
* Amber for warnings.
* Red for critical security events.
* Neutral gray for unavailable or unknown states.
* Clear typography.
* Consistent spacing.
* Accessible contrast.
* Responsive layouts.

Avoid visual clutter.

Use color coding together with readable status labels and icons. Color must not be the only way information is conveyed.

## Main dashboard

Include:

* Lock status.
* Eufy integration health.
* Last successful synchronization.
* Active users.
* Recent access events.
* Pending security alerts.
* Failed authorization attempts.
* Pending administrative actions.
* Device-health indicators.
* Current lockdown status.

## Live activity

Provide real-time or near-real-time updates.

Each event should show:

* Timestamp.
* User or system actor.
* Device.
* Requested action.
* Authorization result.
* Command result.
* Confirmation status.

Allow filtering and searching.

Clicking an event should reveal its complete authorized details.

## Quick actions

Include:

* Lock.
* Unlock, subject to administrator permissions and security policies.
* Enable lockdown.
* Disable automatic proximity unlocking.
* View incidents.
* Manage users.
* Inspect integration health.

Destructive or sensitive actions must require appropriate confirmation and authorization.

---

# 16. MOBILE WEB APPLICATION

Build a dedicated, mobile-first interface.

The application should work well on common mobile browsers and support installation as a Progressive Web App where supported.

Primary screens:

1. Login.
2. MFA verification.
3. Home.
4. Lock status.
5. Lock controls.
6. Recent activity.
7. Device management.
8. Location and proximity settings.
9. Trusted devices.
10. Account security.
11. Notifications.
12. Help and troubleshooting.

Show only actions the user is authorized to perform.

However, enforce the same restrictions on the backend regardless of the interface.

## Mobile home screen

Display:

* Lock name.
* Current reported state.
* Last confirmation timestamp.
* Connection status.
* Lock and unlock controls.
* Location status.
* Proximity status.
* Relevant alerts.

Use distinct labels for:

* Locked.
* Unlocked.
* Locking.
* Unlocking.
* State unknown.
* State stale.
* Device unavailable.

Do not display a success animation until the relevant success condition has been confirmed.

## Mobile security

Implement:

* Secure authentication.
* Session revocation.
* CSRF protection where applicable.
* Secure cookie settings.
* Rate limiting.
* Reauthentication for sensitive operations.
* Trusted-device enrollment.
* Clear location permission handling.
* Safe handling of offline states.

Never store Eufy credentials or unrestricted lock-control credentials in the browser.

---

# 17. SECURITY LOCKDOWN MODE

Implement a configurable lockdown feature.

Lockdown policies may:

* Disable automatic proximity unlocking.
* Disable or restrict remote unlocking.
* Revoke temporary application-level access grants.
* Require stronger authentication.
* Trigger administrator alerts.
* Increase monitoring.
* Preserve related events in a dedicated incident record.

Provide a preview of the consequences before enabling lockdown.

Allow administrators to configure which actions are permitted during lockdown.

Do not automatically lock a door in a way that could endanger occupants.

Never interfere with legitimate physical exit mechanisms.

Log lockdown activation, changes, and deactivation.

Where supported, require reauthentication or a second authorized administrator to deactivate critical lockdown policies.

---

# 18. SECURITY ALERTS AND INCIDENT MANAGEMENT

Build a centralized alert engine.

Initial alert rules:

* Repeated failed authentication.
* Repeated denied unlock requests.
* Login from an unrecognized device.
* Suspicious session activity.
* Revoked-device access attempt.
* Eufy connection failure.
* Unexpected integration disconnection.
* Repeated lock-command failures.
* Battery warning, if supported.
* Unexpected administrative permission change.
* Location validation failure.
* Location anomaly.
* Lock state remaining unknown.
* Audit subsystem failure.

Support severity levels:

* Informational.
* Low.
* Medium.
* High.
* Critical.

Administrators must be able to configure thresholds and notification behavior.

Avoid unbounded alert storms by implementing deduplication, rate limits, and incident correlation.

Do not treat every location anomaly as proof of malicious activity.

## Incident lifecycle

Support:

* New.
* Acknowledged.
* Investigating.
* Contained.
* Resolved.
* Closed.

Record the user responsible for each administrative action.

Maintain a history of incident status changes.

---

# 19. AUDIT LOGGING

Audit logging is mandatory.

Create structured, append-oriented audit records for all security-sensitive operations.

Record:

* Login attempts.
* Successful authentication.
* Failed authentication.
* Logout and session revocation.
* User creation and modification.
* Permission changes.
* Role changes.
* Device enrollment.
* Device revocation.
* Access requests.
* Authorization decisions.
* Lock commands.
* Reported command outcomes.
* Lock-state confirmations.
* Access-grant changes.
* Access-code management.
* Location-policy changes.
* Authorized location-data access.
* Lockdown actions.
* Security incidents.
* Integration configuration changes.
* Administrative exports.

Each event should contain applicable fields such as:

* Event ID.
* Timestamp.
* Actor.
* Target user.
* Target device.
* Target lock.
* Action.
* Outcome.
* Reason.
* Correlation ID.
* Source session.
* Relevant metadata.

Avoid placing unnecessary sensitive information in logs.

Never log plaintext passwords, MFA secrets, session tokens, or unmasked access codes.

Protect audit records against unauthorized modification and deletion.

Use restricted database privileges and tamper-evident integrity checks.

Where practical, support periodic signed audit summaries and export to a separate protected destination.

Do not describe ordinary database logs as perfectly immutable or tamper-proof against unrestricted server access.

Provide search, filters, date ranges, pagination, and authorized export.

---

# 20. LOCATION PRIVACY AND DATA RETENTION

Location collection must be transparent and configurable.

Implement:

* Purpose-specific location collection.
* User-visible location status.
* Configurable location retention.
* Role-based access to location data.
* Auditing of administrative location access.
* Configurable access to historical reports.
* Clear handling of missing or stale location.
* Separation between operational events and detailed location records.

Collect only the data necessary for enabled features.

Do not retain detailed location history indefinitely by default.

Support deletion or anonymization according to the configured retention policy, except where records must be preserved under a legitimate, documented incident or retention requirement.

Ensure that location-history permissions are independent from ordinary lock-control permissions.

---

# 21. DATABASE DESIGN

Use database migrations and appropriate indexes.

Create normalized tables for the major domains.

Suggested tables:

* users
* roles
* permissions
* role_permissions
* user_permissions
* properties
* locks
* user_lock_access
* devices
* user_sessions
* access_schedules
* access_grants
* access_codes
* location_events
* access_requests
* authorization_decisions
* lock_commands
* lock_state_events
* security_alerts
* security_incidents
* audit_logs
* notification_queue
* integration_status
* system_settings
* configuration_versions

Add appropriate foreign keys, uniqueness constraints, timestamps, and indexes.

Use transactions for related permission and access-management changes.

Define data-retention and deletion behavior.

Keep the following concepts separate:

1. Access request.
2. Authorization decision.
3. Command submission.
4. Integration response.
5. Reported physical state.
6. Final confirmation.

Do not compress these into one ambiguous status field.

Use UTC internally for timestamps and convert to the configured timezone in the UI.

Document database migrations and rollback limitations.

---

# 22. NOTIFICATIONS

Implement a notification service with configurable providers.

Potential channels:

* In-app notifications.
* Web Push.
* Email.
* Optional SMS integration.

Provide notification categories for:

* Access granted.
* Access denied.
* Remote unlock.
* Proximity detection.
* Device revoked.
* Security incident.
* Lock connectivity failure.
* Battery warning.
* Account expiration.
* Temporary access expiration.
* Integration authentication failure.

Allow authorized users to configure notification preferences within administrator-defined limits.

Do not let a user's notification preferences disable mandatory security alerts for designated administrators.

Use retry policies and delivery tracking.

Notification failure must not erase the underlying audit event.

---

# 23. ADMINISTRATION AND CONFIGURATION CENTER

Do not require administrators to edit source files to manage normal application behavior.

Provide GUI-based configuration for:

* Roles.
* Permissions.
* Remote-unlock policies.
* Proximity modes.
* Location thresholds.
* Geofence configuration.
* Authentication requirements.
* Session policies.
* Temporary-access defaults.
* Security-alert thresholds.
* Notification providers.
* Retention settings.
* Eufy integration configuration.
* Lockdown policies.
* Audit-export settings.

Every configurable setting must include:

* A clear name.
* A description.
* An explanation of its consequences.
* A sensible default.
* Input validation.
* Appropriate authorization.
* An audit record when changed.

Implement configuration versioning.

Display who changed a setting and when.

For high-impact changes, show a confirmation screen that explains the effects.

Store secrets separately from ordinary configuration.

---

# 24. API DESIGN

Create a documented, versioned API.

Use a consistent response format and error-handling strategy.

Organize endpoints into logical groups:

* Authentication.
* Users.
* Roles.
* Permissions.
* Locks.
* Lock commands.
* Devices.
* Access grants.
* Access-code metadata.
* Location.
* Alerts.
* Incidents.
* Audit logs.
* Notifications.
* Settings.
* Integration health.

Enforce authentication and authorization on every protected endpoint.

Use request validation, rate limiting, pagination, and consistent error responses.

Sensitive endpoints must require stronger authentication when configured.

Use CSRF protection for cookie-authenticated state-changing requests.

Restrict CORS to explicitly authorized origins.

Do not expose unrestricted internal integration endpoints.

Document the API with OpenAPI where appropriate.

Include examples of success responses, denial responses, validation errors, and unavailable-device responses.

---

# 25. TESTING REQUIREMENTS

Testing is mandatory.

Create automated unit, integration, and end-to-end tests.

## Unit tests

Test:

* Authentication rules.
* Permission resolution.
* Schedule evaluation.
* Location freshness.
* Geofence evaluation.
* Access-grant expiration.
* Command lifecycle.
* Idempotency.
* Lockdown policy.
* Audit-event generation.
* Notification retry behavior.

## Integration tests

Test:

* Database migrations.
* API authentication.
* Role enforcement.
* User suspension.
* Device revocation.
* Lock-command handling.
* Integration disconnection.
* Reauthentication failure.
* Command timeout.
* Unknown physical state.
* Audit persistence.
* Configuration changes.

## End-to-end tests

Verify that:

1. An administrator can create a user.
2. The administrator can assign permissions.
3. An authorized user can sign in.
4. The user can view the permitted lock.
5. An authorized request reaches the command service.
6. An unauthorized request is denied.
7. The outcome is recorded.
8. The UI reflects the actual reported state.
9. A revoked device can no longer request access.
10. A suspended account cannot unlock the door.

## Location tests

Test:

* Location permission denied.
* Location unavailable.
* Stale location.
* Poor accuracy.
* Invalid coordinates.
* Geofence boundary conditions.
* Missing near-door detection.
* Duplicate proximity events.
* Revoked device.
* Unauthorized user.
* Location-dependent remote unlock.
* Automatic proximity unlock disabled.

## Security tests

Test for:

* Broken access control.
* Privilege escalation.
* Session fixation.
* CSRF.
* XSS.
* SQL injection.
* Authentication brute force.
* Rate-limit bypass.
* Unauthorized API access.
* Sensitive data leakage.
* Replay of expired requests.
* Duplicate command submission.
* Unauthorized audit modification.

Use mock integrations for repeatable automated tests.

Never use a production lock as an uncontrolled test fixture.

Require explicit operator authorization before executing tests that physically lock or unlock a real door.

---

# 26. USER EXPERIENCE REQUIREMENTS

The application must be intuitive for both technical and nontechnical users.

Use:

* Clear navigation.
* Consistent terminology.
* Helpful explanations.
* Tooltips.
* Confirmation dialogs.
* Inline validation.
* Useful empty states.
* Contextual help.
* Search and filtering.
* Status indicators.
* Actionable error messages.
* Responsive design.
* Keyboard navigation.
* Accessible contrast.
* Appropriate focus management.

Avoid unexplained technical errors.

Instead of:

"Command failed: code 500"

Prefer:

"The lock could not confirm the requested operation. Its current state is unknown. Check the connection before trying again."

Provide a detailed diagnostic view for administrators.

Create a consistent design system rather than styling every screen independently.

---

# 27. PROJECT STRUCTURE

Create a maintainable project structure appropriate to the chosen framework.

A possible layout:

```text
lockguard/
│
├── app/
│   ├── Auth/
│   ├── Users/
│   ├── Permissions/
│   ├── Locks/
│   ├── AccessControl/
│   ├── Location/
│   ├── Devices/
│   ├── Audit/
│   ├── Alerts/
│   ├── Incidents/
│   ├── Notifications/
│   └── Settings/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── layouts/
│   │   ├── pages/
│   │   ├── features/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── types/
│   └── public/
│
├── integrations/
│   └── eufy/
│       ├── adapter/
│       ├── client/
│       ├── models/
│       ├── tests/
│       └── README.md
│
├── database/
│   ├── migrations/
│   ├── seeders/
│   └── factories/
│
├── tests/
│   ├── Unit/
│   ├── Integration/
│   ├── Security/
│   └── E2E/
│
├── config/
├── scripts/
├── deployment/
├── docs/
│
├── .env.example
├── .gitignore
├── README.md
└── SECURITY.md
```

Adjust the structure to match the selected framework and integration runtime.

Do not create empty folders or placeholder classes merely to make the project look complete.

---

# 28. INSTALLATION AND DEPLOYMENT

Provide a complete installation process.

Include:

* Required software.
* Supported versions.
* Dependency installation.
* Database creation.
* Database migrations.
* Initial administrator setup.
* Environment configuration.
* Frontend build.
* Apache configuration.
* HTTPS configuration.
* Background-worker configuration.
* Scheduled task configuration.
* Eufy integration setup.
* Integration authentication.
* Service startup.
* Health checks.
* Backup procedures.
* Upgrade instructions.
* Troubleshooting.

Provide example environment variables without real credentials.

Create appropriate helper scripts for the target operating system.

If developing on Windows, provide PowerShell or batch scripts where useful.

If deploying to Ubuntu, provide shell scripts and service configuration where appropriate.

Never disable TLS verification as a workaround.

Never use default production passwords.

Do not expose development services or debug consoles to the public internet.

---

# 29. DOCUMENTATION

Create the following documents:

1. README.md
2. docs/ARCHITECTURE.md
3. docs/EUFY_COMPATIBILITY_REPORT.md
4. docs/INSTALLATION.md
5. docs/ADMINISTRATOR_GUIDE.md
6. docs/USER_GUIDE.md
7. docs/PERMISSIONS.md
8. docs/LOCATION_AND_PROXIMITY.md
9. docs/SECURITY.md
10. docs/DATABASE.md
11. docs/API.md
12. docs/TROUBLESHOOTING.md
13. docs/BACKUP_AND_RECOVERY.md
14. docs/TESTING.md
15. docs/KNOWN_LIMITATIONS.md

Documentation must describe actual implemented behavior.

Do not document proposed functionality as though it is already operational.

Explain how to configure the Eufy integration, add users, assign permissions, manage devices, investigate access events, and recover from common failures.

---

# 30. DEVELOPMENT WORKFLOW

Work incrementally.

Do not attempt to create the entire application in one enormous code-generation step.

Use the following process:

STEP 1: Inspect the environment and existing files.

STEP 2: Produce the architecture and compatibility assessment.

STEP 3: Establish the Eufy integration proof of concept.

STEP 4: Implement authentication and authorization.

STEP 5: Implement the database schema and migrations.

STEP 6: Implement the centralized lock-command service.

STEP 7: Implement audit logging.

STEP 8: Build the administrative dashboard.

STEP 9: Build the mobile web application.

STEP 10: Implement access grants and user management.

STEP 11: Implement location and proximity features.

STEP 12: Implement security alerts and incident management.

STEP 13: Run automated tests.

STEP 14: Review security and operational failure cases.

STEP 15: Complete documentation and deployment scripts.

After each phase:

* Run relevant tests.
* Resolve failures before continuing.
* Update documentation.
* Identify incomplete functionality.
* Record significant architectural decisions.
* Avoid introducing unnecessary dependencies.
* Verify that previously working features remain functional.

Use a development checklist to track progress.

Do not mark a phase complete simply because its files have been generated.

---

# 31. CLAUDE CODE OPERATING RULES

Follow these rules throughout development.

1. Inspect before modifying.
2. Plan before large architectural changes.
3. Implement working features rather than static demonstrations.
4. Keep modules focused and maintainable.
5. Avoid unnecessary duplication.
6. Use secure framework defaults.
7. Validate all user-controlled input.
8. Enforce authorization on the server.
9. Never hardcode secrets.
10. Never fabricate device capabilities.
11. Never fabricate successful test results.
12. Never silently ignore errors.
13. Never hide unsupported functionality behind a working-looking interface.
14. Never assume the physical lock state from a command response alone.
15. Never make automatic unlocking the default.
16. Never rely on geofence membership alone to authorize an unlock.
17. Never claim background mobile location works without validating the target platform.
18. Never claim physical keypad-code synchronization works without testing it.
19. Never delete or overwrite unrelated project files.
20. Never run destructive database operations against an existing environment without explicit authorization.
21. Never execute a real unlock test without explicit operator authorization.
22. Never expose Eufy credentials to the frontend.
23. Never allow ordinary users to modify their own effective permissions.
24. Never allow an audit failure to be silently ignored for a sensitive operation.
25. Keep the application usable when the Eufy integration is unavailable.
26. Document all security-sensitive architectural decisions.
27. Prefer a smaller, reliable feature set over a large collection of simulated features.

When a requirement is ambiguous, choose a secure, maintainable default and document the assumption.

When a feature depends on unsupported hardware or external service behavior, implement the appropriate abstraction and clearly identify the dependency.

---

# 32. DEFINITION OF DONE

The project is not complete until the following conditions are satisfied.

## Core application

* The application starts successfully.
* Database migrations complete successfully.
* An administrator can be created securely.
* Users can authenticate and log out.
* Roles and permissions work.
* Unauthorized API requests are denied.
* User suspension and device revocation are enforced.

## Lock integration

* The integration can discover the configured device where supported.
* Lock-state retrieval works where supported.
* Lock and unlock commands work where supported.
* Command outcomes are recorded.
* Physical state confirmation is distinguished from command submission.
* Integration failures are visible.
* Unsupported operations are clearly identified.

## Mobile application

* Users can sign in securely.
* Users can see their permitted lock information.
* Users can perform authorized actions.
* Users cannot bypass backend permissions.
* Unavailable and unknown states are displayed accurately.
* Mobile layouts work at common screen sizes.

## Security

* Sensitive credentials are protected.
* Session revocation works.
* Device revocation works.
* Audit records are generated.
* Location policies are enforced.
* Unauthorized location access is denied.
* Security alerts are recorded.
* Sensitive operations have appropriate tests.

## Reliability

* Integration timeouts are handled.
* Duplicate commands are controlled.
* Stale state is identified.
* Background jobs recover safely.
* Database and integration failures produce actionable messages.

## Documentation

* Installation instructions are complete.
* Configuration is documented.
* Security limitations are disclosed.
* Eufy compatibility is documented.
* Tests and known limitations are reported accurately.

A feature is complete only when its implementation, validation, error handling, and documentation are adequate for its intended use.

---

# 33. FINAL DELIVERABLES

Deliver:

1. Complete source code.
2. Working administrative web application.
3. Working mobile web application.
4. Backend API.
5. Database migrations.
6. Eufy integration module.
7. Authentication and permission engine.
8. Central lock-command service.
9. Access-grant management.
10. Location and proximity modules.
11. Audit and security logging.
12. Security alert and incident modules.
13. Automated tests.
14. Installation scripts.
15. Deployment configuration.
16. Example environment configuration.
17. Administrator documentation.
18. User documentation.
19. Eufy compatibility report.
20. Known limitations report.
21. Backup and recovery instructions.
22. A final implementation and testing summary.

At completion, provide a concise report containing:

* What was implemented.
* What was tested successfully.
* What remains incomplete.
* Which features require physical-device testing.
* Which features depend on mobile operating-system capabilities.
* Which Eufy operations remain unsupported or unverified.
* Any remaining security concerns.
* Exact installation and startup commands.

Do not claim production readiness merely because the application builds or its dashboard loads.

# 34. MANDATORY UI DESIGN SYSTEM, BRANDING, AND APPLICATION MOCKUP REFERENCE

## 34.1 Objective

Design and implement a polished, professional, security-focused user interface for DM LockGuard.

The application must include two distinct user experiences that share the same visual identity and design system:

1. **DM LockGuard Server UI:** A full-featured desktop administration and security control center.
2. **DM LockGuard Mobile Web App:** A mobile-first interface for authorized users to control their assigned locks, manage their trusted devices, review permitted activity, and access security settings.

Both interfaces must look like parts of the same professionally designed product.

The objective is to deliver an application with the visual quality, usability, consistency, and attention to detail expected from a premium commercial access-control platform.

Do not create a generic administration template, an unstyled collection of forms, or a dashboard that merely looks impressive in a screenshot.

The actual implemented application must follow the design specification.

---

## 34.2 Existing Logo File: Mandatory Inspection

A DM Lock logo asset already exists and must be located and evaluated before creating any new logo.

Before implementing the frontend:

1. Inspect the existing project directory.
2. Search the project and relevant asset directories for existing DM Lock, DM LockGuard, and DM Networks branding files.
3. Look for image formats including PNG, SVG, WebP, JPG, and other suitable formats.
4. Check existing project assets and any logo file explicitly supplied by the operator.
5. Identify the best available logo file and record its actual path.
6. Preserve the original logo file.
7. Copy or optimize the logo into the application's asset directory when appropriate.
8. Use the same approved logo throughout the desktop application, mobile web app, login screen, loading screen, and supported PWA installation assets.

**Do not assume a logo file exists at a particular path without verifying it.**

If the original logo is available, use it rather than inventing a replacement.

If multiple versions exist, inspect them and select the version that best matches the approved DM Lock branding.

Prefer a transparent-background logo for placement on dark interfaces. Preserve the original aspect ratio, proportions, colors, and metallic effects.

Do not stretch, distort, crop, recolor, or recreate the logo using ordinary text.

If the logo is not found, document that fact and request or identify the missing asset. A temporary text-based brand placeholder may be used during development, but it must not be presented as the approved logo.

### Recommended asset organization

Use an appropriate structure such as:

```text
frontend/
└── public/
    └── assets/
        ├── branding/
        │   ├── dm-lock-logo.png
        │   ├── dm-lock-logo.svg
        │   ├── dm-lock-icon.png
        │   └── dm-lock-favicon.png
        └── images/
```

These filenames are suggestions, not assumptions about existing files. Use the actual available format and preserve the original asset.

Only create alternative logo variants when necessary for specific display requirements, such as a compact application icon.

---

## 34.3 Official Visual Identity

Use the existing DM Lock logo as the primary branding reference.

### Core design characteristics

The interface should communicate:

* Security.
* Control.
* Reliability.
* Technical sophistication.
* Precision.
* Professionalism.
* Modern smart-home technology.

The visual style should combine a dark metallic appearance with luminous blue interface elements and controlled red security accents.

The result should feel bold, modern, and purpose-built for security management.

Avoid cartoonish graphics, excessive decoration, oversized gradients, excessive glass effects, and distracting animations.

### Recommended color palette

Establish these colors as centralized design tokens.

| Purpose                     | Color           | Suggested Hex |
| --------------------------- | --------------- | ------------- |
| Main application background | Near-black navy | `#050B14`     |
| Primary panel               | Deep navy       | `#091523`     |
| Secondary panel             | Dark slate      | `#101D2C`     |
| Elevated panel              | Steel slate     | `#17283A`     |
| Primary electric blue       | Electric blue   | `#087FFF`     |
| Bright blue highlight       | Cyan blue       | `#20B8FF`     |
| Primary text                | Cool white      | `#F4F7FC`     |
| Secondary text              | Muted blue-gray | `#A8B7C9`     |
| Subtle borders              | Steel blue-gray | `#243B52`     |
| Confirmed success           | Green           | `#20D990`     |
| Warning                     | Amber           | `#FFB547`     |
| Critical alert              | Vivid red       | `#FF4057`     |
| Disabled or unknown         | Neutral gray    | `#78889A`     |

These are initial design tokens. Adjust them slightly if necessary to achieve better contrast or consistency with the existing logo.

Do not use every accent color everywhere.

Use blue for primary actions, navigation selection, focus indicators, and active interface elements.

Use green for confirmed healthy states and verified successful operations.

Use amber for warnings, degraded conditions, and actions requiring attention.

Use red for critical security alerts, dangerous operations, failed authorization, and emergency indicators.

Use gray for unavailable, disabled, stale, or unknown states.

Never rely on color alone to communicate a status. Pair colors with text labels and appropriate icons.

### Typography

Use a modern, readable typeface such as Inter.

Establish a consistent typography system for:

* Page titles.
* Section headings.
* Panel headings.
* Body text.
* Supporting descriptions.
* Status labels.
* Tables.
* Form labels.
* Buttons.
* Timestamps.
* Technical diagnostic information.

Use clear size and weight differences to establish hierarchy.

Do not make ordinary text unnecessarily small to fit more information onto the screen.

### Components

Create reusable components for:

* Buttons.
* Icon buttons.
* Navigation items.
* Status badges.
* Information cards.
* Confirmation dialogs.
* Warning banners.
* Form fields.
* Search controls.
* Dropdown menus.
* Tables.
* Empty states.
* Loading indicators.
* Tooltips.
* Toast notifications.
* Pagination.
* Tabs.
* Activity entries.
* Security alerts.
* Lock status displays.
* Device status indicators.

Components must behave consistently across the application.

---

## 34.4 Desktop Server UI Design

The desktop Server UI is the primary administrative control center.

It must be optimized for desktop browsers and larger screens while remaining usable on tablets.

Use a persistent navigation sidebar, a professional application header, and a flexible content area.

### Desktop application shell

The standard desktop layout should contain:

**1. Left navigation sidebar**

Include the approved DM Lock logo near the top.

Organize navigation into clearly labeled functional groups.

Recommended navigation:

**OVERVIEW**

* Dashboard.

**ACCESS MANAGEMENT**

* Users.
* Roles and Permissions.
* Properties.
* Locks.
* Access Codes.
* Access Grants.
* Access Schedules.
* Trusted Devices.

**LOCATION AND SECURITY**

* Location and Proximity.
* Security Center.
* Alerts.
* Incidents.
* Audit Logs.

**SYSTEM**

* Eufy Integration.
* Device Health.
* Notifications.
* System Health.
* Settings.
* Help and Documentation.

Use recognizable icons, readable labels, active-page highlighting, and tooltips when appropriate.

Allow the sidebar to collapse to an icon-only mode without losing navigation functionality.

Do not show navigation items that a user is not authorized to access.

**2. Application header**

Include:

* Current page or contextual navigation.
* Global search where appropriate.
* Integration health indicator.
* Notification center.
* Current user identity.
* User role.
* Account menu.
* Settings shortcut.

Display connection health accurately.

A green indicator must not imply that every integration is healthy when one or more required services are unavailable.

**3. Main content area**

Use a responsive grid system with consistent spacing.

Pages should have clear headings, concise descriptions, and relevant actions.

Avoid overcrowding the dashboard with unnecessary cards.

**4. Contextual information**

Use side panels, expandable sections, tooltips, and detail drawers where they improve usability.

Prefer opening additional detail without forcing users to leave their current workflow.

---

## 34.5 Desktop Dashboard

Create a premium security operations dashboard.

The dashboard must provide a useful overview of the system without pretending unsupported integrations or telemetry exist.

### Primary dashboard elements

**Lock Status Panel**

Display:

* Lock name.
* Device model.
* Current reported lock state.
* Connection status.
* Last state confirmation.
* Last successful communication.
* Battery level, if supported.
* Last command outcome.
* State freshness.

Provide authorized lock and unlock actions.

Sensitive actions must require the configured authorization checks and confirmation behavior.

Do not assume that a successful command submission means the physical lock reached the requested state.

**Eufy Integration Health Panel**

Display:

* Integration connection status.
* Authentication status.
* Last successful synchronization.
* Last communication error.
* Reconnection status.
* Supported device information.

Provide an administrative diagnostic view.

**Users and Access Panel**

Display appropriate summary information such as:

* Active users.
* Suspended users.
* Temporary access grants.
* Expiring access.
* Revoked devices.

**Security Alerts Panel**

Display:

* Active alerts.
* Severity.
* Timestamp.
* Affected user or device, when appropriate.
* Acknowledgment status.

Provide a shortcut to the Security Center.

**Recent Activity Panel**

Display recent security-relevant events, including:

* User authentication.
* Lock and unlock requests.
* Authorization decisions.
* Confirmed lock-state changes.
* Device enrollment or revocation.
* Integration failures.
* Security incidents.

Distinguish requested actions, denied actions, submitted commands, and confirmed physical outcomes.

**System Health Panel**

Display the health of the actual implemented subsystems, such as:

* Application backend.
* Database.
* Background workers.
* Eufy integration.
* Notification service.
* Live-update service.
* Audit subsystem.

Show unknown or unavailable states honestly.

### Dashboard customization

Where practical, allow administrators to configure dashboard widgets and their order.

Persist preferences appropriately.

Do not make essential security alerts removable from the views in which administrators are required to see them.

---

## 34.6 Desktop Screen Specifications

Design the following screens with consistent navigation and reusable components.

### A. Login and Authentication

Include:

* Approved DM Lock branding.
* Username or email field.
* Password field.
* Password visibility control.
* Sign-in button.
* MFA verification when required.
* Clear authentication errors.
* Account recovery options where implemented.

Avoid exposing technical stack traces or sensitive authentication details.

### B. User Management

Provide:

* Searchable user table.
* Status filters.
* Role filters.
* Property and lock filters.
* User creation.
* User editing.
* Role assignment.
* Permission overrides.
* Account suspension.
* Session revocation.
* Trusted-device management.
* Account expiration.
* User security history.

Use clear confirmation dialogs for suspension, revocation, and other consequential actions.

### C. Roles and Permissions

Create a readable permission-management interface.

Group permissions by functional area.

Display the effective permissions of each role or user.

Include a permission preview before saving changes.

Explain inherited permissions and individual overrides.

Do not make administrators navigate an enormous, unstructured list of checkboxes.

### D. Lock Management

Display registered locks in a table or card layout.

Include:

* Lock name.
* Model.
* Reported state.
* Connection status.
* State freshness.
* Battery level when supported.
* Integration health.
* Last communication.
* Last command outcome.

Opening a lock must reveal its details, activity, access assignments, and integration diagnostics.

### E. Access Codes and Temporary Access

Provide:

* Access-code records.
* Associated user.
* Associated lock.
* Validity period.
* Expiration.
* Revocation status.
* Synchronization status.
* Operation support status.

Clearly distinguish application-level access records from physical keypad codes stored on the lock.

Never indicate that a physical code has been changed or revoked without confirmation from a supported integration mechanism.

Mask sensitive code values.

### F. Location and Proximity

Provide:

* Property location configuration.
* Geofence configuration.
* Location freshness settings.
* Accuracy thresholds.
* Proximity mode.
* Near-door detection status.
* Location permission status.
* Relevant security events.

The default proximity mode must remain ARRIVAL_NOTIFICATION.

Automatic proximity unlocking must remain disabled unless all required capabilities and security conditions have been validated.

Clearly display when location information is unavailable or insufficient.

### G. Security Center

Provide:

* Security event feed.
* Severity filters.
* Event search.
* Failed authentication attempts.
* Denied unlock requests.
* Device revocation events.
* Integration failures.
* Location validation failures.
* Incident creation and tracking.

### H. Audit Logs

Provide:

* Search.
* Date filters.
* Actor filters.
* Target-device filters.
* Event categories.
* Outcome filters.
* Paginated results.
* Authorized exports.
* Detailed event inspection.

Protect sensitive data and enforce audit-log access permissions.

### I. Settings and Integration Diagnostics

Provide GUI-based configuration for supported application settings.

Organize settings by category.

Explain each setting's purpose and consequences.

Show configuration changes, validation errors, and previous values where appropriate.

Protect integration credentials and other secrets.

Never display secret values unnecessarily.

---

## 34.7 Mobile Web App Design

The mobile web app must be designed as a separate, mobile-first user experience.

Do not simply shrink the desktop dashboard to fit a phone.

Prioritize the actions that authorized residents and guests need most often.

Use the same colors, typography, logo, icons, and visual language as the desktop application.

The mobile interface must be optimized for one-handed operation and common smartphone screen sizes.

### Mobile layout

Use:

* A compact application header.
* The approved logo or a verified compact logo variant.
* Clear lock-state information.
* Large touch-friendly controls.
* Readable typography.
* Adequate spacing between interactive elements.
* A persistent bottom navigation bar where appropriate.
* Scrollable content with clear section boundaries.
* Accessible dialogs and forms.

Do not make important controls too small or place destructive actions next to frequently used controls without sufficient separation.

### Mobile navigation

Recommended primary navigation:

1. Home.
2. Activity.
3. Devices.
4. More.

The More section may contain:

* Location and Proximity.
* Notifications.
* Account Security.
* Help and Support.
* Sign Out.

Only show features and actions the authenticated user is authorized to access.

The backend must independently enforce every permission.

---

## 34.8 Mobile Screen Specifications

### A. Mobile Login

Include:

* DM LockGuard branding.
* Username or email.
* Password.
* Password visibility toggle.
* Sign-in action.
* MFA verification when required.
* Password recovery where implemented.
* Clear, user-friendly error messages.

The login screen should look polished without excessive visual effects.

### B. Mobile Home

The home screen is the most important mobile screen.

At the top, show:

* Compact branding.
* User greeting or account identity.
* Notification indicator.
* Relevant security alerts.

The main lock card must show:

* Lock name.
* Device model where useful.
* Current reported state.
* Connection status.
* Last confirmation timestamp.
* State freshness.

Use a prominent lock-state indicator.

Provide clearly differentiated Lock and Unlock controls when the user is authorized to use them.

The interface must distinguish:

* Locked.
* Unlocked.
* Locking.
* Unlocking.
* State Unknown.
* State Stale.
* Device Unavailable.

Show a pending state while a command is processing.

Only display confirmed success after the appropriate device-state confirmation has been received.

If the operation times out, show that the outcome is unknown and provide safe, actionable guidance.

Do not automatically repeat an ambiguous unlock request.

Below the main lock card, include compact status cards for:

* Connection health.
* Location status.
* Proximity status.
* Relevant notifications.

Only show actual supported information.

### C. Mobile Lock Controls

Create a focused lock-control screen.

Include:

* Large lock-state display.
* Lock and unlock actions.
* Last confirmed state.
* Connection health.
* Last command outcome.
* Device details.
* Relevant errors.

Use a confirmation step for remote unlocking when required by the active security policy.

Do not use animations that imply an operation succeeded before confirmation.

### D. Mobile Activity

Display a chronological activity list.

Each event should include:

* Time.
* Action.
* Result.
* Relevant lock.
* Relevant user or system actor, subject to permissions.

Use recognizable icons and readable status labels.

Provide filters for event type and outcome where practical.

Do not expose other users' private information to unauthorized users.

### E. Mobile Devices

Display the user's trusted devices.

Include:

* Device name.
* Enrollment status.
* Last activity when available.
* Trust status.
* Revocation status.

Allow permitted device-management actions.

Explain the consequences of revoking a device.

### F. Mobile Location and Proximity

Display:

* Location permission status.
* Most recent accepted location timestamp.
* Location freshness.
* Current proximity mode.
* Geofence status when available.
* Near-door detection availability.
* Relevant warnings.

Explain why automatic proximity unlocking is unavailable if a required capability has not been implemented or verified.

Do not suggest that the server can track a phone indefinitely when the browser is closed or location permission has been withdrawn.

### G. Mobile Notifications

Provide a list of alerts and notifications.

Include:

* Severity.
* Timestamp.
* Description.
* Read status.
* Relevant event details when authorized.

Mandatory security notifications must not be silently disabled by user preferences.

### H. Mobile Account Security

Include:

* Account details.
* Role information.
* MFA settings where implemented.
* Active sessions.
* Trusted devices.
* Session revocation.
* Password or authentication management where implemented.

Avoid displaying administrative functions to ordinary users.

### I. Mobile Help and Troubleshooting

Provide clear explanations for common problems:

* Lock unavailable.
* Integration disconnected.
* State unknown.
* Request denied.
* Location permission denied.
* Location too old.
* Proximity detection unavailable.
* Session expired.

Offer specific recovery steps where possible.

---

## 34.9 Interaction and Feedback Standards

Every interactive element must have a defined behavior.

Do not create decorative buttons that do nothing.

### Required interface feedback

Provide:

* Loading indicators.
* Disabled states.
* Success messages.
* Warning messages.
* Error messages.
* Empty states.
* Network-error states.
* Integration-unavailable states.
* Confirmation dialogs.
* Form validation.
* Keyboard focus indicators.

For long-running actions, show progress and the current operation status.

For asynchronous lock commands, use the actual backend command lifecycle.

Distinguish between:

1. Request received.
2. Authorization completed.
3. Command submitted.
4. Integration response received.
5. Physical state confirmed.
6. Operation failed or outcome unknown.

Use the terminology consistently throughout desktop and mobile interfaces.

### Confirmation requirements

Require appropriate confirmation for sensitive actions, including:

* Remote unlock when configured.
* User suspension or revocation.
* Trusted-device revocation.
* Access-grant revocation.
* Critical permission changes.
* Lockdown activation or deactivation.
* High-impact configuration changes.

Confirmation dialogs must clearly explain the action and its consequences.

Do not use confirmation dialogs for every ordinary interaction.

---

## 34.10 Responsive Design and Accessibility

Implement a consistent responsive design system.

### Desktop

Optimize the full administrative interface for larger displays.

Use tables and multi-column layouts where they improve administrative efficiency.

Ensure that important controls remain accessible at common desktop resolutions.

### Tablet

Adapt navigation, cards, tables, and forms to narrower viewports.

Allow horizontal table scrolling only where necessary.

### Mobile

Use single-column layouts for most primary workflows.

Stack cards vertically.

Use full-width primary actions when appropriate.

Prevent horizontal overflow.

Ensure that forms, dialogs, and navigation work with touch input.

### Accessibility

Target WCAG 2.2 AA where practical.

Implement:

* Sufficient text contrast.
* Keyboard navigation.
* Visible focus states.
* Semantic HTML.
* Accessible labels.
* Screen-reader announcements for relevant status changes.
* Proper dialog focus management.
* Reduced-motion support.
* Appropriate touch target sizes.

Do not communicate security state through color or animation alone.

---

## 34.11 Animation and Visual Effects

Use restrained, purposeful motion.

Acceptable examples include:

* Smooth navigation transitions.
* Subtle card hover effects on desktop.
* Button interaction feedback.
* Loading indicators.
* Gentle status transitions.
* Expandable detail panels.

Avoid:

* Constantly pulsing interface elements.
* Flashing effects outside deliberate critical-alert handling.
* Excessive glowing borders.
* Large animated backgrounds.
* Unnecessary 3D effects on operational controls.
* Animations that delay access to essential information.

Respect the user's reduced-motion preference.

The application must remain responsive on ordinary computers and smartphones.

---

## 34.12 Desktop and Mobile Design References

Use the following reference images if they are available in the project, attached files, or another location explicitly supplied by the operator:

* DM LockGuard desktop dashboard mockup.
* DM LockGuard mobile web application mockup.
* Approved DM Lock logo.

Search for these assets before recreating them.

The mockups are visual references for layout, color, hierarchy, branding, and component styling.

They are not permission to fabricate functionality.

Do not copy inaccurate sample data from a mockup into production behavior.

Do not reproduce visual elements that conflict with the actual project requirements.

The existing `project.md` specification remains authoritative for functionality and security.

The approved logo remains authoritative for branding.

If a mockup depicts a camera feed, vehicle integration, or other feature not included in the implemented requirements, do not introduce that feature merely because it appears in an image.

Do not invent additional integrations or imply support for unsupported hardware.

---

## 34.13 Implementation Requirements

Implement the design as reusable frontend components.

Use the project's React, TypeScript, Vite, and Tailwind CSS stack unless a documented technical constraint requires an alternative.

Create centralized design tokens for:

* Colors.
* Typography.
* Spacing.
* Border radii.
* Shadows.
* Focus states.
* Breakpoints.
* Animation timing.
* Status colors.

Use reusable layouts for desktop and mobile.

Share appropriate components while preserving the different interaction patterns required by each interface.

Separate presentation components from API communication, authorization decisions, and business logic.

Retrieve application data from the backend.

Do not hardcode dashboard statistics, lock status, user locations, integration health, or activity records as permanent production data.

Use clearly identified demonstration fixtures only in development or designated demonstration mode.

Never present simulated information as live physical-device telemetry.

Ensure that the application handles empty databases, unavailable integrations, expired sessions, API errors, and stale information gracefully.

---

## 34.14 Required UI Development Checkpoints

Update `checkpoint.log` at the end of each meaningful UI development milestone.

Each entry must follow the project's established checkpoint format and include:

* Timestamp.
* Percent complete.
* Current task.
* Work completed.
* Remaining work.
* Important issues or decisions requiring attention.

Use the following UI development sequence:

**UI CHECKPOINT 1: BRANDING AND ASSETS**

* Locate and inspect the existing logo.
* Identify available mockup references.
* Establish design tokens.
* Document missing assets.

**UI CHECKPOINT 2: SHARED COMPONENTS**

* Implement typography.
* Implement buttons, forms, cards, badges, dialogs, and status indicators.
* Verify contrast and accessibility.

**UI CHECKPOINT 3: DESKTOP APPLICATION SHELL**

* Implement the navigation sidebar.
* Implement the application header.
* Implement the responsive content layout.
* Implement authorized navigation.

**UI CHECKPOINT 4: DESKTOP DASHBOARD**

* Connect dashboard components to actual backend data.
* Implement lock status, integration health, activity, alerts, and system health.
* Handle unavailable and stale information.

**UI CHECKPOINT 5: ADMINISTRATIVE SCREENS**

* Implement users.
* Implement roles and permissions.
* Implement lock management.
* Implement access management.
* Implement security and audit interfaces.
* Implement configuration screens.

**UI CHECKPOINT 6: MOBILE APPLICATION SHELL**

* Implement mobile navigation.
* Implement responsive layouts.
* Verify touch interactions.
* Verify the login and session experience.

**UI CHECKPOINT 7: MOBILE LOCK WORKFLOWS**

* Implement mobile home.
* Implement lock controls.
* Implement activity.
* Implement trusted devices.
* Implement location and proximity.
* Implement notifications and account security.

**UI CHECKPOINT 8: INTEGRATION AND TESTING**

* Connect screens to real API endpoints.
* Test authorized and unauthorized access.
* Test pending, success, failure, unknown, stale, and offline states.
* Test responsive behavior.
* Resolve visual and functional defects.

**UI CHECKPOINT 9: FINAL REVIEW**

* Verify logo usage.
* Verify visual consistency.
* Verify accessibility.
* Verify all navigation and actions.
* Remove accidental placeholders.
* Document remaining limitations.

Do not mark a checkpoint complete merely because a page renders.

---

## 34.15 Definition of Done for the UI

The desktop and mobile interfaces are complete only when:

1. The approved DM Lock logo has been located and correctly integrated, or its absence has been explicitly documented.
2. Both interfaces use the same coherent visual identity.
3. The desktop application provides a complete, navigable administrative experience.
4. The mobile application provides a complete, mobile-first user experience.
5. Responsive layouts work at common screen sizes.
6. All interactive elements have meaningful behavior.
7. Live data comes from the appropriate backend endpoints.
8. Simulated data is clearly identified and isolated.
9. Permissions are enforced by the backend.
10. Lock-state information distinguishes command submission from confirmed physical state.
11. Unknown, stale, offline, and unavailable states are displayed accurately.
12. Forms provide appropriate validation and error messages.
13. Sensitive operations use the required confirmation and authentication controls.
14. The interface meets the project's accessibility requirements.
15. No unsupported integration is presented as operational.
16. UI tests and relevant integration tests pass.
17. The final implementation and remaining limitations are documented.

**Final instruction:** Build DM LockGuard as a unified, professional security product. Use the supplied branding, follow the desktop and mobile specifications, connect the interfaces to the real backend, and prioritize accurate security information over decorative effects.

---

# START HERE

Begin by inspecting the existing development environment and target directory.

Then produce a concise implementation plan and the Eufy T85D0 compatibility assessment.

Proceed with the smallest useful integration proof of concept before implementing advanced location-aware unlocking.

Once the integration path is established, build the application in phases, testing each subsystem before moving to the next.

The final objective is a secure, polished, maintainable smart-lock management platform with centralized authorization, reliable device integration, transparent location-aware access, and a complete audit trail.

**Build the real application. Test what can be tested. Clearly disclose what cannot yet be verified.**




#Other Important Settings

Do not process big chunks of data, break up into smaller chunk of data so that the ai will not seize up and stop processing and responding.

Create a checkpoint.log file and insert an entry at EOF in following format with the following information:

Timestamp:
Percent complete:
Description of what you are working on.
What you have done so far:
What needs to be done.
What is important or stands out that needs attention or needs to be address.

