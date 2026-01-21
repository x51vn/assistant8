# 🔐 Firebase Credentials Security Incident & Rotation Guide

## INCIDENT SUMMARY (X51LABS-69)

**Date**: January 19, 2026  
**Severity**: 🔴 CRITICAL P0  
**Status**: FIXED (credentials moved to .env) + ROTATION REQUIRED

### What Happened
Firebase credentials (API key `AIzaSyCj-87I_ixItNqk_GgjUeOKLWkcFVCMT64`) were hardcoded in:
- `src/background.js` lines 12-21
- `src/firebaseService.js` lines 35-43

These files were committed to git, exposing credentials in git history.

### Impact
- API key publicly accessible in git repository
- Anyone with the key can access Firestore database
- Potential for data theft, quota exhaustion, financial damage

### Immediate Actions Taken
1. ✅ Moved credentials to `.env` file (not committed)
2. ✅ Updated `.gitignore` to exclude `.env` files
3. ✅ Created `firebaseConfig.js` helper to load from environment
4. ✅ Updated both `background.js` and `firebaseService.js`
5. ✅ Build verified to pass with new configuration

## 🚨 REQUIRED NEXT STEPS (MANUAL)

### 1. Rotate Firebase API Key (HIGH PRIORITY)

**Firebase Console Steps**:
```
1. Go to https://console.firebase.google.com/
2. Select project "myfcx51"
3. Navigate to Project Settings > General
4. Under "Your apps" > Web app
5. Click "Delete" on old API key
6. Generate NEW API key
7. Update .env file with new key
8. Update Firestore security rules (X51LABS-72)
9. Test extension with new credentials
```

### 2. Audit Firebase Access Logs
- Check for unauthorized access using old API key
- Review Firestore usage metrics for anomalies
- Check Authentication logs for suspicious sign-ins

### 3. Update Production Deployment
```bash
# On production server/CI
cp .env.template .env
# Edit .env with NEW credentials
npm run build
# Deploy updated extension
```

### 4. Revoke Git History (Optional but Recommended)
```bash
# WARNING: This rewrites git history
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch src/background.js src/firebaseService.js' \
  --prune-empty --tag-name-filter cat -- --all

# Force push to remote (coordinate with team first!)
git push origin --force --all
git push origin --force --tags
```

### 5. Team Communication
- Notify all team members about credential rotation
- Ensure everyone updates their local `.env` files
- Document new security procedures

## 📝 New Workflow for Credentials

### For Developers
```bash
# First time setup
cp .env.template .env
# Edit .env with actual credentials (get from team lead)

# Daily development
npm run build  # Vite automatically loads from .env
```

### For CI/CD
```yaml
# GitHub Actions example
env:
  VITE_FIREBASE_API_KEY: ${{ secrets.FIREBASE_API_KEY }}
  VITE_FIREBASE_AUTH_DOMAIN: ${{ secrets.FIREBASE_AUTH_DOMAIN }}
  # ... other secrets
```

### Security Checklist
- [ ] Never commit `.env` files
- [ ] Never log credentials in console
- [ ] Rotate credentials every 90 days
- [ ] Use Firebase security rules to limit access
- [ ] Monitor Firebase usage dashboard
- [ ] Enable 2FA on Firebase console account

## 🔒 Additional Security Measures (Related Tickets)

- **X51LABS-70**: Audit OAuth2 client_id exposure
- **X51LABS-71**: Fix Firestore 1MB size limits
- **X51LABS-72**: Tighten Firestore security rules

## Contact
For questions or access to new credentials, contact:
- Tech Lead: [email protected]
- Security Team: [email protected]

---
**Last Updated**: January 19, 2026  
**Related Ticket**: X51LABS-69
