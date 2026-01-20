# 🔒 Firestore Security Rules - X51LABS-72

## Security Enhancements Implemented

**Date**: January 19, 2026  
**Ticket**: X51LABS-72  
**Status**: ✅ IMPLEMENTED

### Changes Made

#### 1. Size Limit Validation
```javascript
function isWithinSizeLimit(data) {
  // Enforce 800KB limit (80% of Firestore's 1MB limit)
  return request.resource.size < 819200;
}
```

**Rationale**:
- Firestore enforces 1MB per document
- We enforce 800KB to provide buffer
- Prevents quota exhaustion attacks
- Aligns with client-side validation in X51LABS-71

#### 2. Backup Structure Validation
```javascript
function isValidBackup() {
  let data = request.resource.data;
  return data.keys().hasAll(['backupId', 'version', 'data']) &&
         data.backupId is string &&
         data.version is string &&
         data.data is map;
}
```

**Required Fields**:
- `backupId`: String (unique identifier)
- `version`: String (schema version)
- `data`: Map (actual backup content)

**Prevents**:
- Malformed backups from corrupting restore
- Missing critical fields
- Type confusion attacks

#### 3. Backup Immutability
```javascript
// UPDATE: Not allowed (backups are immutable)
allow update: if false;
```

**Rationale**:
- Backups should never be modified after creation
- Prevents accidental corruption
- Ensures backup integrity for restore operations

#### 4. Config Validation
```javascript
function isValidConfig() {
  let data = request.resource.data;
  return (data.keys().hasAll(['backupId']) && data.backupId is string) ||
         (data.keys().hasAny(['settings', 'preferences']));
}
```

**Allows**:
- `latestBackup` pointer with `backupId` field
- Settings/preferences configuration

#### 5. Rate Limiting (Placeholder)
```javascript
function isRateLimitOk(uid) {
  // TODO: Implement server-side rate limiting
  return true;
}
```

**Note**: Firestore rules don't support time-based rate limiting directly. For production:
- Implement server-side rate limiting in Cloud Functions
- Or use Firebase App Check quotas
- Or implement client-side throttling

## Security Principles Applied

### Least Privilege
- Users can only access their own data (`isOwner(uid)`)
- No cross-user access
- No public read/write

### Defense in Depth
- Client-side validation (X51LABS-71)
- Server-side validation (Firestore rules)
- Size limits at both levels

### Fail-Safe Defaults
- Deny all by default (`allow read, write: if false`)
- Explicitly allow only necessary operations

### Immutability
- Backups cannot be updated (only create/read/delete)
- Prevents accidental data corruption

## Testing Firestore Rules

### Firebase Console
```bash
# 1. Go to Firebase Console
https://console.firebase.google.com/project/myfcx51/firestore/rules

# 2. Deploy rules
firebase deploy --only firestore:rules

# 3. Test in Rules Playground
# Try these scenarios:
- Create backup as authenticated user (should succeed)
- Create backup as different user (should fail)
- Create backup without required fields (should fail)
- Create backup > 800KB (should fail)
- Update existing backup (should fail)
- Delete own backup (should succeed)
```

### Local Testing with Firebase Emulator
```bash
# Install emulator
npm install -g firebase-tools
firebase init emulators

# Start emulator
firebase emulators:start --only firestore

# Run tests
npm run test:firestore
```

## Deployment Checklist

- [x] Rules updated in `firestore.rules`
- [x] Size limits aligned with client code (X51LABS-71)
- [x] Backup validation implemented
- [ ] Deploy to Firebase (`firebase deploy --only firestore:rules`)
- [ ] Test in production with actual backup/restore
- [ ] Monitor Firestore usage dashboard for anomalies
- [ ] Document rules for team

## Known Limitations

### 1. No Time-Based Rate Limiting
**Issue**: Firestore rules can't check "last backup created time"  
**Mitigation**: Implement in Cloud Functions or client-side throttling  
**Follow-up**: Add Cloud Function for rate limiting if abuse detected

### 2. Size Check is Approximate
**Issue**: `request.resource.size` includes metadata overhead  
**Mitigation**: Enforce 800KB (20% buffer)  
**Note**: Actual document may be slightly larger

### 3. No Field-Level Granularity
**Issue**: Can't validate specific fields within `backup.data`  
**Mitigation**: Trust client-side validation (X51LABS-71)  
**Risk**: Low (user can only corrupt their own data)

## Future Enhancements

### Phase 2: Rate Limiting
```javascript
// Cloud Function approach
exports.createBackup = functions.https.onCall(async (data, context) => {
  const uid = context.auth.uid;
  const lastBackup = await getLastBackupTime(uid);
  const now = Date.now();
  
  if (now - lastBackup < 60000) { // 1 minute
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Rate limit: Max 1 backup per minute'
    );
  }
  
  // Create backup via Firestore
});
```

### Phase 3: Audit Logging
```javascript
// Log all backup operations
match /audit/{auditId} {
  allow read: if isAdmin();
  allow write: if false; // Only Cloud Functions can write
}
```

### Phase 4: Firebase App Check
```javascript
// Require App Check attestation
function isValidAppCheckToken() {
  return request.auth.token.firebase.sign_in_provider == 'custom' &&
         request.auth.token.app_check_token != null;
}
```

## Related Tickets
- **X51LABS-69**: Removed hardcoded credentials
- **X51LABS-71**: Fixed size check timing (client-side)
- **X51LABS-72**: Tightened Firestore rules (server-side)

## Rollback Plan
If rules cause issues:
```bash
# Revert to previous rules
git checkout HEAD~1 firestore.rules
firebase deploy --only firestore:rules

# Or use Firebase Console to revert to previous version
```

---
**Status**: ✅ IMPLEMENTED  
**Next**: Deploy to Firebase and test
