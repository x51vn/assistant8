# Jira Tickets Created - X51LABS-157 Architecture Redesign

**Date Created**: January 24, 2026  
**Project**: XST (X51 Simple Trade)  
**Status**: 📋 Ready for Implementation  

---

## 📊 Summary

| Type | Count | Details |
|------|-------|---------|
| **Epic** | 1 | XST-682 - Architecture Redesign Epic |
| **Phase 1 Tasks** | 2 | XST-683, XST-684 |
| **Phase 2 Tasks** | 2 | XST-685, XST-686 |
| **Phase 3 Tasks** | 2 | XST-687, XST-688 |
| **Total Tickets** | **7** | Ready to implement |

---

## 🎯 Epic Ticket

### **[XST-682](https://x51labs.atlassian.net/browse/XST-682) - X51LABS-157: Architecture Redesign - Eliminate Race Conditions with Proactive Signaling (Epic)**

**Priority**: High  
**Labels**: architecture, content-script, performance, race-condition, refactor  

**Description**:
- Problem: Current polling-based approach creates race conditions (3-10s delay, 10+ retries)
- Solution: Implement proactive signaling architecture
- Expected: 95% faster, 90% fewer retries, zero race conditions

---

## 📋 Phase 1: Content Script → Background Signaling

### **[XST-683](https://x51labs.atlassian.net/browse/XST-683) - X51LABS-157-001: Create Content Script Ready Handler**

**Priority**: High  
**Type**: Task  
**Phase**: 1  
**Estimated**: 1-2 hours  
**Labels**: phase-1, content-script, handler, registry  

**Deliverables**:
1. New file: `src/background/handlers/contentScriptReady.js`
2. Global registry to track ready content scripts
3. Handler for `content_script_ready` messages
4. Utility functions: `isContentScriptReady()`, `getContentScriptStatus()`, `clearContentScriptStatus()`

**Key Functions**:
```javascript
export const contentScriptReadyRegistry = new Map();
registerHandler('content_script_ready', async (message) => {...});
export function isContentScriptReady(tabId) {...}
export function getContentScriptStatus(tabId) {...}
export function clearContentScriptStatus(tabId) {...}
```

**Acceptance Criteria**:
- ✅ Handler registered in messageRouter
- ✅ Registry tracks all ready content scripts
- ✅ Acknowledges messages correctly
- ✅ Build successful, no errors

---

### **[XST-684](https://x51labs.atlassian.net/browse/XST-684) - X51LABS-157-002: Add Auto-Signal in Content Script**

**Priority**: High  
**Type**: Task  
**Phase**: 1  
**Estimated**: 1 hour  
**Labels**: phase-1, content-script, signaling  

**Deliverables**:
1. Modify: `src/content.js` (add at end)
2. Auto-signal that runs 100ms after message listener ready
3. Sends: URL, hostname, timestamp, markerSet status

**Key Code**:
```javascript
(async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
  chrome.runtime.sendMessage({
    action: 'content_script_ready',
    url: location.href,
    hostname: location.hostname,
    timestamp: Date.now(),
    markerSet: window.__ChatGPTAssistantReady
  });
})();
```

**Acceptance Criteria**:
- ✅ Signal runs 100ms after module load
- ✅ Includes URL, hostname, timestamp
- ✅ Non-blocking (error handled)
- ✅ Logs success message
- ✅ Works on tab load and refresh

---

## 📋 Phase 2: Registry-Based Ready Detection

### **[XST-685](https://x51labs.atlassian.net/browse/XST-685) - X51LABS-157-003: Refactor waitForTabReady with Registry Lookup**

**Priority**: High  
**Type**: Task  
**Phase**: 2  
**Estimated**: 2-3 hours  
**Labels**: phase-2, refactor, performance, critical  

**Deliverables**:
1. Modify: `src/chatgptSession.js` - Rewrite `waitForTabReady()`
2. Replace polling loop with registry check + fallback
3. Return source info for debugging
4. Detailed error messages

**Performance Targets**:
- Content script already ready: **<10ms**
- Content script not yet registered: **100-500ms**
- Content script lost signal: **1-2s max**
- Timeout case: **Exact timeout value**

**Key Implementation**:
1. Check registry first (instant O(1))
2. Wait for registry update (event-driven)
3. Fallback to ping (500ms delay, 1-2 retries max)
4. Race: whichever succeeds first
5. Return source for debugging

**Acceptance Criteria**:
- ✅ Instant return if already registered
- ✅ Event-driven (no polling loops)
- ✅ Correct timeout handling
- ✅ Returns source info
- ✅ All performance targets met
- ✅ Works with SW restart

---

### **[XST-686](https://x51labs.atlassian.net/browse/XST-686) - X51LABS-157-004: Add Tab Close Listener for Cleanup**

**Priority**: Medium  
**Type**: Task  
**Phase**: 2  
**Estimated**: 1 hour  
**Labels**: phase-2, cleanup, memory-management  

**Deliverables**:
1. Modify: `src/background/index.js`
2. Add `chrome.tabs.onRemoved.addListener()`
3. Clear registry entry on tab close
4. Log cleanup action

