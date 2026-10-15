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

