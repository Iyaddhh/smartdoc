# SmartDoc architecture

Updated: 28 October 2026. This document describes the current application after removal of OCR and template management.

## Frontend

```text
smartdoc-frontend/
  app/
    layout.tsx                 # Global CSS, AuthProvider, ToastContainer
    page.tsx                   # Public guest tools landing page at /
    login/                     # Public user login at /login
    admin/login/               # Public admin login at /admin/login
    (user)/
      layout.tsx               # AuthGate and application shell
      dashboard/page.tsx       # Authenticated workspace at /dashboard
      converter/ compressor/ splitter/ merger/ watermark/
      riwayat-dokumen/
  components/
    layout/                    # AuthGate, Sidebar
    auth/LoginForm.tsx         # Shared form with a fixed role per login route
    DownloadLink.tsx           # Fetch with Bearer token, download Blob
    ...                        # Shared upload, modal, toast, empty-state UI
  hooks/
    useJobPolling.ts           # Sequential polling with backoff
    useFilePreview.ts          # Authenticated Blob preview and URL cleanup
  lib/
    AuthContext.tsx            # Login state and account lifecycle
    auth-token.ts              # Shared token storage key and accessor
    api/
      client.ts                # JSON transport, auth headers, errors
      types.ts                 # Shared API contracts
      files.ts                 # Authenticated binary transport
      jobs.ts documents.ts     # Resource endpoints
      converter.ts compressor.ts splitter.ts merger.ts watermark.ts
      index.ts                 # Public API exports
```

Route groups do not change public URLs. In the browser, `/api/*` requests use the Next.js rewrite to FastAPI. Set the backend URL in `NEXT_PUBLIC_API_URL`; Docker must use an address reachable from the frontend container, such as `http://backend:8000`.

`AuthGate` controls the signed-in UI. Backend dependencies enforce authentication and document ownership independently. Tokens currently use localStorage; direct document links cannot carry Authorization headers, so downloads and previews fetch authenticated Blobs first.

## Backend and endpoint contracts

`app/api/` groups HTTP endpoints by feature/resource. `app/schemas/` contains shared request validation, `app/services/` contains document engines, `app/models/` contains ORM models, and `app/core/` contains configuration, security, storage containment, concurrency and response helpers.

| Method | Endpoint | Input / behavior |
| --- | --- | --- |
| POST | `/api/auth/register` | JSON username, email, password; creates user only; 201; 5/minute |
| POST | `/api/auth/login` | User-only OAuth2 form username/password; token response |
| POST | `/api/auth/admin/login` | Admin-only OAuth2 form username/password; token response |
| GET | `/api/auth/me` | Current account |
| POST | `/api/converter/process` | Multipart file/files, output_format, optional custom_title; 202 |
| POST | `/api/compressor/process` | Multipart file; 202 |
| POST | `/api/splitter/info` | Multipart file; page count and thumbnails |
| POST | `/api/splitter/process` | Multipart file, split_mode, range_expression/chunk_size, output_format; 202 |
| POST | `/api/merger/info` | Multipart file; page count |
| POST | `/api/merger/process` | Multipart files, merge_mode, insert_position, after_page, custom_title; 202 |
| POST | `/api/watermark/process` | Multipart file, watermark_text, opacity, angle, font_size, color_hex, password; 202 |
| GET | `/api/jobs/{job_id}` | Job status; checked against document owner |
| GET | `/api/documents` | page, limit, feature, search; paginated private history |
| POST | `/api/documents/first-page-preview` | Multipart file; uploaded-file thumbnails |
| GET | `/api/documents/{doc_id}` | Owned document metadata |
| PATCH | `/api/documents/{doc_id}` | JSON custom_name; owned document rename |
| DELETE | `/api/documents/{doc_id}` | Owned document and files |
| GET | `/api/documents/{doc_id}/preview` | Owned document binary, inline |
| GET | `/api/documents/{doc_id}/download` | Owned document binary, attachment |
| POST | `/api/documents/batch-delete` | JSON ids, max 100; owned documents |
| POST | `/api/documents/batch-download` | JSON ids, max 100; ZIP of owned documents |
| GET | `/health`, `/` | Public service metadata |

Account endpoints require a Bearer token, except registration and login. `POST /api/guest/{feature}` is public for converter, compressor, splitter, merger and watermark; it returns a binary download directly and never creates database Document or Job records. JSON responses use `{success, data, message, error}`, except the OAuth2 login response `{access_token, token_type, expires_in}`. File endpoints return binary responses. Invalid inputs return 400/422; missing or unowned resources return 404. Unknown process modes and invalid numeric options are rejected before jobs are created.

## Roles and login

Three access roles are supported: `guest`, `user`, and `admin`. Guest is an unauthenticated visitor, not a database account or JWT role. Guests can use the document tools directly on the public landing page at `/`, with its navbar, footer and login links. Public tools have IP-based rate limits, request/file/page limits and bounded concurrency. All files stay in a unique `temp/guest/request-*` directory, deleted after the response completes or on errors/disconnects. Startup removes crash leftovers. Downloads use `Cache-Control: no-store`; the browser holds the result Blob only until reset or navigation. The workspace at `/dashboard` and account document/history endpoints require authentication. Using public tools never saves to account history, even if a user is signed in. Successful login opens `/dashboard`; successful logout returns to `/`. Database account roles remain `user` and `admin`. Login portals are `/login` and `/admin/login`; wrong-role login attempts return 403 without issuing a token. Both login endpoints share a limit of 15 attempts per minute per client. Public registration forbids additional fields such as `role` and always creates `user` accounts.

Both roles currently use the shared document workspace at `/dashboard` and can access only their own documents. Admin-wide user or document management is not implemented. `require_admin` enforces admin privileges for future admin operations; it uses the current database account role rather than trusting the JWT role claim. Disabled accounts and unsupported roles are denied. A browser stores one active session. `POST /api/auth/logout` increments the account's token version in the database, immediately invalidating every token issued before that logout, including tokens on other devices. The browser clears its local token only after the server confirms logout; session expiry redirects to the last authenticated role's login portal. Tokens issued before this token-version migration require a fresh login.

Migration `004_restrict_user_roles` adds a database CHECK constraint limiting roles to `user` and `admin`. Existing migrations run on backend startup. To provision an account explicitly, use `seed_user.py --username NAME --email EMAIL --password PASSWORD --role admin` (or `--role user`); do not expose role assignment through public registration.

Processing returns `job_id` and `document_id`, then runs through FastAPI BackgroundTasks with per-process semaphores (three jobs, one LibreOffice process). This is an in-process worker model: it does not provide a durable distributed queue or recovery of interrupted jobs.

Historical Alembic migrations and existing database columns remain for compatibility. OCR/template routes and active ORM fields have been removed. The earlier PRD and project descriptions contain historical details; use this endpoint catalog for the current implementation.

## Verification

Frontend: `npm run build`, `npm test`. Backend contract and RBAC checks without a running database: `.venv\Scripts\python.exe -m pytest -q tests/test_endpoint_contracts.py tests/test_rbac.py`. Existing full integration tests additionally require their configured database and external document engines.
