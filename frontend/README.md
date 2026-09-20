# Smart URL Intelligence Platform — Production Frontend Foundation (Phase 24B)

## Overview

This directory contains the production frontend application foundation for the **Smart URL Intelligence Platform**. The application is designed as a **Technical Infrastructure Console** built with React, TypeScript, Vite, React Router, TanStack Query, and Tailwind CSS.

## Architectural Scope (Phase 24B Foundation)

Phase 24B establishes the architectural scaffold and design-token baseline. It includes:
- **Design Tokens**: High-contrast, restrained slate palette (`#020617` background, slate surfaces, sky/emerald/rose/amber semantic accents, Inter/JetBrains Mono typography).
- **Application Shell**: Responsive sidebar, top header with authentication status indicator, and dynamic routing layout.
- **Centralized API Client**: TypeScript API client leveraging native `fetch` with standardized error normalization (`ApiError`), correlation ID (`X-Request-ID`) propagation, and bearer token injection.
- **Strict Data Integrity**: ZERO fake business data, fake charts, or fabricated analytics. All structural pages present deliberate loading, empty, and error states.
- **Testing Baseline**: Unit tests with Vitest, component tests with React Testing Library, and smoke tests with Playwright.

---

## Authentication Security Model & Limitations

> **CRITICAL SECURITY COMPLIANCE (OWASP & Phase 24A.2 Directive)**:
> 
> 1. **No Browser Storage Credentials**: Storing API keys, JWTs, or session tokens in `localStorage` or `sessionStorage` is **STRICTLY PROHIBITED** to eliminate XSS token theft risks.
> 2. **Development In-Memory Vault**: In Phase 24B, Bearer API keys reside exclusively in React state memory (`AuthContext`). Refreshing the page or closing the tab clears the key.
> 3. **Production Authentication Path**: Full browser authentication will be introduced in future phases after the approval and deployment of a dedicated **Backend-For-Frontend (BFF)** supplying `SameSite=Strict`, `HttpOnly`, `Secure` session cookies.

---

## Technology Stack

- **Framework**: React 18.3+ with TypeScript
- **Build Tool**: Vite 6+
- **Routing**: React Router 7+
- **Server State Management**: TanStack Query 5+
- **Styling**: Tailwind CSS 3.4+ with `clsx` & `tailwind-merge`
- **Icons**: Lucide React
- **Testing**: Vitest, React Testing Library, Playwright

---

## Environment Variables

Copy `.env.example` to `.env`:

```bash
VITE_API_BASE_URL=http://localhost:3000
```

> **Security Note**: `VITE_*` variables are embedded into client bundle outputs at build time. **NEVER** place secret keys, database credentials, or private credentials in `VITE_*` variables.

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
The application will be accessible at `http://localhost:5173`. API requests to `/api` and `/s` are automatically proxied to the backend at `http://localhost:3000`.

---

## Verification & Testing Scripts

- **Type Check**:
  ```bash
  npm run typecheck
  ```

- **Production Build**:
  ```bash
  npm run build
  ```

- **Unit & Component Tests**:
  ```bash
  npm test
  ```

- **Playwright E2E Smoke Tests**:
  ```bash
  npm run test:e2e
  ```

---

## Future Roadmap

- **Phase 24C**: Link Management & Visual Routing Builder UI.
- **Phase 24D**: Operational Analytics Dashboard & Real-Time Visualization.
- **Phase 24E**: BFF Integration, HttpOnly Cookie Authentication, & Production Hardening.
