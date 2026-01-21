# 📚 AI Coding Agent Documentation Index

Complete guide for AI agents working on this Chrome MV3 extension project.

## 🎯 Start Here

1. **[copilot-instructions.md](copilot-instructions.md)** ← **START HERE**
   - Project overview (3 features + retrospective system)
   - MV3 architecture constraints
   - Core patterns and conventions
   - Build commands and deployment
   - For: Understanding the project's purpose and design

2. **[JIRA-WORKFLOW-GUIDE.md](JIRA-WORKFLOW-GUIDE.md)** ← **BEFORE CODING**
   - 6-step Jira-driven workflow
   - How to structure work per ticket
   - Security & quality gates
   - Jira comment best practices
   - For: Executing tickets with full traceability

3. **[task-breakdown-prompt.md](task-breakdown-prompt.md)** ← **FOR PLANNING**
   - Breaking down large tasks into subtasks
   - Each subtask: 2-4 hours, actionable
   - Acceptance criteria and checklists
   - Dependency mapping
   - For: Planning multi-day work

---

## 📋 Workflow Documentation

### Execution Examples
- **[X51LABS-59-WORKFLOW-SUMMARY.md](X51LABS-59-WORKFLOW-SUMMARY.md)**
  - Real example: Bug fix for SSI realtime provider
  - Shows all 6 workflow steps executed
  - Includes actual code changes, build output, Jira comment
  - Reference for how to structure your work

### Prompts (for Humans to use with AI agents)
- **[prompts/jira-ticket-workflow.prompt.md](prompts/jira-ticket-workflow.prompt.md)**
  - The core 6-step workflow as a prompt
  - Use this when asking AI agent to work on a ticket
  - Ensures full traceability and quality

- **[prompts/breakdown-tasks.prompt.md](prompts/breakdown-tasks.prompt.md)**
  - Template for breaking down tasks into subtasks
  - Each subtask: 2-4h, with acceptance criteria
  - For planning work that spans multiple days

---

## 🏗️ Architecture & Implementation

### Core Architecture Document
- **[copilot-instructions.md](copilot-instructions.md)** (Vietnamese + English)
  - Project goals: Portfolio, English Learning, Notes, Error Tracking
  - MV3 critical constraints
  - Message-based communication patterns
  - Storage & state management
  - Key files and their responsibilities
  - Code patterns and conventions

### Detailed Guides
- **[instructions/service-worker.instructions.md](instructions/service-worker.instructions.md)**
  - Service Worker specific rules
  - Listener registration patterns
  - State management requirements

- **[instructions/content-scripts.instructions.md](instructions/content-scripts.instructions.md)**
  - Content script best practices
  - DOM selectors for ChatGPT
  - Message passing

- **[instructions/manifest.instructions.md](instructions/manifest.instructions.md)**
  - Manifest.json configuration
  - Permissions and security

- **[instructions/network-rules.instructions.md](instructions/network-rules.instructions.md)**
  - Network requests and API calls
  - Cross-origin policies

- **[instructions/webstore-compliance.instructions.md](instructions/webstore-compliance.instructions.md)**
  - Chrome Web Store requirements
  - Privacy and security policies

---

## 🚀 Quick Reference

### For First-Time Setup
1. Read: [copilot-instructions.md](copilot-instructions.md) (Project overview)
2. Build: `npm run build`
3. Load in Chrome: `chrome://extensions` → Load unpacked → `dist/`

### For Starting a New Ticket
1. Read: [JIRA-WORKFLOW-GUIDE.md](JIRA-WORKFLOW-GUIDE.md)
2. Follow 6 steps (Step 1: fetch ticket, Step 2: understand code, etc.)
3. Post Jira comment with implementation details

### For Planning Large Feature
1. Read: [task-breakdown-prompt.md](task-breakdown-prompt.md)
2. Break into subtasks (2-4h each)
3. Define acceptance criteria for each
4. Schedule dependencies correctly

