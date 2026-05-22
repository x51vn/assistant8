# 📚 AI Agent Documentation

Quick reference for AI agents working on this Chrome MV3 extension.

## 🎯 Key Files

| File | Purpose |
|------|---------|
| [copilot-instructions.md](copilot-instructions.md) | **START HERE** - Project architecture & patterns |
| [instructions/](instructions/) | Auto-applied rules for specific file types |
| [prompts/](prompts/) | Workflow prompts for common tasks |

## 📋 Available Prompts

| Prompt | When to Use |
|--------|-------------|
| `jira-ticket-workflow` | Implement a Jira ticket end-to-end |
| `create-ticket` | Create new Jira ticket from spec |
| `breakdown-tasks` | Split big task into 2-4h tickets |
| `commit-and-push` | Branch, commit, push with conventions |
| `solution-fit` | Propose solution with trade-offs |

## 🔧 Instructions (Auto-Applied)

| File | Applies To |
|------|------------|
| `00-principle.instruction.md` | All files - core principles |
| `mv3-extension.instructions.md` | `src/**` - MV3 rules |
| `webstore-compliance.instructions.md` | `docs/**` - privacy/compliance |

## 🚀 Quick Commands

```bash
npm run build       # Build extension
npm run build:watch # Watch mode
npm run test:unit   # Unit tests
npm run test:e2e    # E2E tests
```

## 📂 Project Structure

```
src/
├── background/     # Service Worker (middleware)
├── ui-preact/      # UI components
├── shared/         # Message schema, utils
└── content.js      # ChatGPT DOM automation
```

See [copilot-instructions.md](copilot-instructions.md) for full architecture.