**Key Code**:
```javascript
chrome.tabs.onRemoved.addListener((tabId) => {
  clearContentScriptStatus(tabId);
  logger.info('Tab closed, cleared content script status', { tabId });
});
```

**Acceptance Criteria**:
- ✅ Listener registered at top-level
- ✅ Clears registry on close
- ✅ No memory leaks
- ✅ Works with multiple tabs
- ✅ Handles edge cases

---

## 📋 Phase 3: Resilience & Testing

### **[XST-687](https://x51labs.atlassian.net/browse/XST-687) - X51LABS-157-005: Implement Service Worker Restart Re-initialization**

**Priority**: Medium  
**Type**: Task  
**Phase**: 3  
**Estimated**: 1-2 hours  
**Labels**: phase-3, sw-lifecycle, resilience  

**Deliverables**:
1. Add `reinitializeContentScriptRegistry()` function
2. Add `initializeOnStartup()` export
3. Modify: `src/background/index.js` to call on startup
4. Query all ChatGPT tabs and ping them
5. Repopulate registry with live tabs

**Key Implementation**:
- Called 1000ms after Service Worker start
- Queries all `https://chatgpt.com/*` tabs
- Pings each to verify content script alive
- Repopulates registry
- Handles ping failures gracefully

**Acceptance Criteria**:
- ✅ Re-init called on SW startup
- ✅ Queries all ChatGPT tabs
- ✅ Pings verify content script alive
- ✅ Registry repopulated correctly
- ✅ Handles failures gracefully
- ✅ Doesn't block message routing

---

### **[XST-688](https://x51labs.atlassian.net/browse/XST-688) - X51LABS-157-006: Integration Testing & Validation**

**Priority**: High  
**Type**: Task  
**Phase**: 3  
**Estimated**: 3-4 hours  
**Labels**: phase-3, testing, validation, qa  

**Test Scenarios** (6 total):
1. ✅ Fresh Tab Load (100-500ms)
2. ✅ Existing Tab (<10ms)
3. ✅ Multiple Tabs (1-3s)
4. ✅ Tab Close (cleanup verification)
5. ✅ Service Worker Restart (registry re-init)
6. ✅ Content Script Failure (error handling)

**Performance Benchmarks**:
| Scenario | Before | After | Target |
|----------|--------|-------|--------|
| Fresh tab | 3-10s | 100-500ms | ✅ |
| Existing tab | 2-5s | <10ms | ✅ |
| Multiple tabs | 15-30s | 1-3s | ✅ |
| Registry lookup | N/A | <1ms | ✅ |

**Deliverables**:
1. Create: `tests/integration/contentScriptReady.test.js`
2. All 6 scenarios automated
3. Performance assertions
4. Memory leak detection
5. Documentation updated

**Acceptance Criteria**:
- ✅ All 6 scenarios pass
- ✅ No race conditions detected
- ✅ All performance targets met
- ✅ No memory leaks
- ✅ Build successful
- ✅ Ready for production

---

## 🚀 Implementation Timeline

```
Day 1 (Phase 1) - 2 hours
├─ XST-683: Create Content Script Ready Handler (1h)
├─ XST-684: Add Auto-Signal in Content Script (1h)
└─ Build & Test

Day 2 (Phase 2) - 3 hours
├─ XST-685: Refactor waitForTabReady (2h)
├─ XST-686: Add Tab Close Listener (1h)
└─ Build & Test

Day 3 (Phase 3) - 4 hours
├─ XST-687: Service Worker Re-init (1.5h)
├─ XST-688: Integration Testing (2.5h)
└─ Final QA & Merge

Total: ~9 hours
```

---

## 📈 Expected Outcomes

### Performance Improvements
- ⚡ **95% faster** ready detection (3-10s → 100-500ms)
- 📉 **90% fewer** retry attempts (10+ → 0-1)
- 📉 **95% fewer** network messages
- 💾 **60% memory savings** per tab

### Quality Improvements
- ✅ **Zero** race conditions
- 🔒 **Robust** Service Worker restart handling
- 🧹 **Clean** memory management
- 📊 **Clear** protocol for communication
- 📝 **Detailed** logging for debugging

### User Experience
- ⚡ Fast, responsive extension
- 🎯 No timeouts or flaky behavior
- 💪 Reliable across scenarios
- 🔍 Better error messages

---

## 🔗 Related Documentation

- **Architecture Design**: [ARCHITECTURE_REDESIGN.md](./ARCHITECTURE_REDESIGN.md)
- **Implementation Checklist**: [X51LABS_157_IMPLEMENTATION_CHECKLIST.md](./X51LABS_157_IMPLEMENTATION_CHECKLIST.md)
- **Quick Fix Guide**: [CONTENT_SCRIPT_FIX_GUIDE.md](./CONTENT_SCRIPT_FIX_GUIDE.md)
- **Main Architecture**: [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)

---

## ✅ Sign-Off

- **Created By**: GitHub Copilot
- **Date**: January 24, 2026
- **Status**: 📋 Ready for Implementation
- **Next Step**: Begin Phase 1 with XST-683 and XST-684

**Jira Project**: https://x51labs.atlassian.net/browse/XST  
**Epic Link**: https://x51labs.atlassian.net/browse/XST-682
