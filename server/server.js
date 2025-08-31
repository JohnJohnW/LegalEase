import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';
import multer from 'multer';
import fs from 'node:fs';
import { toFile } from 'openai/uploads';

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const PORT = Number(process.env.PORT || 3001);
const ASSISTANT_ID = process.env.ASSISTANT_ID;

if (!process.env.OPENAI_API_KEY) console.warn("⚠️ OPENAI_API_KEY missing in .env");
if (!ASSISTANT_ID) console.warn("⚠️ ASSISTANT_ID missing in .env");

// ---- SSE helper
function sseSend(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`);
}

// ---- Chat streaming endpoint (supports JSON and multipart with files[])
app.post('/api/chat/stream', upload.array('files'), async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // Support JSON and multipart/form-data
  const rawMessage = req.body?.message;
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : '';
  const { threadId } = req.body ?? {};
  const files = Array.isArray(req.files) ? req.files : [];

  // Allow: text-only OR file-only. Block only if both are empty
  if (!message && files.length === 0) {
    sseSend(res, 'error', { error: 'Provide a message or at least one file.' });
    return res.end();
  }
  if (!ASSISTANT_ID) {
    sseSend(res, 'error', { error: 'Server not configured with ASSISTANT_ID' });
    return res.end();
  }
  if (!process.env.OPENAI_API_KEY) {
    sseSend(res, 'error', { error: 'Server not configured with OPENAI_API_KEY' });
    return res.end();
  }

  try {
    // Validate assistant id quickly to fail fast if invalid
    try {
      await openai.beta.assistants.retrieve(ASSISTANT_ID);
    } catch (e) {
      sseSend(res, 'error', { error: 'Invalid ASSISTANT_ID or not accessible with this API key.' });
      return res.end();
    }
    const thread = threadId ? { id: threadId } : await openai.beta.threads.create({ messages: [] });

    // If files were uploaded, send them to OpenAI and prepare attachments
    let attachments = undefined;
    if (files.length > 0) {
      const uploaded = await Promise.all(files.map(async (f) => {
        const stream = fs.createReadStream(f.path);
        try {
          // Preserve original filename so the extension is known to the Assistants retrieval system
          const fileWithName = await toFile(stream, f.originalname || 'upload.txt');
          const up = await openai.files.create({ file: fileWithName, purpose: 'assistants' });
          return { fileId: up.id };
        } finally {
          stream.close?.();
        }
      }));
      attachments = uploaded.map(u => ({ file_id: u.fileId, tools: [{ type: 'file_search' }] }));
      // Cleanup temp files
      for (const f of files) fs.unlink(f.path, () => {});
    }

    const contentToSend = message || 'Please analyze the attached file(s) and provide legal insights.';

    await openai.beta.threads.messages.create(thread.id, {
      role: 'user',
      content: contentToSend,
      attachments
    });

    const stream = await openai.beta.threads.runs.stream(thread.id, { assistant_id: ASSISTANT_ID });

    let didEnd = false;
    let sentAnyText = false;
    const endIfNeeded = (payload = {}) => {
      if (didEnd) return;
      didEnd = true;
      const data = { thread_id: thread.id, ...payload };
      sseSend(res, 'done', data);
      res.end();
    };

    const sendChunk = (delta) => {
      const chunk = delta?.value ?? '';
      if (chunk) { sentAnyText = true; sseSend(res, 'chunk', { text: chunk }); }
    };

    const timeoutMs = Number(process.env.STREAM_TIMEOUT_MS || 120000);
    const timeout = setTimeout(() => {
      sseSend(res, 'error', { error: 'Stream timeout' });
      try { stream.abort?.(); } catch {}
      endIfNeeded();
    }, timeoutMs);

    const sendMessageText = (msg) => {
      if (!msg) return;
      try {
        const parts = msg.content || [];
        for (const part of parts) {
          if (part.type === 'text' && part.text?.value) {
            sentAnyText = true;
            sseSend(res, 'chunk', { text: part.text.value });
          }
        }
      } catch {}
    };

    stream
      // Forward raw events as debug if requested
      .on('event', (evt) => { if (process.env.DEBUG_SSE) { sseSend(res, 'debug', evt); } })
      // Text deltas (support both legacy and new event names)
      .on('textDelta', sendChunk)
      .on('text.delta', sendChunk)
      // Message completed (support both legacy and new event names)
      .on('messageCompleted', (msg) => { clearTimeout(timeout); sendMessageText(msg); endIfNeeded({ message_id: msg?.id }); })
      .on('message.completed', (msg) => { clearTimeout(timeout); sendMessageText(msg); endIfNeeded({ message_id: msg?.id }); })
      // Run lifecycle notifications (we finalize after finalRun below)
      .on('runCompleted', () => { clearTimeout(timeout); })
      .on('run.completed', () => { clearTimeout(timeout); })
      .on('end', () => { clearTimeout(timeout); })
      .on('runRequiresAction', () => {
        clearTimeout(timeout);
        sseSend(res, 'error', { error: 'Assistant requires action which is not implemented on server.' });
        endIfNeeded();
      })
      .on('run.requires_action', () => {
        clearTimeout(timeout);
        sseSend(res, 'error', { error: 'Assistant requires action which is not implemented on server.' });
        endIfNeeded();
      })
      .on('error', (err) => {
        clearTimeout(timeout);
        sseSend(res, 'error', { error: err?.message || String(err) });
        endIfNeeded();
      });

    const finalRun = await stream.finalRun();
    if (finalRun && finalRun.status && finalRun.status !== 'completed') {
      const status = finalRun.status;
      const errMsg = finalRun.last_error?.message || finalRun.incomplete_details?.reason || 'Run did not complete';
      sseSend(res, 'error', { error: `Run status: ${status}. ${errMsg}` });
      endIfNeeded();
      return;
    }
    // Fallback: if no text was streamed, fetch the latest assistant message text
    if (!didEnd) {
      if (!sentAnyText) {
        try {
          const list = await openai.beta.threads.messages.list(thread.id, { order: 'desc', limit: 5 });
          const firstAssistant = (list.data || []).find(m => m.role === 'assistant');
          if (firstAssistant) {
            for (const c of firstAssistant.content || []) {
              if (c.type === 'text' && c.text?.value) {
                sseSend(res, 'chunk', { text: c.text.value });
                break;
              }
            }
          } else {
            sseSend(res, 'error', { error: 'No assistant output was produced for this run. Check assistant configuration (model/instructions/tools) and permissions.' });
          }
        } catch (e) {
          // ignore fallback errors, we'll still end the stream
        }
      }
      endIfNeeded();
    }
  } catch (err) {
    sseSend(res, 'error', { error: err?.message || String(err) });
    res.end();
  }
});

// ---- Normalize message content into a UI-friendly shape
function normalizeMessage(m) {
  const parts = [];
  for (const c of m.content || []) {
    if (c.type === 'text') {
      parts.push({ type: 'text', text: c.text?.value || '' });
    } else if (c.type === 'image_file') {
      parts.push({ type: 'image', file_id: c.image_file?.file_id });
    } else if (c.type === 'file_path') {
      parts.push({
        type: 'file',
        file_id: c.file_path?.file_id,
        filename: c.file_path?.filename || 'download'
      });
    } else {
      // Fallback for other content types
      parts.push({ type: c.type, raw: c });
    }
  }
  return {
    id: m.id,
    role: m.role,
    created_at: m.created_at || Math.floor(Date.now() / 1000),
    parts
  };
}

// ---- Fetch normalized thread messages (ASC order)
app.get('/api/threads/:threadId/messages', async (req, res) => {
  try {
    const { threadId } = req.params;
    const list = await openai.beta.threads.messages.list(threadId, {
      order: 'asc',
      limit: 100
    });
    const messages = (list.data || []).map(normalizeMessage);
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

// ---- Proxy file download (images/attachments)
app.get('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await openai.files.retrieve(fileId);
    // Stream file content
    const content = await openai.files.content(fileId);
    const filename = file?.filename || `${fileId}`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/octet-stream');
    // content is a web Response
    if (content?.body?.pipe) {
      content.body.pipe(res);
    } else {
      const buf = Buffer.from(await content.arrayBuffer());
      res.end(buf);
    }
  } catch (err) {
    res.status(500).json({ error: err?.message || String(err) });
  }
});

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`🟢 API listening on http://localhost:${PORT}`);
});
