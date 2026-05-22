# Assistant8 Architecture Overview

This document describes the runtime architecture and scope boundaries of the Assistant8 Chrome Extension (Manifest V3).

## Scope Boundaries

Assistant8 is designed around three product domains:

- AI workflow orchestration: provider routing, prompt execution, context-menu analysis, and writing/research assistants.
- Finance operations: portfolio/watchlist management, market-data refresh jobs, and net-worth aggregation.
- User data platform: Supabase auth, persistence, chat history, settings, and audit/error records.

The extension does not use local browser storage as a permanent business datastore. Durable user data is persisted in Supabase.

## High-Level Architecture

```mermaid
flowchart TB
  subgraph Browser[Chrome Browser]
    UI[Side Panel UI\nPreact App]
    CS1[Content Script\nChatGPT]
    CS2[Content Script\nGemini]
    CS3[Content Script\nClaude]
  end

  subgraph SW[Background Service Worker\nDomain Middleware]
    Router[Message Router]
    Handlers[Domain Handlers\nportfolio, watchlist, auth, history, settings, journal]
    Queue[Prompt Queue / Job Queue\nretry + serialization]
    Alarms[Scheduled Jobs\nprice updates, cleanup, session checks]
  end

  subgraph Data[Supabase Cloud]
    Auth[Auth]
    DB[(PostgreSQL + RLS)]
  end

  subgraph Providers[External Providers]
    LLM[ChatGPT / Gemini / Claude]
    Market[SSI / VPS / Gold / Crypto APIs]
  end

  UI <--> Router
  CS1 <--> Router
  CS2 <--> Router
  CS3 <--> Router

  Router --> Handlers
  Handlers --> Queue
  Alarms --> Handlers

  Handlers <--> Auth
  Handlers <--> DB

  Queue --> LLM
  Handlers --> Market
```

## Core Runtime Flow

1. UI or content scripts send typed messages to the background service worker.
2. The message router dispatches requests to domain handlers.
3. Handlers enforce auth/session requirements and validate payload contracts.
4. Prompt and automation work is serialized via queue services to avoid tab/DOM race conditions.
5. Durable records are persisted in Supabase with user-level isolation through RLS.
6. Alarm-driven jobs execute periodic maintenance and market refresh tasks.

## Design Principles

- MV3-safe lifecycle: listeners are registered synchronously at top level.
- Stateless background processing: requests are independent and recoverable.
- Durable data in Supabase: no permanent business data in local storage.
- Contract-first messaging: shared message schema for cross-context consistency.
- Failure tolerance: retry/backoff for transient provider/network errors.
