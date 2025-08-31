# LegalEase — Assistants API Server (Streaming SSE) + Web

This project provides:
- A minimal Node.js API that proxies the OpenAI Assistants API and streams responses via Server‑Sent Events (SSE) with optional file uploads.
- A Vite + React web app that renders a polished “assessment report” view from streamed markdown (with references, TOC, attachments, PDF export).

Jurisdiction note: General legal context is assumed in prompts and presentation.

---

## Quick start
1) API server
   - `cd server`
   - `cp .env.example .env`
   - Set your environment variables in `.env`:
     - `OPENAI_API_KEY=sk-...`
     - `ASSISTANT_ID=asst-...` (see the Assistant setup below)
     - `PORT=3001` (optional)
   - `npm i`
   - `npm run dev`

2) Web app
   - `cd web`
   - `npm i`
   - `npm run dev`
   - By default the web app expects the API at `http://localhost:3001`. Override with `VITE_API_BASE_URL` if needed.

---

## API endpoints (server)
- `POST /api/chat/stream`
  - JSON: `{ "message": "Hello", "threadId": "optional" }`
  - Multipart: `files[]` plus `message` and optional `threadId`
  - Streams SSE events:
    - `event: chunk` → `{ "text": "..." }`
    - `event: done`  → `{ "message_id": "...", "thread_id": "..." }`
    - `event: error` → `{ "error": "..." }`

- `GET /api/threads/:threadId/messages` → normalized message history
- `GET /api/files/:fileId` → proxy download/preview for OpenAI Files
- `GET /health` → `{ ok: true }`

Output format guidance (for the Assistant): keep three sections in the response: numbered concerns, a concise summary, and an Eco‑Score JSON object at the end inside a fenced code block.

---

## Setting up your OpenAI Assistant (with vector stores)

You can configure this entirely in the OpenAI UI, or via API. The server requires only the Assistant ID.

### 1) Create an Assistant
- Go to the OpenAI platform and create a new Assistant.
- Choose a model that supports Assistants features and retrieval (`file_search`).
- Turn on the tool: `File search`.

Recommended instructions (adapt for your use case):
- Focus on general legal context and compliance requirements.
- When citing evidence, include direct URLs when available and name the source document.
- Structure responses as: (1) numbered concerns; (2) summary; (3) fenced JSON Eco‑Score.

### 2) Create or attach a Vector Store
- In the Assistant configuration, create a Vector Store and attach it to the Assistant (or attach an existing one).
- Upload source documents into this store (see the curated lists below). PDFs, DOCX, and web archives generally work well.
- Optionally add metadata to files (e.g., `source=legislation`, `jurisdiction=QLD`, `year=2024`) to improve filtering/grounding.

### 3) Upload documents
Via UI
- In the Assistant’s Vector Store, use “Add files” and upload the documents listed below.

Via API (Node example)
```js
import OpenAI from 'openai';
import fs from 'node:fs';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 1) Create a vector store
const store = await openai.beta.vectorStores.create({ name: 'LegalEase-Knowledge' });

// 2) Upload a file and add to the store
const file = await openai.files.create({
  file: fs.createReadStream('legislation/nature-conservation-act.pdf'),
  purpose: 'assistants'
});
await openai.beta.vectorStores.files.create(store.id, { file_id: file.id });

// 3) Attach the store to your Assistant
await openai.beta.assistants.update(process.env.ASSISTANT_ID, {
  tool_resources: { file_search: { vector_store_ids: [store.id] } }
});
```

Optional retrieval configuration
- You may boost domain‑specific keywords (Acts or dataset names) to steer retrieval.
- Keep boosts conservative; grounding quality often improves more from good metadata and clean source documents.

---

## Curated knowledge to include in the Vector Store

The Assistant should consult and cite these resources where relevant.

### Legislation (General)
- General Legal Statutes
- Compliance Regulations
- Administrative Law
- Regulatory Frameworks
- Policy Guidelines
- Legal Standards
- Compliance Requirements
- Regulatory Procedures

### TERN data
- Australia’s Environment Decadal Report 2025
- Australia’s Environment Report 2024
- Drone Data Collection Protocol
- Drone RGB and Multispectral Data Processing Protocol
- Drone Lidar Data Processing Protocol
- SuperSites Vegetation Monitoring Protocols
- AusPlots Rangelands Survey Protocols Manual
- Effective Field Calibration and Validation Practices

Tip: keep document filenames descriptive (include year/edition) so citations are readable and disambiguated.

---

## Example client requests

Text‑only (JSON)
```bash
curl -N \
  -H 'Content-Type: application/json' \
  -H 'Accept: text/event-stream' \
  -X POST \
  -d '{"message":"Assess vegetation clearing near a riparian zone in QLD"}' \
  http://localhost:3001/api/chat/stream
```

With files (multipart)
```bash
curl -N \
  -H 'Accept: text/event-stream' \
  -F 'message=Please analyse the attachments' \
  -F 'files=@/path/to/map.pdf' \
  -F 'files=@/path/to/photos.zip' \
  http://localhost:3001/api/chat/stream
```

---

## Troubleshooting
- `ASSISTANT_ID` invalid → verify the ID and that your API key can access it.
- No streamed text → server falls back to fetching the latest assistant message; check Assistant tools/permissions.
- File previews fail → ensure the server has permission to retrieve the file from OpenAI Files.

---

## Health check
`GET /health` → `{ ok: true }`


