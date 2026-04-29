## ADDED Requirements

### Requirement: Prompt bootstrap on authenticated startup
The system SHALL load unified prompts automatically when the authenticated extension UI starts, without requiring the user to open Settings or the Prompts page.

#### Scenario: Authenticated side panel opens
- **WHEN** an authenticated user opens the extension side panel
- **THEN** the system loads prompts through the unified prompt loading API
- **AND** the system populates `allPrompts.value` before prompt-management pages are opened

#### Scenario: Same user remounts without prompt state change
- **WHEN** the authenticated UI remounts for the same user and prompt state has already been bootstrapped
- **THEN** the system MUST NOT perform duplicate prompt bootstrap work for that same user session

### Requirement: Persistent user-scoped prompt cache
The system SHALL persist prompt cache data in `chrome.storage.local` using a key scoped to the authenticated Supabase user id.

#### Scenario: Cache is written after successful Supabase load
- **WHEN** prompts are loaded successfully from Supabase for user `A`
- **THEN** the system writes normalized prompts to a cache key scoped to user `A`
- **AND** the cache payload includes schema version, registry version, user id, source, cached timestamp, and prompts

#### Scenario: Different user has separate cache
- **WHEN** user `B` loads prompts after user `A`
- **THEN** the system reads and writes a cache key scoped to user `B`
- **AND** the system MUST NOT read prompt content from user `A` cache for user `B`

### Requirement: Cache validation
The system SHALL validate prompt cache payloads before using them.

#### Scenario: Cache payload is valid and fresh
- **WHEN** a cache payload has matching schema version, matching registry version, matching user id, required prompt data, and an unexpired timestamp
- **THEN** the system returns the cached prompts without fetching Supabase
- **AND** the response metadata identifies the source as cache

#### Scenario: Cache payload belongs to another user
- **WHEN** a cache payload user id does not match the current authenticated user id
- **THEN** the system treats the cache as invalid
- **AND** the system fetches prompts from Supabase or falls back according to fallback rules

#### Scenario: Cache registry version is incompatible
- **WHEN** a cache payload registry version does not match the current prompt registry version
- **THEN** the system treats the cache as invalid
- **AND** the system refreshes prompt data from Supabase or defaults

### Requirement: Stale and missing cache fallback
The system SHALL preserve prompt availability when cache is stale, missing, or Supabase is unavailable.

#### Scenario: Fresh cache exists
- **WHEN** `PROMPTS_GET_ALL` is called with cache preference and fresh cache exists
- **THEN** the system returns cached prompts
- **AND** the system MUST NOT call Supabase for that request

#### Scenario: Stale cache and Supabase refresh succeeds
- **WHEN** `PROMPTS_GET_ALL` is called with cache preference and only stale cache exists
- **AND** Supabase refresh succeeds within the configured bounds
- **THEN** the system returns fresh Supabase prompts
- **AND** the system updates the cache

#### Scenario: Stale cache and Supabase refresh fails
- **WHEN** `PROMPTS_GET_ALL` is called with cache preference and only stale cache exists
- **AND** Supabase refresh fails
- **THEN** the system returns stale cached prompts
- **AND** the response metadata marks the cache as stale

#### Scenario: Cache miss and Supabase fails
- **WHEN** no valid cache exists
- **AND** Supabase prompt loading fails
- **THEN** the system returns default prompts from the local prompt registry
- **AND** the UI remains usable rather than blank

### Requirement: Force refresh bypasses cache
The system SHALL support a force refresh path that bypasses valid cache and reloads prompts from Supabase.

#### Scenario: User refreshes prompts page
- **WHEN** the user activates refresh on the Prompts page
- **THEN** the UI calls prompt loading with force refresh enabled
- **AND** the background handler bypasses cache for that request
- **AND** successful Supabase data replaces the cache

### Requirement: Prompt save updates cache consistently
The system SHALL update or invalidate prompt cache after prompt save attempts.

#### Scenario: All prompts save successfully
- **WHEN** `PROMPTS_UPSERT` saves all submitted prompts successfully
- **THEN** the system updates the user-scoped cache with the saved normalized prompts
- **AND** subsequent prompt consumers use the newly saved prompt content

#### Scenario: Prompt save partially fails
- **WHEN** `PROMPTS_UPSERT` reports partial success or partial failure
- **THEN** the system MUST NOT overwrite the full cache with incomplete prompt data
- **AND** the system invalidates the user cache or marks it unusable for the next load

### Requirement: Logout and user switching clear prompt state
The system SHALL prevent prompt state from one user being displayed or reused after logout or user switching.

#### Scenario: User logs out
- **WHEN** the authenticated user logs out
- **THEN** the UI clears `allPrompts.value`
- **AND** prompt consumers MUST NOT continue using that user's in-memory prompt state

#### Scenario: Different user logs in
- **WHEN** a new authenticated user id replaces the previous user id
- **THEN** the prompt bootstrap logic loads prompts for the new user
- **AND** the system MUST NOT show prompt content from the previous user

### Requirement: Prompt consumers use unified cached source
The system SHALL align feature prompt consumers with the unified prompt cache path.

#### Scenario: Writing templates are requested
- **WHEN** a writing job requests templates
- **THEN** the system loads writing prompts through the cache-aware unified prompt handler or already-bootstraped unified prompt state
- **AND** stale feature-local memory cache MUST NOT override newly saved prompt content

#### Scenario: Prompt changes are saved before feature use
- **WHEN** a user saves a prompt and then immediately uses a feature that consumes that prompt
- **THEN** the feature uses the saved prompt content without requiring extension reload
