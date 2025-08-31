import { useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AnimatePresence, motion } from "framer-motion";
import { Send, Copy } from "lucide-react";
import Glass from "./components/Glass.jsx";
import Tilt from "./components/Tilt.jsx";
import Float from "./components/Float.jsx";
import TopProgress from "./components/TopProgress.jsx";

import Ripples from "./components/Ripples.jsx";


const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3001";
const IS_PAGES = typeof window !== 'undefined' && window.location.hostname.endsWith('github.io');

/* ---------- Local storage helpers (single thread) ---------- */
const LS_THREAD_ID = "eco.assistant.threadId";
function loadThreadId() { return localStorage.getItem(LS_THREAD_ID) || ""; }
function saveThreadId(id) { localStorage.setItem(LS_THREAD_ID, id || ""); }

/* ---------- API helpers ---------- */
async function fetchThreadMessages(threadId) {
  const r = await fetch(`${API_BASE}/api/threads/${threadId}/messages`);
  if (!r.ok) throw new Error(`Failed to fetch messages: ${r.status}`);
  const { messages } = await r.json();
  return messages || [];
}

/* ---------- Utils ---------- */
function slugify(s=""){
  return s.toLowerCase()
    .replace(/[^a-z0-9\s-]/g,"")
    .trim()
    .replace(/\s+/g,"-")
    .slice(0,80);
}

function extractHeadings(md=""){
  const out = [];
  const re = /^(#{1,3})\s+(.+?)\s*$/gm;
  let m;
  while ((m = re.exec(md)) !== null) {
    const level = m[1].length;
    const text = m[2].trim();
    out.push({ level, text, id: slugify(text) });
  }
  return out;
}

function extractLinks(md=""){
  const out = [];
  const re = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m;
  while ((m = re.exec(md)) !== null) {
    out.push({ label: m[1], href: m[2] });
  }
  const seen = new Set();
  return out.filter(x => (seen.has(x.href) ? false : (seen.add(x.href), true)));
}

function Brand(){
  return (
        <div className="brand-wrap">
      <div className="brand-text">
        <div className="title">LegalEase</div>
      </div>
    </div>
  );
}

function Message({ m, streaming }) {
  if (m.role === 'user') return null;
  return (
    <div className="msg">
      <div className="bubble">
        {m.parts?.map((p, i) => {
          if (p.type === "text") {
            return (
              <div key={i} style={{ fontSize:16, lineHeight:1.55 }}>
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text || ""}</ReactMarkdown>
              </div>
            );
          }
          if (p.type === "image" && p.file_id) {
            return (
              <div className="attachments" key={i}>
                <img
                  alt="attachment"
                  src={`${API_BASE}/api/files/${p.file_id}`}
                  onClick={()=>setLightbox(`${API_BASE}/api/files/${p.file_id}`)}
                  loading="lazy"
                  style={{ maxWidth: 360, borderRadius: 12, border: "1px solid var(--glass-border)" }}
                />
              </div>
            );
          }
          if (p.type === "file") {
            const href = `${API_BASE}/api/files/${p.file_id}`;
            return (
              <div className="attachments" key={i}>
                <a className="attachment" href={href} download>
                  📄 {p.filename || p.file_id}
                </a>
              </div>
            );
          }
          return <pre key={i} className="attachment">{JSON.stringify(p, null, 2)}</pre>;
        })}
      </div>
    </div>
  );
}