### For Debugging Issues
1. Check: Service Worker logs (chrome://extensions → Details → Service Worker)
2. Check: UI logs (right-click extension → Inspect → DevTools)
3. Check: Chrome DevTools → Application → Storage → Local Storage

---

## 📊 Project Structure

```
.github/
├── copilot-instructions.md          ← Core project guidelines
├── JIRA-WORKFLOW-GUIDE.md           ← Workflow & best practices
├── X51LABS-59-WORKFLOW-SUMMARY.md   ← Example execution
├── task-breakdown-prompt.md         ← Task planning template
├── prompts/
│   ├── jira-ticket-workflow.prompt.md    (6-step workflow)
│   ├── breakdown-tasks.prompt.md         (task breakdown)
│   └── solution-fit.md
├── instructions/
│   ├── service-worker.instructions.md
│   ├── content-scripts.instructions.md
│   ├── manifest.instructions.md
│   ├── network-rules.instructions.md
│   └── webstore-compliance.instructions.md
└── README.md (this file)
```

---

## 🎓 Learning Path for AI Agents

### Level 1: Understand the Project (30 min)
- [ ] Read [copilot-instructions.md](copilot-instructions.md)
- [ ] Understand 3 features: Portfolio, English Learning, Notes
- [ ] Understand Retrospective system for error tracking
- [ ] Know critical MV3 constraints

### Level 2: Understand the Workflow (30 min)
- [ ] Read [JIRA-WORKFLOW-GUIDE.md](JIRA-WORKFLOW-GUIDE.md)
- [ ] Review [X51LABS-59-WORKFLOW-SUMMARY.md](X51LABS-59-WORKFLOW-SUMMARY.md)
- [ ] Understand 6-step process
- [ ] Know what goes in Jira comment

### Level 3: Ready for Tickets (15 min)
- [ ] Know how to break tasks down
- [ ] Understand acceptance criteria format
- [ ] Know build commands
- [ ] Ready to execute tickets

### Level 4: Advanced (on-demand)
- [ ] Refer to specific `.instructions.md` files as needed
- [ ] Review code patterns in copilot-instructions
- [ ] Check examples in old Jira comments

---

## 📞 Common Questions

### Q: How do I start working on a ticket?
**A**: Read [JIRA-WORKFLOW-GUIDE.md](JIRA-WORKFLOW-GUIDE.md), follow 6 steps, post detailed Jira comment.

### Q: How do I break down large work?
**A**: Read [task-breakdown-prompt.md](task-breakdown-prompt.md), create subtasks with acceptance criteria.

### Q: What are the critical MV3 constraints?
**A**: Read "Ràng buộc Kiến trúc MV3" in [copilot-instructions.md](copilot-instructions.md)

### Q: How do I debug Service Worker issues?
**A**: Chrome DevTools → chrome://extensions → Details → Service Worker logs

### Q: What goes in a Jira comment?
**A**: See example in [X51LABS-59-WORKFLOW-SUMMARY.md](X51LABS-59-WORKFLOW-SUMMARY.md) or template in [JIRA-WORKFLOW-GUIDE.md](JIRA-WORKFLOW-GUIDE.md)

### Q: How do I know if code is "done"?
**A**: All acceptance criteria checklist items pass + Jira comment posted + build successful

---

## 🔗 Key Links

- **Repository**: ChatGPT Assistant Chrome Extension
- **Jira Project**: [X51LABS (AI-Platform)](https://x51labs.atlassian.net/browse/X51LABS)
- **Documentation**: This folder (`.github/`)
- **Build Output**: `dist/` folder (load in Chrome)

---

## 📈 Version History

| Date | Change |
|------|--------|
| 2026-01-21 | Initial AI agent documentation suite created |
| 2026-01-21 | Added 6-step Jira workflow + task breakdown |
| 2026-01-21 | Added X51LABS-59 example execution |
| 2026-01-21 | Vietnamese translation of copilot-instructions |

---

## ✅ Checklist for AI Agents

Before starting any ticket:
- [ ] Read copilot-instructions.md (understand project)
- [ ] Read JIRA-WORKFLOW-GUIDE.md (understand workflow)
- [ ] Fetch ticket details (all fields)
- [ ] Understand AC clearly (no ambiguity)
- [ ] Map impacted files/modules
- [ ] Propose changes (Step 3)
- [ ] Security review (Step 4)
- [ ] Implement + test (Step 5)
- [ ] Post Jira comment (Step 6)
- [ ] Ready for review

---

**Last Updated**: January 21, 2026  
**Status**: Production Ready for AI Agent Usage  
**Maintained By**: Engineering Team
