## ADDED Requirements

### Requirement: Shared progressbar component
The system SHALL provide a single shared UI component for operational progressbar rendering in the Preact UI.

#### Scenario: Determinate progressbar is rendered through the shared component
- **WHEN** a UI surface needs to show finite progress for an operation or quota
- **THEN** the surface SHALL render the shared progressbar component instead of local track/fill progressbar markup

#### Scenario: Indeterminate progressbar is rendered through the shared component
- **WHEN** a UI surface needs an embedded progressbar but does not have a numeric value
- **THEN** the surface SHALL render the shared progressbar component in indeterminate mode

### Requirement: Progressbar value normalization
The system SHALL normalize progressbar values consistently inside the shared progressbar component.

#### Scenario: Value is within range
- **WHEN** the shared progressbar receives `value` 3 and `max` 6
- **THEN** it SHALL render a 50 percent fill value

#### Scenario: Value is below range
- **WHEN** the shared progressbar receives a negative `value`
- **THEN** it SHALL render a 0 percent fill value

#### Scenario: Value is above range
- **WHEN** the shared progressbar receives a `value` greater than `max`
- **THEN** it SHALL render a 100 percent fill value

#### Scenario: Max is invalid
- **WHEN** the shared progressbar receives a missing, zero, negative, or non-numeric `max`
- **THEN** it SHALL render a safe 0 percent fill value for determinate mode

### Requirement: Progressbar accessibility
The system SHALL apply accessible progressbar semantics consistently through the shared progressbar component.

#### Scenario: Determinate progressbar has ARIA value attributes
- **WHEN** the shared progressbar renders determinate progress
- **THEN** it SHALL include `role="progressbar"`, `aria-valuemin`, `aria-valuemax`, and `aria-valuenow`

#### Scenario: Indeterminate progressbar omits current value
- **WHEN** the shared progressbar renders indeterminate progress
- **THEN** it SHALL include `role="progressbar"` and SHALL omit `aria-valuenow`

#### Scenario: Progressbar has an accessible name
- **WHEN** the shared progressbar is rendered
- **THEN** it SHALL expose an accessible name through visible label text or an ARIA label

### Requirement: Progressbar visual variants
The system SHALL support shared progressbar visual variants without feature-specific progressbar class families.

#### Scenario: Semantic tone is supplied
- **WHEN** a caller supplies a supported progressbar tone
- **THEN** the shared component SHALL apply the matching semantic progressbar styling

#### Scenario: Size is supplied
- **WHEN** a caller supplies a supported progressbar size
- **THEN** the shared component SHALL apply the matching progressbar height and spacing

#### Scenario: Unsupported tone or size is supplied
- **WHEN** a caller supplies an unsupported tone or size
- **THEN** the shared component SHALL fall back to the default progressbar styling

### Requirement: Required surfaces use shared progressbar
The system SHALL migrate existing operational progress indicators to the shared progressbar component.

#### Scenario: Stock research pipeline is running
- **WHEN** the stock research modal displays pipeline progress
- **THEN** it SHALL use the shared progressbar component for the progressbar

#### Scenario: Portfolio evaluation is running
- **WHEN** the portfolio evaluation modal displays per-symbol progress
- **THEN** it SHALL use the shared progressbar component for the progressbar

#### Scenario: Market assessment is running
- **WHEN** the market page displays assessment run progress
- **THEN** it SHALL use the shared progressbar component for the progressbar

#### Scenario: Subscription usage has a finite limit
- **WHEN** the subscription page displays finite usage against a quota
- **THEN** it SHALL use the shared progressbar component for the usage bar

#### Scenario: Password strength is displayed
- **WHEN** a register or change-password form displays password strength
- **THEN** it SHALL use the shared progressbar component for the strength bar

### Requirement: Non-progressbar indicators remain specialized
The system SHALL not force unrelated indicators or data visualizations through the shared progressbar component.

#### Scenario: Toast timeout animation is rendered
- **WHEN** a toast displays its auto-dismiss timeout animation
- **THEN** it SHALL remain a toast-specific animation and SHALL not use the shared progressbar component

#### Scenario: Onboarding step navigation is rendered
- **WHEN** onboarding displays step dots
- **THEN** it SHALL remain a step navigation indicator and SHALL not use the shared progressbar component

#### Scenario: Allocation or market history visualization is rendered
- **WHEN** net-worth allocation, dashboard allocation, or market-regime history bars are rendered
- **THEN** they SHALL remain data visualization components and SHALL not use the shared progressbar component
