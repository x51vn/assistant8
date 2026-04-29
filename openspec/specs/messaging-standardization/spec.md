## ADDED Requirements

### Requirement: UI request-response messaging uses runtime gateway
UI modules SHALL use the shared runtime gateway for request-response messages sent from the side panel UI to the background service worker.

#### Scenario: UI API wrapper sends a background request
- **WHEN** a UI API wrapper sends a request-response message to the background
- **THEN** it MUST use `sendRuntimeMessage` or a gateway helper that applies the standard envelope

#### Scenario: Direct Chrome messaging remains necessary
- **WHEN** code performs a broadcast listener, content-script bridge, platform adapter, or explicitly documented low-level Chrome operation
- **THEN** direct `chrome.runtime.sendMessage` MAY remain only if it is covered by an allowlist or documented exception

### Requirement: Background handlers use message constants
Background handler registration and response message types SHALL use central `MESSAGE_TYPES` constants for active message types.

#### Scenario: Handler registers an active message type
- **WHEN** a background handler calls `registerHandler`
- **THEN** it MUST use `MESSAGE_TYPES.<NAME>` unless the handler is an explicitly documented legacy compatibility alias

### Requirement: Error code source of truth is shared
Active background, platform, and UI error handling SHALL use the shared error-code source of truth for canonical errors.

#### Scenario: Router creates an invalid-input response
- **WHEN** message header or payload validation fails
- **THEN** the router MUST use the shared canonical `ERROR_CODES.INVALID_INPUT`

#### Scenario: Legacy error helpers remain during migration
- **WHEN** a legacy helper still imports old error definitions
- **THEN** the migration MUST either switch it to the shared source or document a compatibility reason and add a follow-up task

### Requirement: Contract coverage expands with migrated domains
The message contract registry SHALL cover migrated domains with request/response schemas and compatibility modes.

#### Scenario: A domain is migrated to gateway and constants
- **WHEN** a domain finishes migration
- **THEN** its core request and response message types MUST have contract registry coverage or a documented reason for warn-only treatment
