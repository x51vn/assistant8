# X51LABS-157 Implementation Checklist

**Epic**: [XST-682](https://x51labs.atlassian.net/browse/XST-682)  
**Status**: 📋 Ready for Phase 1  
**Started**: January 24, 2026  
**Target Completion**: January 26, 2026  

---

## 📋 Phase 1: Content Script → Background Signaling

### Task 1: Create Content Script Ready Handler
**Ticket**: [XST-683](https://x51labs.atlassian.net/browse/XST-683)  
**Status**: 🔄 Not Started

- [ ] Create `src/background/handlers/contentScriptReady.js`
  - [ ] Define `contentScriptReadyRegistry` Map
  - [ ] Define `ReadyStatus` interface
  - [ ] Implement `content_script_ready` handler
  - [ ] Register handler via `registerHandler()`
  - [ ] Implement `isContentScriptReady(tabId)`
  - [ ] Implement `getContentScriptStatus(tabId)`
  - [ ] Implement `clearContentScriptStatus(tabId)`
  - [ ] Add JSDoc comments

- [ ] Register handler in `src/background/handlers/index.js`
  - [ ] Import contentScriptReady module
  - [ ] Verify handler auto-registers

- [ ] Testing
  - [ ] Build: `npm run build`
  - [ ] Check for TypeScript errors
  - [ ] Verify handler registration

### Task 2: Add Auto-Signal in Content Script
**Ticket**: [XST-684](https://x51labs.atlassian.net/browse/XST-684)  
**Status**: 🔄 Not Started

- [ ] Add auto-signal code to `src/content.js` (at end of file)
  - [ ] IIFE that waits 100ms after load
  - [ ] Sends `content_script_ready` message
  - [ ] Includes URL, hostname, timestamp, markerSet
  - [ ] Handles errors gracefully
  - [ ] Logs success/failure

- [ ] Testing
  - [ ] Build: `npm run build`
  - [ ] Reload extension: `chrome://extensions → Reload`
  - [ ] Open new ChatGPT tab
  - [ ] Check console: `[Content] ✅ Ready signal acknowledged`
  - [ ] Verify background logs: tab registered in registry

- [ ] Commit & Push
  - [ ] Commit message: `feat(X51LABS-157): Add content script ready signaling`
  - [ ] Reference ticket in commit
  - [ ] Push to feature branch

---

## 📋 Phase 2: Registry-Based Ready Detection

### Task 3: Refactor waitForTabReady with Registry
**Ticket**: [XST-685](https://x51labs.atlassian.net/browse/XST-685)  
**Status**: 🔄 Not Started

- [ ] Update `src/chatgptSession.js`
  - [ ] Import registry functions from contentScriptReady
  - [ ] Replace polling loop with registry check
  - [ ] Add registry wait (event-driven)
  - [ ] Add ping fallback (500ms delay)
  - [ ] Use Promise.race() for fast-path
  - [ ] Return source info ('registry' vs 'ping')
  - [ ] Add detailed diagnostics

- [ ] Performance optimization
  - [ ] Instant return if already registered
  - [ ] <10ms lookup time
  - [ ] 100-500ms wait for new tab
  - [ ] Timeout matches input parameter

- [ ] Testing
  - [ ] Build: `npm run build`
  - [ ] Test 1: Existing tab (should be instant)
  - [ ] Test 2: New tab (should be 100-500ms)
  - [ ] Test 3: Timeout case (should return error)
  - [ ] Verify logs show source ('registry' or 'ping')

- [ ] Commit & Push
  - [ ] Commit message: `refactor(X51LABS-157): Use registry for instant ready detection`
  - [ ] Reference ticket
  - [ ] Push to feature branch

### Task 4: Add Tab Close Listener
**Ticket**: [XST-686](https://x51labs.atlassian.net/browse/XST-686)  
**Status**: 🔄 Not Started

- [ ] Update `src/background/index.js`
  - [ ] Add `chrome.tabs.onRemoved.addListener()`
  - [ ] Call `clearContentScriptStatus(tabId)`
  - [ ] Log cleanup action
  - [ ] Handle edge cases

- [ ] Testing
  - [ ] Build: `npm run build`
  - [ ] Open 3 ChatGPT tabs
  - [ ] Check registry size (should be 3)
  - [ ] Close first tab
  - [ ] Check registry size (should be 2)
  - [ ] Close all tabs
  - [ ] Check registry size (should be 0)
  - [ ] Verify logs show cleanup

- [ ] Commit & Push
  - [ ] Commit message: `feat(X51LABS-157): Add tab close cleanup listener`
  - [ ] Reference ticket
  - [ ] Push to feature branch

---

## 📋 Phase 3: Resilience & Testing

### Task 5: Service Worker Restart Re-init
**Ticket**: [XST-687](https://x51labs.atlassian.net/browse/XST-687)  
**Status**: 🔄 Not Started

- [ ] Update `src/background/handlers/contentScriptReady.js`
  - [ ] Add `reinitializeContentScriptRegistry()` function
  - [ ] Query all ChatGPT tabs
  - [ ] Ping each tab to verify content script alive
  - [ ] Repopulate registry
  - [ ] Add `initializeOnStartup()` export
  - [ ] Add logging for each tab

- [ ] Update `src/background/index.js`
  - [ ] Import `initializeOnStartup`
  - [ ] Call on Service Worker startup (1000ms delay)
  - [ ] Handle errors gracefully

- [ ] Testing
  - [ ] Build: `npm run build`
  - [ ] Open ChatGPT tab
  - [ ] Reload extension: `chrome://extensions → Reload`
  - [ ] Check registry: should be repopulated
  - [ ] Verify no "Receiving end does not exist" errors
  - [ ] Open multiple tabs, reload, verify all re-registered

- [ ] Commit & Push
  - [ ] Commit message: `feat(X51LABS-157): Add Service Worker restart re-initialization`
  - [ ] Reference ticket
  - [ ] Push to feature branch

### Task 6: Integration Testing & Validation
**Ticket**: [XST-688](https://x51labs.atlassian.net/browse/XST-688)  
**Status**: 🔄 Not Started

- [ ] **Test Scenario 1: Fresh Tab Load**
  - [ ] Reload extension
  - [ ] Open new ChatGPT tab
  - [ ] Wait 500ms
  - [ ] Try to send prompt
  - [ ] ✅ Result: Registry updated within 100-500ms, prompt sent successfully

- [ ] **Test Scenario 2: Existing Tab**
  - [ ] Open ChatGPT tab
  - [ ] Reload extension
  - [ ] Try to send prompt immediately
  - [ ] ✅ Result: Registry re-initialized within 1s, prompt sent

- [ ] **Test Scenario 3: Multiple Tabs**
  - [ ] Open 3 ChatGPT tabs
  - [ ] Send prompt to each simultaneously
  - [ ] ✅ Result: All 3 succeed, registry has 3 entries

- [ ] **Test Scenario 4: Tab Close**
  - [ ] Open ChatGPT tab
  - [ ] Send prompt (success)
  - [ ] Close tab
  - [ ] Open new tab
  - [ ] Send prompt (success)
  - [ ] ✅ Result: Registry cleaned up on close, new tab works

- [ ] **Test Scenario 5: Service Worker Restart**
  - [ ] Open ChatGPT tab
  - [ ] Send prompt (success)
  - [ ] Kill background: `chrome://serviceworkers → Unregister`
  - [ ] Try to send prompt again
  - [ ] ✅ Result: SW restarts, re-inits registry, second prompt succeeds

- [ ] **Test Scenario 6: Content Script Failure**
  - [ ] Disable content script (remove from manifest temporarily)
  - [ ] Open ChatGPT tab
  - [ ] Try to send prompt
  - [ ] ✅ Result: Registry signal never arrives, fallback to ping, clear error

- [ ] **Performance Benchmarks**
  - [ ] Fresh tab: 100-500ms (target ✅)
  - [ ] Existing tab: <10ms (target ✅)
  - [ ] Multiple tabs: 1-3s for 3 tabs (target ✅)
  - [ ] Registry lookup: <1ms (target ✅)

- [ ] **Memory & Leaks**
  - [ ] Monitor registry size across 10+ open/close cycles
  - [ ] No unbounded growth
  - [ ] Cleanup works correctly

- [ ] Create test file: `tests/integration/contentScriptReady.test.js`
  - [ ] Auto tests for each scenario
  - [ ] Performance assertions
  - [ ] Memory monitoring

- [ ] Commit & Push
  - [ ] Commit message: `test(X51LABS-157): Add comprehensive integration tests`
  - [ ] Reference ticket
  - [ ] Push to feature branch

---

## 🔄 Final Integration

- [ ] Merge all Phase branches to develop
- [ ] Run full test suite
- [ ] Build production: `npm run build`
- [ ] Verify all tickets marked as Done
- [ ] Create release notes
- [ ] Deploy to production

---

## 📊 Progress Tracking

### Phase 1 Progress
| Task | Status | Estimated | Actual | Notes |
|------|--------|-----------|--------|-------|
| XST-683 | ⬜ Not Started | 1h | | |
| XST-684 | ⬜ Not Started | 1h | | |
| **Phase 1 Total** | **⬜** | **2h** | | |

### Phase 2 Progress
| Task | Status | Estimated | Actual | Notes |
|------|--------|-----------|--------|-------|
| XST-685 | ⬜ Not Started | 2h | | |
| XST-686 | ⬜ Not Started | 1h | | |
| **Phase 2 Total** | **⬜** | **3h** | | |

### Phase 3 Progress
| Task | Status | Estimated | Actual | Notes |
|------|--------|-----------|--------|-------|
| XST-687 | ⬜ Not Started | 1h | | |
| XST-688 | ⬜ Not Started | 3h | | |
| **Phase 3 Total** | **⬜** | **4h** | | |

### Overall
| Phase | Status | Estimated | Actual | Complete | Notes |
|-------|--------|-----------|--------|----------|-------|
| Phase 1 | ⬜ | 2h | | 0% | |
| Phase 2 | ⬜ | 3h | | 0% | |
| Phase 3 | ⬜ | 4h | | 0% | |
| **TOTAL** | **⬜** | **9h** | | **0%** | |

---

## 📝 Notes

- Keep each phase independent and testable
- Build and test after each task
- Document any issues/blockers
- Update this checklist frequently
- Update Jira tickets with progress

---

**Created**: January 24, 2026  
**Last Updated**: January 24, 2026  
**Status**: Ready to begin Phase 1
