## 1. Contract Registry and Validator Engine

- [ ] 1.1 Create `MessageContractRegistry` with request/response schemas for pilot message types.
- [ ] 1.2 Implement `ValidatorEngine` with `validateRequest(type, payload)` and `validateResponse(type, payload)`.
- [ ] 1.3 Add schema version/domain metadata and compatibility modes (`warn-only`, `strict`).
- [ ] 1.4 Add unit tests for header validation, required fields, type checks, enums, and range constraints.

## 2. Ingress Validation Middleware

- [ ] 2.1 Integrate ingress validation middleware into `src/background/messageRouter.js`.
- [ ] 2.2 Validate `v`, `type`, and `correlationId` before handler dispatch.
- [ ] 2.3 Validate payload by contract and return standardized error on invalid input.
- [ ] 2.4 Add warn-only telemetry path for legacy contracts.

## 3. Canonical Error Envelope

- [ ] 3.1 Define canonical error envelope fields and update shared error factory helpers.
- [ ] 3.2 Keep temporary backward-compatible aliases for existing consumers.
- [ ] 3.3 Add tests proving canonical + compatibility responses are both readable during migration.

## 4. DTO and Persistence Mapping

- [ ] 4.1 Introduce request/response DTOs for pilot domains (portfolio, watchlist enrich).
- [ ] 4.2 Add persistence mappers to isolate DB `snake_case` from app `camelCase`.
- [ ] 4.3 Refactor pilot handlers to use DTO + mapper pipeline only.
- [ ] 4.4 Add tests for mapper correctness and conversion edge cases.

## 5. Egress Validation

- [ ] 5.1 Validate response payloads against registry before returning.
- [ ] 5.2 Start with warn-only response validation for migrated pilot domains.
- [ ] 5.3 Switch pilot domains to strict egress validation after mismatch rate is acceptable.

## 6. Content Boundary Convergence

- [ ] 6.1 Define contract-mapped message types for content actions currently using free-form `action` strings.
- [ ] 6.2 Add adapter layer to map legacy content actions into contract messages.
- [ ] 6.3 Migrate selected content flows to the shared contract path and keep compatibility fallback.

## 7. Validation and OpenSpec Compliance

- [ ] 7.1 Run focused unit/integration tests for contract validation and router middleware.
- [ ] 7.2 Run `npm run build` to verify MV3 bundle compatibility.
- [ ] 7.3 Run `npx openspec validate io-contract-layer-standardization --strict --no-interactive`.
