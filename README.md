# LegalEase — Assistants API Server (Streaming SSE)

## Setup
1) cd server
2) cp .env.example .env
3) Fill in:
   - OPENAI_API_KEY=sk-...
   - ASSISTANT_ID=asst-...
   - PORT=3001 (optional)
4) npm i
5) npm run dev

### Endpoint
POST /api/chat/stream
Body: { "message": "Hello", "threadId": "optional" }

Streams events:
- event: chunk -> { "text": "..." }
- event: done  -> { "message_id": "...", "thread_id": "..." }
- event: error -> { "error": "..." }

Health check: GET /health -> { ok: true }

## Evidence sources (RAG)
The Assistant’s vector store now includes TERN (Terrestrial Ecosystem Research Network) resources alongside Queensland biodiversity/conservation legislation. The Assistant should consult and cite these resources where relevant:
- Australia’s Environment “25 Years of Change” 2025 Report
- Australia’s Environment Report 2024
- TERN Drone Protocols (data collection, RGB/multispectral, LiDAR processing)
- TERN SuperSites Vegetation Monitoring Protocols
- TERN Cal/Val Handbook
- TERN AusPlots Rangelands Survey Protocols
- Threatened Species Index (TSX) 2024 trend dataset + Data Dictionary
- TSX organisational dataset
- TSX aggregated Queensland dataset

RAG keyword boosts to include in retrieval configuration: "TERN", "Australia’s Environment report", "SuperSites", "AusPlots", "Cal/Val", "TSX", "ECS", "biodiversity index", "drone protocol".

Output format remains unchanged (three sections: numbered concerns, summary, Eco-Score JSON at the end in a fenced JSON block).