/* ---------- Report (non-chat presentation) ---------- */
function Report({ text, attachments, streaming }){
  const headings = useMemo(() => extractHeadings(text), [text]);
  const links = useMemo(() => extractLinks(text), [text]);
  const [activeId, setActiveId] = useState("");

  const summary = useMemo(() => {
    const hIdx = text.search(/^#{1,6}\s+/m);
    const slice = hIdx > 0 ? text.slice(0, hIdx) : text;
    const firstPara = slice.split(/\n{2,}/)[0]?.trim() || "";
    return firstPara.length > 280 ? firstPara.slice(0, 280) + "…" : firstPara;
  }, [text]);

  const components = useMemo(() => {
    const H = Tag => ({node, children, ...props}) => {
      const rawText = String(children).replace(/<[^>]+>/g,'');
      const id = slugify(rawText);
      return <Tag id={id} {...props}>{children}</Tag>;
    };
    return { h1: H('h1'), h2: H('h2'), h3: H('h3') };
  }, []);

  useEffect(() => {
    // Highlight current section in TOC
    const selector = '.report-body h1, .report-body h2, .report-body h3';
    const nodes = Array.from(document.querySelectorAll(selector));
    if (nodes.length === 0) return;
    const observer = new IntersectionObserver((entries) => {
      // pick the first entry near the top
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a,b) => (a.boundingClientRect.top - b.boundingClientRect.top));
      const top = visible[0] || null;
      if (top?.target?.id) setActiveId(top.target.id);
    }, { root: null, rootMargin: '0px 0px -70% 0px', threshold: 0.1 });
    nodes.forEach(n => observer.observe(n));
    return () => { try { nodes.forEach(n => observer.unobserve(n)); observer.disconnect(); } catch {} };
  }, [text]);

  return (
    <div className="report">
      <div className="report-head">
        <div className="panel-title">Assessment report</div>
      </div>

      {/* Summary box removed per request */}

      {headings.length > 0 && (
        <div className="report-toc">
          <div className="toc-title">Contents</div>
          <ul>
            {headings.map((h, i) => (
              <li key={i} className={`lvl-${h.level} ${activeId===h.id ? 'active' : ''}`}>
                <a href={`#${h.id}`}>{h.text}</a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="report-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {text}
        </ReactMarkdown>
      </div>

      {(attachments?.length || 0) > 0 && (
        <div className="report-attachments">
          <div className="section-label">Evidence attachments</div>
          <div className="attachments masonry">
            {attachments.map((p, i) => {
              if (p.type === 'image') {
                return (
                  <Tilt as="div" key={i} max={5} scale={1.015} style={{ display:'inline-block' }}>
                    <img
                      alt="attachment"
                      src={`${API_BASE}/api/files/${p.file_id}`}
                      onClick={()=>setLightbox(`${API_BASE}/api/files/${p.file_id}`)}
                      loading="lazy"
                      style={{ maxWidth: 360, borderRadius: 12, border: "1px solid var(--glass-border)" }}
                    />
                  </Tilt>
                );
              }
              if (p.type === 'file') {
                const href = `${API_BASE}/api/files/${p.file_id}`;
                return (
                  <Tilt as="div" key={i} max={4} style={{ display:'inline-block' }}>
                    <a className="attachment" href={href} download>📄 {p.filename || p.file_id}</a>
                  </Tilt>
                );
              }
              return null;
            })}
          </div>
        </div>
      )}

      {links.length > 0 && (
        <div className="references">
          <div className="section-label">References</div>
          <ul>
            {links.map((l, i) => (
              <li key={i}>
                <a href={l.href} target="_blank" rel="noreferrer">{l.label}</a>
                <span className="ref-url"> — {l.href}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [threadId, setThreadId] = useState("");
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [files, setFiles] = useState([]);

  const [showComposer, setShowComposer] = useState(true);
  const [showReport, setShowReport] = useState(false);
  const [showEllipsis, setShowEllipsis] = useState(false);
  const [lightbox, setLightbox] = useState(null);
  const [toast, setToast] = useState("");

  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const streamingAssistantRef = useRef(null);
  const ellipsisTimerRef = useRef(null);
  const [draft, setDraft] = useState("");

  useEffect(() => { document.documentElement.setAttribute('data-biome', 'Forest'); }, []);

  useEffect(() => {
    if (threadId && threadId.startsWith("thread_")) {
      fetchThreadMessages(threadId).then(setMessages).catch(err => setErrorMsg(String(err)));
    }
  }, [threadId]);

  // Ensure any persisted thread memory is cleared on page load (fresh session)
  useEffect(() => { try { localStorage.removeItem(LS_THREAD_ID); } catch {} }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isLoading, isStreaming]);

  function exportPDF(){ window.print(); setToast("Export started – check your browser's print dialog"); setTimeout(()=>setToast(""), 2200); }

  function resetAnalysis(){
    if (ellipsisTimerRef.current) { clearTimeout(ellipsisTimerRef.current); ellipsisTimerRef.current = null; }
    setShowComposer(true);
    setShowReport(false);
    setShowEllipsis(false);
    setMessages([]);
    setThreadId("");
    setDraft("");
    if (inputRef.current) inputRef.current.value = "";
    setFiles([]);
    setErrorMsg("");
    setIsLoading(false);
    setIsStreaming(false);
    streamingAssistantRef.current = null;
  }

  async function send() {
    const val = (inputRef.current?.value ?? draft) || "";
    if ((!val.trim() && files.length === 0) || isLoading) return;

    // If running on GitHub Pages (static hosting) and API_BASE points to localhost
    // we inform the user that a local backend is required.
    try {
      const url = new URL(API_BASE);
      const isLocal = ["localhost", "127.0.0.1"].includes(url.hostname);
      if (IS_PAGES && isLocal) {
        setToast("Backend unavailable on GitHub Pages. Run the server locally and set VITE_API_BASE_URL.");
        setTimeout(()=>setToast(""), 3200);
        return;
      }
    } catch {}

    const nowSec = Math.floor(Date.now()/1000);
    setIsLoading(true);
    setIsStreaming(true);
    setErrorMsg("");
    setShowComposer(false);
    setShowReport(true);
    setShowEllipsis(true);
    if (ellipsisTimerRef.current) clearTimeout(ellipsisTimerRef.current);
    ellipsisTimerRef.current = setTimeout(() => { setShowEllipsis(false); ellipsisTimerRef.current = null; }, 30000);

    let resp;
    try {
      if (files.length > 0) {
        const form = new FormData();
        form.append("message", val);
        if (threadId && threadId.startsWith('thread_')) form.append("threadId", threadId);
        for (const f of files) form.append("files", f);
        resp = await fetch(`${API_BASE}/api/chat/stream`, { method: "POST", headers: { "Accept": "text/event-stream" }, body: form });
      } else {
        const payload = threadId && threadId.startsWith('thread_') ? { message: val, threadId } : { message: val };
        resp = await fetch(`${API_BASE}/api/chat/stream`, { method: "POST", headers: { "Content-Type": "application/json", "Accept": "text/event-stream" }, body: JSON.stringify(payload) });
      }
    } catch (e) {
      setIsLoading(false); setIsStreaming(false);
      const msg = IS_PAGES
        ? "Backend not reachable from GitHub Pages. Please run the server locally and set VITE_API_BASE_URL."
        : `Network error: ${String(e)}`;
      setErrorMsg(msg);
      setToast(msg); setTimeout(()=>setToast(""), 3600);
      return;
    }

    if (inputRef.current) inputRef.current.value = ""; setDraft(""); setFiles([]);

    if (!resp.body) {
      setIsLoading(false); setIsStreaming(false);
      const msg = IS_PAGES
        ? "Backend not reachable from GitHub Pages. Please run the server locally and set VITE_API_BASE_URL."
        : "No response body from server.";
      setErrorMsg(msg);
      setToast(msg); setTimeout(()=>setToast(""), 3600);
      return;
    }

    const reader = resp.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    const streamMsg = { id:`assist-${nowSec}`, role:'assistant', created_at: Math.floor(Date.now()/1000), parts: [{ type:'text', text: "" }] };
    streamingAssistantRef.current = streamMsg;
    setMessages(prev => [...prev, streamMsg]);

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n"); buffer = events.pop() || "";
        for (const evt of events) {
          const lines = evt.split("\n");
          const eventLine = lines.find(l => l.startsWith("event:"));
          const dataLine = lines.find(l => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const name = eventLine.slice(6).trim();
          let data = {}; try { data = JSON.parse(dataLine.slice(5).trim()); } catch {}
          if (name === "chunk") {
            const t = data?.text || "";
            if (t) { streamingAssistantRef.current.parts[0].text += t; setMessages(prev => [...prev.slice(0, -1), { ...streamingAssistantRef.current }]); }
          } else if (name === "done") {
            const serverThreadId = data?.thread_id;
            setIsStreaming(false);
            setIsLoading(false);
            streamingAssistantRef.current = null;
            if (serverThreadId) {
              if (serverThreadId !== threadId) setThreadId(serverThreadId);
              const updated = await fetchThreadMessages(serverThreadId);
              setMessages(updated);
            }
          } else if (name === "error") {
            setErrorMsg(data?.error || "Unknown error");
            setIsStreaming(false);
            setIsLoading(false);
            setShowEllipsis(false);
            streamingAssistantRef.current = null;
          }
        }
      }
    } catch (err) { setErrorMsg(`Stream error: ${String(err)}`); }
    finally { /* any fallback cleanup */ }
  }

  function onKeyDown(e) { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); send(); } }
  function onButtonPointer(e){
    // set ripple origin via CSS vars
    const t = e.currentTarget;
    const rect = t.getBoundingClientRect();
    const x = e.clientX - rect.left - 5;
    const y = e.clientY - rect.top - 5;
    t.style.setProperty('--x', `${x}px`);
    t.style.setProperty('--y', `${y}px`);
  }

  const canSend = !isLoading && ((draft.trim().length > 0) || files.length > 0);

  const printDate = new Date().toLocaleString('en-AU', { dateStyle:'long', timeStyle:'short' });
  
  // Latest assistant message for report view
  const lastAssistant = useMemo(() => {
    return messages.filter(m => m.role === 'assistant').at(-1) || null;
  }, [messages]);

  const reportText = useMemo(() => {
    return lastAssistant?.parts?.find(p => p.type === 'text')?.text || "";
  }, [lastAssistant]);

  const reportAttachments = useMemo(() => {
    return lastAssistant?.parts?.filter(p => p.type === 'image' || p.type === 'file') || [];
  }, [lastAssistant]);

  const isCurrentStreaming = isStreaming && !!streamingAssistantRef.current && lastAssistant?.id === streamingAssistantRef.current.id;

  return (
    <div className="app">
      <TopProgress active={isLoading || isStreaming} />

      <Ripples intensity={0.12} />
      <section className="card main">
        <div className="header">
          <Float amplitude={3} duration={4}><Brand /></Float>

        </div>

        <div className="print-header" aria-hidden="true">
          <div className="print-brand">
            <img className="print-logo-img" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
            <div className="print-text">
              <div className="print-title">LegalEase</div>
                              <div className="print-sub">Legal Advice Report</div>
            </div>
          </div>
          <div className="print-meta">{printDate}</div>
        </div>

        {/* Print-only report to ensure content appears in exported PDF */}
        <div className="print-only">
          {reportText && (
            <Report text={reportText} attachments={reportAttachments} streaming={false} />
          )}
        </div>



        {showComposer ? (
          <Glass className="composer" as="div" key="composer-pane">
            <label htmlFor="prompt" style={{ display: "block", fontSize:14, color:'var(--muted)' }}>Details (optional)</label>
            <textarea id="prompt" ref={inputRef} onInput={(e)=>setDraft(e.currentTarget.value)} onKeyDown={onKeyDown} placeholder="Describe your project or question for advice" />
            
            {/* Frontend Demo Notice */}
            <div style={{ 
              marginTop: '12px', 
              padding: '12px', 
              background: 'rgba(239,68,68,0.05)', 
              border: '1px solid rgba(239,68,68,0.2)', 
              borderRadius: '8px',
              fontSize: '12px',
              color: 'var(--muted)',
              textAlign: 'center'
            }}>
              💡 <strong>Frontend Demo:</strong> This is a preview of the LegalEase interface. 
              The AI chat functionality requires a backend server to be running locally.
            </div>
            
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginTop: 8, flexWrap:'wrap' }}>
              <div style={{ display:'inline-flex', alignItems:'center', gap:10 }}>
                <label className="btn" style={{ display:'inline-flex', alignItems:'center', gap:8 }}>
                  <input type="file" multiple onChange={(e)=>setFiles(Array.from(e.target.files || []))} style={{ display:'none' }} />
                  Choose files
                </label>
                {files.length>0 && <div className="tag">{files.length} file(s) selected</div>}
              </div>
              <div>
                <button type="button" className="btn primary" onPointerDown={onButtonPointer} onClick={send} disabled={!canSend}><Send size={16} style={{ verticalAlign:'text-bottom' }}/> {isLoading ? "Analysing…" : "Analyse"}</button>
              </div>
            </div>
            {errorMsg && <div className="tag" style={{ color:"#b91c1c" }}>Error: {errorMsg}</div>}
          </Glass>
        ) : (
          <Glass className="composer" as="div" key="composer-pane-closed">
            <div className="action-center">
              <button type="button" className="btn" onClick={resetAnalysis}>Analyse more</button>
            </div>
          </Glass>
        )}

        {showEllipsis && (
          <div className="between-indicator" aria-hidden="true">
            <div className="ellipsis"><span>.</span><span>.</span><span>.</span></div>
          </div>
        )}

        {showReport && (
          <Glass className="messages" as="div" ref={scrollRef} key="messages-pane">
          {errorMsg && (
            <div className="tag" style={{ color: "#b91c1c", margin: 12 }}>Error: {errorMsg}</div>
          )}
          {!reportText && (
            <div style={{ margin: 12, fontSize:16, color:'var(--muted)', textAlign: 'center' }}>
              <div style={{ marginBottom: '8px' }}>📋 This is a frontend demo of LegalEase</div>
              <div style={{ fontSize: '14px' }}>To test the full AI analysis functionality, run the backend server locally</div>
            </div>
          )}
          {isCurrentStreaming && (
            <div className="skeleton" style={{ margin: 12 }} aria-hidden="true">
              <div className="skeleton-line w-80" />
              <div className="skeleton-line w-90" />
              <div className="skeleton-line w-70" />
              <div className="skeleton-line w-60" />
            </div>
          )}
          {reportText && (
            <AnimatePresence initial={false}>
              <motion.div
                key={lastAssistant?.id || 'report'}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
              >
                <div style={{ display:'flex', justifyContent:'flex-end', padding:'8px 12px' }}>
                  <button className="btn" onPointerDown={onButtonPointer} onClick={()=>{ navigator.clipboard.writeText(reportText || ""); setToast("Copied insights"); setTimeout(()=>setToast(""), 1800); }} disabled={isLoading}><Copy size={16} style={{ verticalAlign:'text-bottom' }}/> Copy insights</button>
                </div>
                <Report text={reportText} attachments={reportAttachments} streaming={isCurrentStreaming} />
              </motion.div>
            </AnimatePresence>
          )}
          </Glass>
        )}

        <div className="export-row" style={{ display:'flex', justifyContent:'flex-end', marginTop: 8 }}>
          <button className="btn" onClick={exportPDF}>Export PDF</button>
        </div>


      </section>
      {lightbox && (
        <div className="lightbox" onClick={()=>setLightbox(null)}>
          <img src={lightbox} alt="preview" />
        </div>
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">{toast}</div>
      )}
    </div>
  );
}


