## ADDED Requirements

### Requirement: Message contracts SHALL be defined from a single source of truth
The system SHALL define request and response contracts per message type in a centralized registry used by runtime validation and testing.

#### Scenario: Contract lookup for incoming request
- **WHEN** a message is received with a known message type
- **THEN** the system resolves the request contract from the centralized contract registry
- **AND** the system applies contract metadata (version/domain/compatibility mode) during validation

#### Scenario: Missing contract definition
- **WHEN** a message type has no registered contract
- **THEN** the system returns a standardized validation error
- **AND** the event is logged with correlation metadata

### Requirement: Ingress validation SHALL enforce request correctness before handler execution
The system SHALL validate transport headers and request payloads at router ingress before dispatching handlers.

#### Scenario: Valid request reaches handler
- **WHEN** a message has valid `v`, `type`, `correlationId`, and payload per contract
- **THEN** the system dispatches the message to its registered handler

#### Scenario: Invalid request is rejected early
- **WHEN** a message fails header or payload validation
- **THEN** the system returns a standardized error response
- **AND** the handler MUST NOT execute

### Requirement: Data SHALL cross layers through explicit DTO and mapper boundaries
The system SHALL use explicit DTO and mapper conversions between transport, application, and persistence layers.

#### Scenario: Transport payload enters application layer
- **WHEN** a valid message payload is accepted
- **THEN** the system transforms transport data into an application request DTO
- **AND** business logic consumes DTO fields rather than raw transport objects

#### Scenario: Persistence entity returns to response layer
- **WHEN** persistence data is read or written
- **THEN** mapper logic transforms DB entities into application DTOs and then transport response DTOs
- **AND** inline ad-hoc field conversion in handlers is avoided

### Requirement: Error responses SHALL use one canonical envelope
The system SHALL return errors in a canonical structure that includes code, message, bounded details, and correlation metadata.

#### Scenario: Handler returns domain error
- **WHEN** a handler encounters validation, auth, or domain failure
- **THEN** the response contains canonical `error.code`, `error.message`, and correlation metadata
- **AND** technical details are bounded and safe to expose

#### Scenario: Legacy consumer compatibility during migration
- **WHEN** a legacy consumer still depends on older aliases
- **THEN** compatibility aliases may be present temporarily
- **AND** canonical envelope fields remain the source of truth

### Requirement: Egress validation SHALL verify response contract compliance
The system SHALL validate response payload shape against contract definitions before returning it.

#### Scenario: Response contract is valid
- **WHEN** a handler generates a response matching the registered response contract
- **THEN** the response is returned to the caller

#### Scenario: Response contract mismatch in warn-only mode
- **WHEN** response validation detects mismatch while contract is in warn-only mode
- **THEN** the response may still be returned
- **AND** the mismatch is logged with correlation metadata for migration tracking

#### Scenario: Response contract mismatch in strict mode
- **WHEN** response validation detects mismatch while contract is in strict mode
- **THEN** the system returns a standardized internal contract error
- **AND** the invalid response payload is not returned as successful output

### Requirement: Content-script boundary SHALL converge to shared message contracts
The system SHALL progressively align content-script message handling with shared message contracts used by the background.

#### Scenario: Legacy action-string request arrives
- **WHEN** a content request uses legacy `action` style messaging
- **THEN** adapter logic maps it to a contract-defined message shape
- **AND** processing follows shared validation and error conventions

#### Scenario: Migrated content flow executes
- **WHEN** a content flow is migrated to shared contract messages
- **THEN** request and response validation behavior matches the background contract system
