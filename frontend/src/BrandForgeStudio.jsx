// ─────────────────────────────────────────────────────────────────────────────
// BRANDFORGE STUDIO v2.0
// Phase 1: Secure AI backend proxy + Unsplash images + Rate limiting
// Phase 2: Asset library (upload, browse, insert)
// Phase 3: Undo/redo + keyboard shortcuts + text controls
// Phase 4: Password reset + usage tracking + loading skeletons
// Phase 5: Social post template + Invoice template + Stock photo search + Mobile
// ─────────────────────────────────────────────────────────────────────────────

import {
  useState, useRef, useCallback, useEffect, useReducer,
  createContext, useContext, Suspense
} from "react";
import {
  Monitor, Tablet, Smartphone, Download, Rocket, Cloud, FolderOpen,
  User, LogOut, Zap, Lock, ChevronRight, RefreshCw, Plus, Trash2,
  Sparkles, Save, CheckCircle, AlertCircle, Loader2, Eye, X,
  Mail, MapPin, Linkedin, Globe, Github, Phone, Menu, ExternalLink,
  Copy, ArrowRight, LayoutDashboard, FileText, CreditCard, Presentation,
  Image, Star, Settings, ChevronDown, ChevronLeft, BarChart3, Palette,
  Shield, Send, Upload, Package, Pencil, PencilOff,
  RotateCcw, RotateCw, Search, Instagram, Receipt, AlignLeft,
  AlignCenter, AlignRight, Sliders, ImagePlus, ChevronUp
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXTS
// ─────────────────────────────────────────────────────────────────────────────
const EditModeContext = createContext(false);
const useEditMode = () => useContext(EditModeContext);

const DESIGN_DEFAULTS = {
  primary: "#6366F1", secondary: "#10B981", textColor: "#E5E7EB",
  bgColor: "#0B0F19", bgType: "solid", gradientA: "#0B0F19",
  gradientB: "#1a1040", gradientDir: "135deg", borderRadius: "12",
  spacing: "normal", contentSpacing: 50, textAlign: "left",
  fontHeading: "Cormorant Garamond", fontBody: "Inter",
  letterSpacing: "0", lineHeight: "1.6",
};
const DesignContext = createContext(DESIGN_DEFAULTS);
const useDesign = () => useContext(DesignContext);

// ─────────────────────────────────────────────────────────────────────────────
// IMAGE SYSTEM — Unsplash via backend proxy with in-memory cache
// ─────────────────────────────────────────────────────────────────────────────
const imgStore = { data: {}, loading: new Set() };

const FALLBACK_IMGS = [
  "https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&q=80",
  "https://images.unsplash.com/photo-1504868584819-f8e8b4b6d7e3?w=800&q=80",
  "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80",
  "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?w=800&q=80",
  "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=800&q=80",
  "https://images.unsplash.com/photo-1519389950473-47ba0277781c?w=800&q=80",
];

function getRandFallback() { return FALLBACK_IMGS[Math.floor(Math.random() * FALLBACK_IMGS.length)]; }

function getImg(category = "business", idx = 0) {
  const pool = imgStore.data[category] || imgStore.data["business"] || [];
  if (!pool.length) return FALLBACK_IMGS[idx % FALLBACK_IMGS.length];
  return pool[idx % pool.length].url;
}

async function loadCategory(category) {
  if (imgStore.data[category] || imgStore.loading.has(category)) return;
  imgStore.loading.add(category);
  try {
    const r = await fetch(`${API_BASE}/api/images/search?category=${category}&count=6`);
    if (r.ok) { const d = await r.json(); imgStore.data[category] = d.images || []; }
  } catch { /* use fallbacks */ }
  imgStore.loading.delete(category);
}

async function preloadAllImages() {
  const cats = ["business","technology","food","fashion","travel","healthcare",
                 "finance","ai","nature","fitness","education","automobile",
                 "architecture","interior","sports"];
  try {
    const r = await fetch(`${API_BASE}/api/images/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: cats, count: 5 }),
    });
    if (r.ok) {
      const d = await r.json();
      Object.assign(imgStore.data, d.images || {});
    }
  } catch { /* silent */ }
}

// React component: lazy-loads image from Unsplash
function UImg({ category = "business", idx = 0, style, className, alt = "", onError }) {
  const [src, setSrc] = useState(() => getImg(category, idx));
  useEffect(() => {
    if (!imgStore.data[category]) {
      loadCategory(category).then(() => setSrc(getImg(category, idx)));
    } else {
      setSrc(getImg(category, idx));
    }
  }, [category, idx]);
  return (
    <img src={src} style={style} className={className} alt={alt}
      onError={e => { e.target.src = getRandFallback(); if(onError) onError(e); }} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// API BASE + HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const API_BASE = import.meta.env.VITE_API_URL || "";

const _getToken  = () => localStorage.getItem("bf_token");
const _setAuth   = (t, u) => { localStorage.setItem("bf_token", t); localStorage.setItem("bf_user", JSON.stringify(u)); };
const _clearAuth = () => { localStorage.removeItem("bf_token"); localStorage.removeItem("bf_user"); };
const _getUser   = () => { try { return JSON.parse(localStorage.getItem("bf_user")); } catch { return null; } };

async function apiFetch(path, opts = {}) {
  const token = _getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
    ...opts,
  });
  const data = await res.json();
  if (!res.ok) { const e = new Error(data.message || "Request failed"); e.status = res.status; e.upgrade = data.upgrade; throw e; }
  return data;
}

const API = {
  signup:       (n,e,p)   => apiFetch("/auth/signup", { method:"POST", body:JSON.stringify({name:n,email:e,password:p}) }),
  login:        async(e,p)=> { const r = await apiFetch("/auth/login",{method:"POST",body:JSON.stringify({email:e,password:p})}); if(r.token) _setAuth(r.token,r.user); return r; },
  me:           ()        => apiFetch("/auth/me"),
  forgotPw:     (email)   => apiFetch("/auth/forgot-password",{method:"POST",body:JSON.stringify({email})}),
  resetPw:      (t,p)     => apiFetch("/auth/reset-password",{method:"POST",body:JSON.stringify({token:t,password:p})}),
  getProjects:  ()        => apiFetch("/projects"),
  saveProject:  (d)       => apiFetch("/projects",{method:"POST",body:JSON.stringify(d)}),
  updateProject:(id,d)    => apiFetch(`/projects/${id}`,{method:"PUT",body:JSON.stringify(d)}),
  deleteProject:(id)      => apiFetch(`/projects/${id}`,{method:"DELETE"}),
  createOrder:  (plan)    => apiFetch("/payment/create-order",{method:"POST",body:JSON.stringify({plan})}),
  verifyPayment:(o,p,s)   => apiFetch("/payment/verify",{method:"POST",body:JSON.stringify({razorpay_order_id:o,razorpay_payment_id:p,razorpay_signature:s})}),
  generateAI:   (prompt,type) => apiFetch("/api/ai/generate",{method:"POST",body:JSON.stringify({prompt,type})}),
  aiUsage:      ()        => apiFetch("/api/ai/usage"),
  getAssets:    ()        => apiFetch("/api/assets"),
  deleteAsset:  (id)      => apiFetch(`/api/assets/${id}`,{method:"DELETE"}),
  uploadAsset:  async(file) => {
    const fd = new FormData(); fd.append("image", file);
    const token = _getToken();
    const res = await fetch(`${API_BASE}/api/assets/upload`, {
      method:"POST", headers:{ Authorization:`Bearer ${token}` }, body:fd,
    });
    const d = await res.json();
    if(!res.ok) { const e = new Error(d.message||"Upload failed"); e.upgrade=d.upgrade; throw e; }
    return d;
  },
  adminUsers:   ()        => apiFetch("/auth/admin/users"),
  adminStats:   ()        => apiFetch("/auth/admin/stats"),
  updatePlan:   (id,plan) => apiFetch(`/auth/admin/users/${id}/plan`,{method:"PATCH",body:JSON.stringify({plan})}),
  deleteUser:   (id)      => apiFetch(`/auth/admin/users/${id}`,{method:"DELETE"}),
};

function loadRazorpayScript() {
  return new Promise(resolve => {
    if (document.getElementById("rzp-script")) return resolve(true);
    const s = document.createElement("script");
    s.id = "rzp-script"; s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true); s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PLAN CONFIG
// ─────────────────────────────────────────────────────────────────────────────
const PLANS = {
  starter:    { aiGenerations: 3,        export: false, deploy: false, premiumTemplates: false, assetLimit: 10,  label: "Starter" },
  pro:        { aiGenerations: Infinity, export: true,  deploy: true,  premiumTemplates: true,  assetLimit: 200, label: "Pro" },
  enterprise: { aiGenerations: Infinity, export: true,  deploy: true,  premiumTemplates: true,  assetLimit: Infinity, label: "Enterprise" },
};
function getPlanKey(user) {
  const p = user?.plan || "starter";
  return ["starter","pro","enterprise"].includes(p) ? p : "starter";
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: UNDO / REDO HOOK
// ─────────────────────────────────────────────────────────────────────────────
function useUndoRedo(initialState) {
  const [state, dispatch] = useReducer((s, action) => {
    switch (action.type) {
      case "SET": {
        const newHistory = [...s.history.slice(0, s.cursor + 1), action.payload];
        return { history: newHistory.slice(-50), cursor: Math.min(newHistory.length-1, 49) };
      }
      case "UNDO":
        return s.cursor > 0 ? { ...s, cursor: s.cursor - 1 } : s;
      case "REDO":
        return s.cursor < s.history.length-1 ? { ...s, cursor: s.cursor+1 } : s;
      default: return s;
    }
  }, { history: [initialState], cursor: 0 });

  const current  = state.history[state.cursor];
  const canUndo  = state.cursor > 0;
  const canRedo  = state.cursor < state.history.length - 1;
  const set      = useCallback(v => dispatch({ type: "SET", payload: v }), []);
  const undo     = useCallback(() => dispatch({ type: "UNDO" }), []);
  const redo     = useCallback(() => dispatch({ type: "REDO" }), []);

  return { current, set, undo, redo, canUndo, canRedo };
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT DATA
// ─────────────────────────────────────────────────────────────────────────────
const STYLES = [
  { id:"minimal",   label:"Minimal",   icon:"○", desc:"Clean white, editorial spacing" },
  { id:"bold",      label:"Bold",      icon:"◈", desc:"Vibrant color-block" },
  { id:"dark",      label:"Dark",      icon:"◉", desc:"Midnight premium" },
  { id:"creative",  label:"Creative",  icon:"◈", desc:"Grid-breaking experimental" },
  { id:"elegant",   label:"Elegant",   icon:"◇", desc:"Serif luxury" },
];

function defaultPortfolio() {
  return {
    name:"Alex Rivera", role:"Product Designer · UX Lead", tagline:"Crafting clarity from complexity.",
    about:"I'm a product designer who believes great UX is 20% craft and 80% listening. I've built design systems from scratch, led teams, and taken zero-to-one products through launch.\n\nMy toolkit spans Figma, Framer, and a stubborn insistence on getting interaction details right.",
    style:"dark",
    projects:[
      { title:"Razorpay Checkout v3", description:"End-to-end redesign of India's highest-volume payment surface. Reduced drop-off by 22%.", image:"", tags:["UX Research","Design System","Fintech"] },
      { title:"Cleartrip Mobile", description:"Reimagined the flight booking flow for 8M monthly users. Cut booking time by 34%.", image:"", tags:["Mobile","Travel","A/B Testing"] },
      { title:"Meesho Seller Dashboard", description:"Scalable seller analytics platform supporting 1.1M active merchants.", image:"", tags:["Data Viz","B2B","React"] },
    ],
    experience:[
      { role:"Senior Product Designer", company:"Razorpay", date:"2022–Present", bullets:["Led checkout redesign impacting ₹2T+ annual GMV","Built component library used across 6 product teams"] },
      { role:"Product Designer", company:"Cleartrip", date:"2020–2022", bullets:["Owned mobile booking UX for flights and hotels","Ran 40+ A/B tests improving conversion by 18%"] },
    ],
    skills:[
      { label:"Design", items:["Figma","Framer","Principle","Protopie"] },
      { label:"Research", items:["User interviews","Usability testing","Analytics","Heuristic eval"] },
    ],
    contact:{ email:"alex@designbyalex.com", location:"Bengaluru, India", linkedin:"linkedin.com/in/alexrivera", website:"alexrivera.design" },
    imageCategory:"business",
  };
}

function defaultResume() {
  return {
    name:"Rohan Verma", role:"Full-Stack Engineer · AI Systems",
    summary:"8 years building production systems at scale. Currently obsessed with LLM evaluation pipelines and low-latency APIs.",
    experience:[
      { role:"Senior Software Engineer", company:"Sarvam AI", date:"Jan 2024–Present", bullets:["Architected LLM eval pipeline processing 500K+ samples/day","Led migration from monolith to microservices, cutting p95 latency 38%"] },
      { role:"Software Engineer II", company:"Juspay", date:"Jun 2021–Dec 2023", bullets:["Owned React payment SDK used by 200+ merchants","Designed PostgreSQL schema for 40M+ row transaction audit log"] },
    ],
    education:[{ degree:"B.Tech Computer Science", school:"IIT Bombay", date:"2016–2020" }],
    skills:[
      { label:"Frontend", items:["React","Vite","TypeScript","Next.js"] },
      { label:"Backend",  items:["Node.js","PostgreSQL","Redis","REST APIs"] },
      { label:"AI / ML",  items:["LangChain","OpenAI SDK","Anthropic SDK"] },
    ],
    contact:{ email:"rohan@vermadev.io", location:"Pune, India", github:"github.com/rohanverma", linkedin:"linkedin.com/in/rohanverma" },
    imageCategory:"technology",
  };
}

function defaultBizCard() {
  return {
    name:"Priya Mehta", title:"Founder & CEO", company:"Meridian AI",
    tagline:"Building the future of enterprise automation.",
    contact:{ email:"priya@meridian.ai", phone:"+91 98765 43210", website:"meridian.ai", location:"Mumbai, India" },
    style:"dark", imageCategory:"ai",
  };
}

function defaultPresentation() {
  return {
    title:"From Monolith to Microservices", presenter:"Vikram Nair",
    company:"CloudScale", imageCategory:"technology",
    slides:[
      { type:"hero", tag:"Opening", title:"From Monolith to Microservices", subtitle:"How we scaled from 80K to 2M daily actives without a single P0 incident.", image:"", bullets:[] },
      { type:"image_right", tag:"Context", title:"Where We Started", subtitle:"18 months ago: one monolith, 80K DAU, 820ms median API latency.", image:"", bullets:["Legacy monolith serving 80K daily actives","Median latency: 820ms","2–3 production incidents per week"] },
      { type:"full_bg", tag:"The Problem", title:"Growth Broke Everything.", subtitle:"Traffic spikes caused cascading failures across billing, auth, and the core API.", image:"", bullets:[] },
      { type:"stats", tag:"Results", title:"Six Months Later.", subtitle:"34 services, 3 regions, 2M DAU, zero P0s.", image:"", bullets:["↓ 82% reduction in p95 latency","↑ 24× improvement in deploy frequency","$0 unplanned downtime cost in Q4"] },
      { type:"cta", tag:"Closing", title:"Thank You", subtitle:"Questions, horror stories, and Slack DMs welcome.", image:"", bullets:[] },
    ],
  };
}

function defaultSocialPost() {
  return {
    headline:"Your Brand, Amplified.", subtext:"We help ambitious founders craft compelling visual identities that convert.",
    caption:"Swipe to see how we transformed 3 brands in 30 days 👇",
    hashtags:["branding","designinspiration","startup","marketing","visual"],
    cta:"DM us 'BRAND' to get started",
    style:"gradient", palette:"purple",
    imageCategory:"business",
  };
}

function defaultInvoice() {
  const today  = new Date();
  const due    = new Date(today); due.setDate(due.getDate() + 30);
  const fmt    = d => d.toISOString().split("T")[0];
  return {
    from:{ company:"BrandForge Studio", name:"Alex Rivera", email:"alex@brandforge.io", address:"12 Creative Park, Bengaluru 560001" },
    to:  { company:"Acme Corp", name:"Raj Sharma", email:"raj@acmecorp.in", address:"44 MG Road, Mumbai 400001" },
    invoice_number:`INV-${String(Math.floor(Math.random()*9000)+1000)}`,
    date:fmt(today), due_date:fmt(due),
    items:[
      { description:"Brand identity design", quantity:1, rate:35000 },
      { description:"Landing page UI (Figma)", quantity:1, rate:20000 },
      { description:"Social media templates (10)", quantity:10, rate:1500 },
    ],
    notes:"Payment due within 30 days. Bank transfer details shared separately.\nThank you for your business!",
    tax_percent:18,
  };
}

const TEMPLATE_TYPES = [
  { id:"portfolio",    label:"Portfolio",      icon:"👤", desc:"Personal brand site", premium:false },
  { id:"resume",       label:"Resume",         icon:"📄", desc:"Professional resume",  premium:false },
  { id:"business_card",label:"Business Card",  icon:"💳", desc:"Digital biz card",    premium:false },
  { id:"presentation", label:"Presentation",   icon:"📊", desc:"Slide deck",          premium:true  },
  { id:"social_post",  label:"Social Post",    icon:"📱", desc:"Instagram / social",  premium:false },
  { id:"invoice",      label:"Invoice",        icon:"🧾", desc:"Business invoice",    premium:false },
];

// ─────────────────────────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────────────────────────
function deepSet(obj, path, value) {
  const parts = path.split(".");
  const result = JSON.parse(JSON.stringify(obj));
  let cur = result;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] === undefined) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return result;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a);
  a.click(); setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=Inter:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,400;0,600;0,700;1,400&family=Space+Mono:wght@400;700&display=swap');
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0B0F19;--bg2:#10141F;--bg3:#151924;--bg4:#1A1F2E;
  --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.12);
  --text:#E5E7EB;--text2:#9CA3AF;--text3:#6B7280;
  --accent:#6366F1;--accent2:#818CF8;--green:#10B981;--red:#EF4444;--amber:#F59E0B;
  --shadow-card:0 10px 30px rgba(0,0,0,0.25);
  --shadow-accent:0 8px 24px rgba(99,102,241,0.2);
  --r:12px;
}
html,body,#root{height:100%;font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);overflow:hidden}
[contenteditable]{outline:none;cursor:text;border-radius:4px;transition:background .15s}
[contenteditable]:hover{background:rgba(99,102,241,0.08)}
[contenteditable]:focus{background:rgba(99,102,241,0.12);box-shadow:0 0 0 2px rgba(99,102,241,0.3)}
textarea{background:transparent;border:none;color:inherit;font-family:inherit;font-size:inherit;resize:none;box-shadow:0 0 0 2px rgba(99,102,241,0.12);border-radius:6px;padding:6px 8px;width:100%;outline:none}
textarea:focus{box-shadow:0 0 0 3px rgba(99,102,241,0.22)}

/* Skeleton loaders */
.skeleton{background:linear-gradient(90deg,var(--bg3) 25%,var(--bg4) 50%,var(--bg3) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:6px}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}

/* Toast */
.toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%);background:#1A1A26;border:1px solid rgba(99,102,241,.35);border-radius:10px;padding:10px 18px;font-family:'Inter',sans-serif;font-size:.78rem;font-weight:600;color:var(--text);z-index:600;display:flex;align-items:center;gap:8px;box-shadow:0 8px 32px rgba(0,0,0,.5);animation:toastIn .22s ease,toastOut .22s ease 2.8s forwards;white-space:nowrap}
@keyframes toastIn{from{opacity:0;transform:translate(-50%,10px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes toastOut{from{opacity:1}to{opacity:0;transform:translate(-50%,-10px)}}

/* Design system injected into preview */
.pv-live h1,.pv-live h2,.pv-live h3,.pv-live h4{font-family:var(--ds-font-head,inherit)!important}
.pv-live p,.pv-live span,.pv-live li{font-family:var(--ds-font-body,inherit);letter-spacing:var(--ds-ls,0em);line-height:var(--ds-lh,1.6)}
.pv-live p,.pv-live .text-block{text-align:var(--ds-align,left)}

/* Layout */
.app{display:grid;grid-template-columns:var(--sb-w,280px) 1fr;grid-template-rows:52px 1fr;height:100vh;transition:grid-template-columns .3s}
.app.sidebar-collapsed{--sb-w:0px}
.topbar{grid-column:1/-1;grid-row:1;display:flex;align-items:center;padding:0 16px;background:var(--bg2);border-bottom:1px solid var(--border);z-index:300}
.sidebar{grid-row:2;background:var(--bg2);border-right:1px solid var(--border);overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column}
.main{grid-row:2;overflow:hidden;display:flex;flex-direction:column;background:var(--bg)}

/* Logo */
.logo{font-family:'Inter Tight',sans-serif;font-size:1rem;font-weight:800;color:var(--text);display:flex;align-items:center;gap:4px}
.logo em{color:#818CF8;font-style:normal}
.logo sup{font-size:.42rem;font-weight:700;color:var(--text3);letter-spacing:.05em;margin-left:2px}

/* Topbar tabs */
.tabs{display:flex;gap:2px;margin:0 12px;flex:1}
.tab{display:flex;align-items:center;gap:5px;padding:5px 10px;border-radius:6px;font-size:.7rem;font-weight:600;color:var(--text2);cursor:pointer;border:none;background:none;transition:all .15s}
.tab:hover{color:var(--text);background:var(--bg3)}
.tab.active{color:var(--text);background:var(--bg3)}
.tab svg{opacity:.7}.tab.active svg{opacity:1}
.acts{display:flex;gap:6px;align-items:center;flex-shrink:0}

/* Buttons */
.btn{display:inline-flex;align-items:center;gap:5px;padding:6px 12px;border-radius:7px;font-size:.72rem;font-weight:600;cursor:pointer;border:1px solid var(--border2);background:transparent;color:var(--text);transition:all .15s;font-family:'Inter',sans-serif}
.btn:hover{background:var(--bg3);border-color:var(--border2)}
.btn.primary{background:var(--accent);border-color:transparent;color:#fff}
.btn.primary:hover{background:#5558e8;box-shadow:0 4px 14px rgba(99,102,241,.35)}
.btn.green{background:var(--green);border-color:transparent;color:#fff}
.btn.green:hover{background:#0da572}
.btn.ai{background:linear-gradient(135deg,#4f46e5,#7c3aed);border-color:transparent;color:#fff}
.btn.ai:hover{background:linear-gradient(135deg,#4338ca,#6d28d9)}
.btn.icon{padding:6px;border-radius:7px}
.btn.icon.active{background:var(--bg4);color:var(--accent)}
.btn:disabled{opacity:.35;cursor:not-allowed}
.btn.save{border-color:rgba(16,185,129,0.28);color:#6EE7B7}
.btn.save:hover{background:rgba(16,185,129,0.08)}
.btn.undo{color:var(--text2);padding:5px 8px}
.btn.undo:hover{color:var(--text)}
.btn.undo:disabled{opacity:.25}

/* Sidebar sections */
.ss{border-bottom:1px solid var(--border);overflow:hidden}
.ss-head{display:flex;align-items:center;gap:6px;padding:10px 14px;cursor:pointer;font-size:.72rem;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;user-select:none;transition:.15s}
.ss-head:hover{color:var(--text)}
.ss-body{padding:0 14px 12px}
.ss-toggle{color:var(--text3);transition:transform .2s;display:flex;align-items:center}
.ss-toggle.open{transform:rotate(90deg)}

/* Form elements */
.field{margin-bottom:10px}
.field label{display:block;font-size:.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-bottom:4px}
.field input,.field select{width:100%;background:var(--bg3);border:1px solid var(--border);border-radius:7px;padding:6px 9px;color:var(--text);font-size:.75rem;font-family:'Inter',sans-serif;outline:none;transition:border-color .15s}
.field input:focus,.field select:focus{border-color:rgba(99,102,241,.5);background:var(--bg4)}
.field input[type=range]{padding:0;background:transparent;border:none;height:20px;cursor:pointer}
.color-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.color-swatch{width:22px;height:22px;border-radius:5px;cursor:pointer;border:2px solid transparent;transition:border-color .15s;flex-shrink:0}
.color-swatch.active{border-color:white}

/* Items in sidebar */
.item-block{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px;margin-bottom:8px}
.item-block:hover{border-color:rgba(99,102,241,0.2)}
.item-hd{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px}
.add-btn{width:100%;padding:7px;border:1px dashed var(--border2);border-radius:7px;background:transparent;color:var(--text3);font-size:.7rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:all .15s}
.add-btn:hover{border-color:var(--accent);color:var(--accent)}

/* Template picker */
.tpl-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tpl-card{padding:10px 8px;border:1px solid var(--border);border-radius:8px;cursor:pointer;text-align:center;transition:all .15s;background:var(--bg3)}
.tpl-card:hover{border-color:rgba(99,102,241,.4);background:var(--bg4)}
.tpl-card.active{border-color:var(--accent);background:rgba(99,102,241,.1)}
.tpl-icon{font-size:.9rem;display:block;margin-bottom:4px}
.tpl-label{font-size:.6rem;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.06em;display:block}
.tpl-desc{font-size:.55rem;color:var(--text3);margin-top:2px;display:block}
.tpl-badge{font-size:.48rem;background:rgba(99,102,241,.2);color:#818CF8;padding:1px 5px;border-radius:99px;margin-top:3px;display:inline-block}

/* AI panel */
.ai-panel{background:linear-gradient(135deg,rgba(79,70,229,.1),rgba(124,58,237,.08));border:1px solid rgba(99,102,241,.2);border-radius:10px;padding:12px;margin:10px 14px}
.ai-head{display:flex;align-items:center;gap:5px;font-size:.65rem;font-weight:700;color:#818CF8;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}
.ai-status{font-size:.65rem;margin-top:7px;display:flex;align-items:center;gap:5px}

/* Main canvas area */
.canvas-wrap{flex:1;overflow:auto;display:flex;align-items:flex-start;justify-content:center;padding:20px;background:var(--bg)}
.canvas-inner{background:var(--bg2);border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.4);overflow:hidden;width:100%;max-width:900px;min-height:600px;transition:max-width .3s}
.canvas-inner.mobile{max-width:390px}
.canvas-inner.tablet{max-width:768px}

/* Preview toolbar */
.preview-bar{display:flex;align-items:center;gap:8px;padding:8px 16px;background:var(--bg2);border-bottom:1px solid var(--border);flex-shrink:0}
.device-btns{display:flex;gap:4px}
.prev-label{font-size:.65rem;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;margin-right:auto}

/* Asset library */
.asset-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:8px}
.asset-item{position:relative;aspect-ratio:1;border-radius:6px;overflow:hidden;cursor:pointer;border:2px solid transparent;transition:border-color .15s}
.asset-item:hover{border-color:var(--accent)}
.asset-item img{width:100%;height:100%;object-fit:cover}
.asset-del{position:absolute;top:3px;right:3px;background:rgba(0,0,0,.7);border:none;color:#fff;border-radius:4px;padding:2px 4px;cursor:pointer;opacity:0;transition:opacity .15s;font-size:.6rem}
.asset-item:hover .asset-del{opacity:1}
.upload-zone{border:2px dashed var(--border2);border-radius:8px;padding:20px;text-align:center;cursor:pointer;transition:all .15s;margin-top:8px}
.upload-zone:hover,.upload-zone.drag{border-color:var(--accent);background:rgba(99,102,241,.05)}

/* Stock photo search */
.photo-search{margin-top:10px}
.photo-results{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:8px;max-height:260px;overflow-y:auto}
.photo-thumb{border-radius:6px;overflow:hidden;cursor:pointer;aspect-ratio:4/3;border:2px solid transparent;transition:border-color .15s}
.photo-thumb:hover{border-color:var(--accent)}
.photo-thumb img{width:100%;height:100%;object-fit:cover}
.photo-credit{font-size:.5rem;color:var(--text3);margin-top:2px;text-align:right}

/* Mobile sidebar toggle */
.sidebar-toggle{display:none;position:fixed;bottom:20px;left:20px;z-index:500;background:var(--accent);border:none;color:#fff;width:40px;height:40px;border-radius:50%;cursor:pointer;align-items:center;justify-content:center;box-shadow:0 4px 14px rgba(99,102,241,.4)}

/* Invoice template */
.invoice-wrap{background:#fff;color:#111;font-family:'Inter',sans-serif;padding:48px;min-height:700px;max-width:800px;margin:0 auto}
.invoice-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px}
.invoice-from{font-size:13px;line-height:1.7;color:#555}
.invoice-to{font-size:13px;line-height:1.7;color:#555;text-align:right}
.invoice-items{width:100%;border-collapse:collapse;margin:24px 0;font-size:13px}
.invoice-items th{text-align:left;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#888;padding:8px 12px;border-bottom:2px solid #eee}
.invoice-items td{padding:10px 12px;border-bottom:1px solid #f0f0f0}
.invoice-totals{margin-left:auto;width:260px;font-size:13px}
.invoice-totals tr td:first-child{color:#666;padding:4px 0}
.invoice-totals tr td:last-child{text-align:right;font-weight:500;padding:4px 0}
.invoice-total-row td{font-size:16px;font-weight:700;border-top:2px solid #111;padding-top:8px!important}

/* Social post template */
.social-wrap{aspect-ratio:1/1;position:relative;overflow:hidden;width:100%;max-width:500px;margin:0 auto;border-radius:12px}
.social-overlay{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:32px}
.social-headline{font-family:'Inter Tight',sans-serif;font-weight:800;font-size:clamp(1.4rem,5vw,2.2rem);color:#fff;line-height:1.15;margin-bottom:8px;text-shadow:0 2px 12px rgba(0,0,0,.4)}
.social-subtext{font-size:.88rem;color:rgba(255,255,255,.85);line-height:1.5;margin-bottom:16px}
.social-cta{display:inline-block;background:#fff;color:#111;font-weight:700;font-size:.78rem;padding:8px 20px;border-radius:99px}
.social-hashtags{margin-top:12px;display:flex;flex-wrap:wrap;gap:6px}
.social-tag{font-size:.65rem;color:rgba(255,255,255,.7)}

/* Upgrade modal */
.modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:900;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
.modal{background:var(--bg2);border:1px solid var(--border2);border-radius:16px;padding:28px;max-width:420px;width:90%}

/* Responsive — mobile */
@media(max-width:680px){
  .app{grid-template-columns:1fr!important;grid-template-rows:52px 1fr}
  .sidebar{position:fixed;left:0;top:52px;bottom:0;width:280px;z-index:200;transform:translateX(-100%);transition:transform .3s;overflow-y:auto}
  .sidebar.open{transform:translateX(0)}
  .sidebar-toggle{display:flex}
  .tabs .tab span{display:none}
  .logo sup{display:none}
}
@media(min-width:681px){
  .sidebar-toggle{display:none!important}
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 4: LOADING SKELETON
// ─────────────────────────────────────────────────────────────────────────────
function SkeletonBlock({ width = "100%", height = 16, style }) {
  return <div className="skeleton" style={{ width, height, borderRadius:6, ...style }} />;
}
function SkeletonCard() {
  return (
    <div style={{ padding:16, display:"flex", flexDirection:"column", gap:10 }}>
      <SkeletonBlock height={24} width="60%" />
      <SkeletonBlock height={14} width="80%" />
      <SkeletonBlock height={14} width="70%" />
      <SkeletonBlock height={120} style={{ borderRadius:10 }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EDITABLE ELEMENT
// ─────────────────────────────────────────────────────────────────────────────
function EditableEl({ value, onChange, tag = "span", style, className, multiline = false }) {
  const editMode = useEditMode();
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current && ref.current.textContent !== value) ref.current.textContent = value;
  }, [value]);

  if (!editMode) {
    const Tag = tag;
    return <Tag style={style} className={className}>{value}</Tag>;
  }

  if (multiline) {
    return (
      <textarea
        ref={ref} defaultValue={value} style={style} className={className}
        rows={3} onChange={e => onChange(e.target.value)}
      />
    );
  }

  const Tag = tag;
  return (
    <Tag
      ref={ref} contentEditable suppressContentEditableWarning
      style={style} className={className}
      onBlur={e => onChange(e.currentTarget.textContent)}
      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 2: ASSET LIBRARY PANEL
// ─────────────────────────────────────────────────────────────────────────────
function AssetLibraryPanel({ onInsertImage }) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef(null);
  const [toast, setToast] = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  useEffect(() => {
    API.getAssets().then(d => { setAssets(d.assets || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleFiles(files) {
    const file = files[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return showToast("Only images supported");
    if (file.size > 5 * 1024 * 1024) return showToast("File too large (max 5MB)");
    setUploading(true);
    try {
      const { asset } = await API.uploadAsset(file);
      setAssets(a => [asset, ...a]);
      showToast("✓ Image uploaded");
    } catch (e) {
      showToast(e.message || "Upload failed");
    }
    setUploading(false);
  }

  async function deleteAsset(id) {
    await API.deleteAsset(id);
    setAssets(a => a.filter(x => x.id !== id));
    showToast("Deleted");
  }

  return (
    <div>
      {toast && <div className="toast">{toast}</div>}

      {/* Upload zone */}
      <div
        className={`upload-zone${drag ? " drag" : ""}`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files); }}
      >
        <input ref={fileRef} type="file" accept="image/*" style={{display:"none"}}
          onChange={e => handleFiles(e.target.files)} />
        {uploading
          ? <><Loader2 size={16} className="spinning" style={{margin:"0 auto 6px"}}/><div style={{fontSize:".65rem",color:"var(--text3)"}}>Uploading…</div></>
          : <><ImagePlus size={18} style={{margin:"0 auto 6px",opacity:.5}}/><div style={{fontSize:".65rem",color:"var(--text3)"}}>Click or drop image (max 5MB)</div></>
        }
      </div>

      {/* Asset grid */}
      {loading ? (
        <div className="asset-grid" style={{marginTop:8}}>
          {[1,2,3].map(i=><div key={i} className="skeleton" style={{aspectRatio:"1",borderRadius:6}} />)}
        </div>
      ) : assets.length === 0 ? (
        <div style={{textAlign:"center",padding:"20px 0",color:"var(--text3)",fontSize:".68rem"}}>No uploads yet</div>
      ) : (
        <div className="asset-grid">
          {assets.map(a => (
            <div key={a.id} className="asset-item" onClick={() => onInsertImage(a.data)}>
              <img src={a.data} alt={a.name} />
              <button className="asset-del" onClick={e => { e.stopPropagation(); deleteAsset(a.id); }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 5: STOCK PHOTO SEARCH
// ─────────────────────────────────────────────────────────────────────────────
function StockPhotoSearch({ onInsertImage }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search() {
    if (!query.trim()) return;
    setLoading(true); setSearched(true);
    try {
      const r = await fetch(`${API_BASE}/api/images/search?query=${encodeURIComponent(query)}&count=8`);
      const d = await r.json();
      setResults(d.images || []);
    } catch { setResults([]); }
    setLoading(false);
  }

  return (
    <div className="photo-search">
      <div style={{display:"flex",gap:6}}>
        <input
          className="field" style={{flex:1,margin:0,background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:7,padding:"5px 8px",color:"var(--text)",fontSize:".72rem",fontFamily:"'Inter',sans-serif",outline:"none"}}
          placeholder="Search photos…" value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === "Enter" && search()}
        />
        <button className="btn icon" onClick={search} disabled={loading}>
          {loading ? <Loader2 size={12} className="spinning" /> : <Search size={12} />}
        </button>
      </div>
      {searched && (
        <div className="photo-results">
          {loading ? [1,2,3,4].map(i=>(
            <div key={i} className="skeleton" style={{aspectRatio:"4/3",borderRadius:6}} />
          )) : results.map(img => (
            <div key={img.id} className="photo-thumb" onClick={() => onInsertImage(img.url)}>
              <img src={img.thumb || img.url} alt="" />
            </div>
          ))}
          {!loading && results.length === 0 && (
            <div style={{gridColumn:"1/-1",textAlign:"center",fontSize:".65rem",color:"var(--text3)",padding:"12px 0"}}>No results found</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3: TEXT CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
function TextControlsPanel({ design, onDesignChange }) {
  return (
    <div style={{padding:"0 14px 12px"}}>
      <div className="field">
        <label>Heading Font</label>
        <select value={design.fontHeading} onChange={e => onDesignChange("fontHeading", e.target.value)}>
          {["Cormorant Garamond","Inter Tight","Space Mono","Georgia","Arial","Trebuchet MS"].map(f=>(
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Body Font</label>
        <select value={design.fontBody} onChange={e => onDesignChange("fontBody", e.target.value)}>
          {["Inter","Georgia","Arial","Verdana","Space Mono","Trebuchet MS"].map(f=>(
            <option key={f} value={f}>{f}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Letter Spacing — {design.letterSpacing || "0"}em</label>
        <input type="range" min="-2" max="10" step="1" value={(parseFloat(design.letterSpacing||0)*100)||0}
          onChange={e => onDesignChange("letterSpacing", (e.target.value/100).toFixed(2))} />
      </div>
      <div className="field">
        <label>Line Height — {design.lineHeight || "1.6"}</label>
        <input type="range" min="10" max="30" step="1" value={parseFloat(design.lineHeight||1.6)*10}
          onChange={e => onDesignChange("lineHeight", (e.target.value/10).toFixed(1))} />
      </div>
      <div className="field">
        <label>Text Align</label>
        <div style={{display:"flex",gap:6}}>
          {["left","center","right"].map(a=>(
            <button key={a} className={`btn icon${design.textAlign===a?" active":""}`}
              onClick={() => onDesignChange("textAlign",a)} style={{flex:1,justifyContent:"center"}}>
              {a==="left"?<AlignLeft size={13}/>:a==="center"?<AlignCenter size={13}/>:<AlignRight size={13}/>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI PANEL — calls backend
// ─────────────────────────────────────────────────────────────────────────────
function AIPanel({ activeType, onGenerated, aiUsage }) {
  const [prompt, setPrompt]   = useState("");
  const [status, setStatus]   = useState("idle");
  const [msg, setMsg]         = useState("");

  const used      = aiUsage?.used ?? 0;
  const limit     = aiUsage?.limit ?? 3;
  const unlimited = aiUsage?.unlimited ?? false;
  const remaining = unlimited ? Infinity : Math.max(0, limit - used);
  const isGated   = !unlimited && remaining <= 0;

  const generate = async () => {
    if (!prompt.trim()) { setMsg("Enter a description first."); return; }
    if (isGated) { setStatus("gated"); setMsg("Upgrade to Pro for unlimited AI generations."); return; }
    setStatus("loading"); setMsg("Generating with Claude AI…");
    try {
      const result = await API.generateAI(prompt, activeType);
      onGenerated(result.data);
      setStatus("done"); setMsg(`✓ Generated! ${result.tokens_used} tokens used.`);
      setPrompt("");
      setTimeout(() => { setStatus("idle"); setMsg(""); }, 3500);
    } catch(e) {
      setStatus("error");
      setMsg(e.message || "Generation failed. Check server logs.");
      setTimeout(() => { setStatus("idle"); setMsg(""); }, 4000);
    }
  };

  return (
    <div className="ai-panel">
      <div className="ai-head">
        <Sparkles size={11} />
        <span>AI Generator</span>
        <div style={{marginLeft:"auto",fontSize:".52rem",fontFamily:"'Space Mono',monospace",color:isGated?"#FF4D6D":remaining<=1?"#F5A623":"#6E6C88"}}>
          {unlimited ? "∞ unlimited" : isGated ? "Limit reached" : `${remaining} left`}
        </div>
      </div>
      <textarea
        placeholder={`Describe your ${activeType.replace(/_/g," ")}…\n\nE.g. "Startup founder, 5 years in fintech, based in Mumbai"`}
        rows={3} value={prompt} onChange={e => setPrompt(e.target.value)}
        style={{fontSize:".72rem",marginBottom:8}}
        disabled={status==="loading"}
      />
      <button className="btn ai" style={{width:"100%",justifyContent:"center"}}
        onClick={generate} disabled={status==="loading"||isGated}>
        {status==="loading" ? <><Loader2 size={11} className="spinning" /> Generating…</> : <><Sparkles size={11} /> Generate with AI</>}
      </button>
      {msg && (
        <div className={`ai-status${status==="error"?" ":" "}`} style={{
          color:status==="error"?"#FF4D6D":status==="done"?"#10B981":"#818CF8"
        }}>
          {status==="loading"&&<Loader2 size={10} className="spinning"/>}
          {status==="done"&&<CheckCircle size={10}/>}
          {status==="error"&&<AlertCircle size={10}/>}
          <span>{msg}</span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SIDEBAR SECTION WRAPPER
// ─────────────────────────────────────────────────────────────────────────────
function SidebarSection({ title, icon, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="ss">
      <div className="ss-head" onClick={() => setOpen(o => !o)}>
        {icon && <span style={{opacity:.7}}>{icon}</span>}
        <span style={{flex:1}}>{title}</span>
        <span className={`ss-toggle${open?" open":""}`}><ChevronRight size={11}/></span>
      </div>
      {open && <div className="ss-body">{children}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN CONTROLS SIDEBAR
// ─────────────────────────────────────────────────────────────────────────────
function DesignControls({ design, onChange }) {
  const set = (k,v) => onChange(k,v);
  const PALETTE = ["#6366F1","#EC4899","#F59E0B","#10B981","#3B82F6","#8B5CF6","#EF4444","#06B6D4","#ffffff","#111111"];

  return (
    <>
      <SidebarSection title="Brand Color" defaultOpen={true}>
        <div className="color-row">
          {PALETTE.map(c => (
            <div key={c} className={`color-swatch${design.primary===c?" active":""}`}
              style={{background:c}} onClick={() => set("primary",c)} />
          ))}
        </div>
        <div className="field" style={{marginTop:8}}>
          <label>Custom Color</label>
          <input type="color" value={design.primary} onChange={e => set("primary",e.target.value)}
            style={{height:32,padding:2}} />
        </div>
      </SidebarSection>

      <SidebarSection title="Background" defaultOpen={false}>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {["solid","gradient"].map(t => (
            <button key={t} className={`btn${design.bgType===t?" primary":""}`}
              style={{flex:1,justifyContent:"center",fontSize:".65rem"}}
              onClick={() => set("bgType",t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</button>
          ))}
        </div>
        <div className="field">
          <label>{design.bgType==="gradient"?"Gradient Start":"Background Color"}</label>
          <input type="color" value={design.bgColor} onChange={e => set("bgColor",e.target.value)} style={{height:32,padding:2}} />
        </div>
        {design.bgType==="gradient" && <>
          <div className="field">
            <label>Gradient End</label>
            <input type="color" value={design.gradientB} onChange={e => set("gradientB",e.target.value)} style={{height:32,padding:2}} />
          </div>
          <div className="field">
            <label>Direction</label>
            <select value={design.gradientDir} onChange={e => set("gradientDir",e.target.value)}>
              {["135deg","to right","to bottom","to top right","to top left"].map(d=>(
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </>}
      </SidebarSection>

      <SidebarSection title="Typography" defaultOpen={false}>
        <TextControlsPanel design={design} onDesignChange={set} />
      </SidebarSection>

      <SidebarSection title="Layout" defaultOpen={false}>
        <div className="field">
          <label>Border Radius — {design.borderRadius}px</label>
          <input type="range" min="0" max="24" value={design.borderRadius}
            onChange={e => set("borderRadius",e.target.value)} />
        </div>
        <div className="field">
          <label>Content Spacing — {design.contentSpacing}%</label>
          <input type="range" min="10" max="90" value={design.contentSpacing}
            onChange={e => set("contentSpacing",parseInt(e.target.value))} />
        </div>
        <div className="field">
          <label>Spacing</label>
          <select value={design.spacing} onChange={e => set("spacing",e.target.value)}>
            {["compact","normal","relaxed"].map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </SidebarSection>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE SIDEBARS — editing controls per template type
// ─────────────────────────────────────────────────────────────────────────────
function PortfolioSidebar({ data, set }) {
  return (
    <>
      <SidebarSection title="Profile" defaultOpen={true}>
        <div className="field"><label>Name</label><input value={data.name||""} onChange={e=>set("name",e.target.value)}/></div>
        <div className="field"><label>Role</label><input value={data.role||""} onChange={e=>set("role",e.target.value)}/></div>
        <div className="field"><label>Tagline</label><input value={data.tagline||""} onChange={e=>set("tagline",e.target.value)}/></div>
      </SidebarSection>
      <SidebarSection title="Contact" defaultOpen={false}>
        {["email","location","linkedin","website"].map(k=>(
          <div key={k} className="field"><label>{k}</label>
            <input value={data.contact?.[k]||""} onChange={e=>set(`contact.${k}`,e.target.value)}/></div>
        ))}
      </SidebarSection>
    </>
  );
}

function ResumeSidebar({ data, set }) {
  return (
    <>
      <SidebarSection title="Profile" defaultOpen={true}>
        <div className="field"><label>Name</label><input value={data.name||""} onChange={e=>set("name",e.target.value)}/></div>
        <div className="field"><label>Role</label><input value={data.role||""} onChange={e=>set("role",e.target.value)}/></div>
      </SidebarSection>
      <SidebarSection title="Contact" defaultOpen={false}>
        {["email","location","linkedin","github"].map(k=>(
          <div key={k} className="field"><label>{k}</label>
            <input value={data.contact?.[k]||""} onChange={e=>set(`contact.${k}`,e.target.value)}/></div>
        ))}
      </SidebarSection>
    </>
  );
}

function BizCardSidebar({ data, set }) {
  return (
    <SidebarSection title="Card Info" defaultOpen={true}>
      {["name","title","company","tagline"].map(k=>(
        <div key={k} className="field"><label>{k}</label>
          <input value={data[k]||""} onChange={e=>set(k,e.target.value)}/></div>
      ))}
      {["email","phone","website"].map(k=>(
        <div key={k} className="field"><label>{k}</label>
          <input value={data.contact?.[k]||""} onChange={e=>set(`contact.${k}`,e.target.value)}/></div>
      ))}
    </SidebarSection>
  );
}

function SocialSidebar({ data, set }) {
  const PALETTES = ["purple","blue","green","orange","pink"];
  return (
    <SidebarSection title="Post Content" defaultOpen={true}>
      <div className="field"><label>Headline</label><input value={data.headline||""} onChange={e=>set("headline",e.target.value)}/></div>
      <div className="field"><label>Subtext</label><input value={data.subtext||""} onChange={e=>set("subtext",e.target.value)}/></div>
      <div className="field"><label>CTA</label><input value={data.cta||""} onChange={e=>set("cta",e.target.value)}/></div>
      <div className="field"><label>Style</label>
        <select value={data.style||"gradient"} onChange={e=>set("style",e.target.value)}>
          {["minimal","bold","gradient","dark"].map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="field"><label>Color Palette</label>
        <div style={{display:"flex",gap:6}}>
          {PALETTES.map(p=>(
            <div key={p} onClick={()=>set("palette",p)}
              style={{width:22,height:22,borderRadius:"50%",cursor:"pointer",border:`2px solid ${data.palette===p?"white":"transparent"}`,
              background:{purple:"#6366F1",blue:"#3B82F6",green:"#10B981",orange:"#F59E0B",pink:"#EC4899"}[p]}} />
          ))}
        </div>
      </div>
    </SidebarSection>
  );
}

function InvoiceSidebar({ data, set }) {
  return (
    <>
      <SidebarSection title="From" defaultOpen={true}>
        {["company","name","email","address"].map(k=>(
          <div key={k} className="field"><label>{k}</label>
            <input value={data.from?.[k]||""} onChange={e=>set(`from.${k}`,e.target.value)}/></div>
        ))}
      </SidebarSection>
      <SidebarSection title="To (Client)" defaultOpen={false}>
        {["company","name","email","address"].map(k=>(
          <div key={k} className="field"><label>{k}</label>
            <input value={data.to?.[k]||""} onChange={e=>set(`to.${k}`,e.target.value)}/></div>
        ))}
      </SidebarSection>
      <SidebarSection title="Invoice Details" defaultOpen={false}>
        <div className="field"><label>Invoice #</label><input value={data.invoice_number||""} onChange={e=>set("invoice_number",e.target.value)}/></div>
        <div className="field"><label>Date</label><input type="date" value={data.date||""} onChange={e=>set("date",e.target.value)}/></div>
        <div className="field"><label>Due Date</label><input type="date" value={data.due_date||""} onChange={e=>set("due_date",e.target.value)}/></div>
        <div className="field"><label>Tax %</label><input type="number" value={data.tax_percent||0} onChange={e=>set("tax_percent",parseFloat(e.target.value))}/></div>
      </SidebarSection>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TEMPLATE PREVIEW COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

// ── PORTFOLIO ─────────────────────────────────────────────────────────────────
function PortfolioTemplate({ data, design }) {
  const bg = design.bgType === "gradient"
    ? `linear-gradient(${design.gradientDir}, ${design.bgColor}, ${design.gradientB})`
    : design.bgColor;
  const r  = `${design.borderRadius}px`;

  return (
    <EditModeContext.Provider value={false}>
      <div style={{ background:bg, color:design.textColor, fontFamily:design.fontBody, minHeight:600, padding:40, lineHeight:design.lineHeight }}>
        {/* Hero */}
        <div style={{ textAlign:"center", paddingBottom:40, borderBottom:`1px solid rgba(255,255,255,0.1)`, marginBottom:40 }}>
          <div style={{ width:80,height:80,borderRadius:"50%",overflow:"hidden",margin:"0 auto 16px",border:`3px solid ${design.primary}` }}>
            <UImg category={data.imageCategory||"business"} idx={0} style={{width:"100%",height:"100%",objectFit:"cover"}} />
          </div>
          <h1 style={{ fontFamily:design.fontHeading, fontSize:"2rem", fontWeight:700, color:"#fff", margin:"0 0 8px", letterSpacing:design.letterSpacing+"em" }}>{data.name}</h1>
          <div style={{ color:design.primary, fontWeight:600, fontSize:".9rem", marginBottom:8 }}>{data.role}</div>
          <div style={{ color:design.textColor, opacity:.7, fontSize:".85rem", fontStyle:"italic" }}>{data.tagline}</div>
        </div>
        {/* About */}
        {data.about && (
          <div style={{ marginBottom:40 }}>
            <h2 style={{ fontFamily:design.fontHeading, color:"#fff", marginBottom:12, fontSize:"1.3rem", letterSpacing:design.letterSpacing+"em" }}>About</h2>
            <p style={{ opacity:.8, fontSize:".88rem", whiteSpace:"pre-line" }}>{data.about}</p>
          </div>
        )}
        {/* Projects */}
        {(data.projects||[]).length > 0 && (
          <div style={{ marginBottom:40 }}>
            <h2 style={{ fontFamily:design.fontHeading, color:"#fff", marginBottom:16, fontSize:"1.3rem", letterSpacing:design.letterSpacing+"em" }}>Projects</h2>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
              {(data.projects||[]).map((p,i) => (
                <div key={i} style={{ background:"rgba(255,255,255,0.05)", borderRadius:r, overflow:"hidden", border:`1px solid rgba(255,255,255,0.08)` }}>
                  <div style={{ height:130, overflow:"hidden" }}>
                    <UImg category={data.imageCategory||"business"} idx={i+1} style={{width:"100%",height:"100%",objectFit:"cover"}} />
                  </div>
                  <div style={{ padding:14 }}>
                    <div style={{ fontWeight:700, color:"#fff", marginBottom:6, fontSize:".88rem" }}>{p.title}</div>
                    <div style={{ fontSize:".78rem", opacity:.7, marginBottom:8 }}>{p.description}</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                      {(p.tags||[]).map((t,j) => (
                        <span key={j} style={{ fontSize:".6rem", background:`${design.primary}22`, color:design.primary, padding:"2px 8px", borderRadius:99 }}>{t}</span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        {/* Contact */}
        {data.contact && (
          <div style={{ display:"flex", gap:20, flexWrap:"wrap", opacity:.8, fontSize:".8rem" }}>
            {data.contact.email    && <span>✉ {data.contact.email}</span>}
            {data.contact.location && <span>📍 {data.contact.location}</span>}
            {data.contact.website  && <span>🌐 {data.contact.website}</span>}
          </div>
        )}
      </div>
    </EditModeContext.Provider>
  );
}

// ── RESUME ────────────────────────────────────────────────────────────────────
function ResumeTemplate({ data, design }) {
  return (
    <div style={{ background:"#fff", color:"#111", fontFamily:"'Inter',sans-serif", display:"grid", gridTemplateColumns:"240px 1fr", minHeight:600 }}>
      {/* Left column */}
      <div style={{ background:design.primary, color:"#fff", padding:28 }}>
        <div style={{ width:72, height:72, borderRadius:"50%", overflow:"hidden", marginBottom:16, border:"3px solid rgba(255,255,255,0.3)" }}>
          <UImg category={data.imageCategory||"technology"} idx={0} style={{width:"100%",height:"100%",objectFit:"cover"}} />
        </div>
        <div style={{ fontWeight:800, fontSize:"1.15rem", marginBottom:4 }}>{data.name}</div>
        <div style={{ fontSize:".75rem", opacity:.8, marginBottom:20 }}>{data.role}</div>
        <div style={{ fontSize:".7rem", opacity:.9 }}>
          {data.contact?.email    && <div style={{marginBottom:6}}>✉ {data.contact.email}</div>}
          {data.contact?.location && <div style={{marginBottom:6}}>📍 {data.contact.location}</div>}
          {data.contact?.linkedin && <div style={{marginBottom:6}}>in {data.contact.linkedin}</div>}
          {data.contact?.github   && <div style={{marginBottom:6}}>⌥ {data.contact.github}</div>}
        </div>
        {(data.skills||[]).length > 0 && (
          <div style={{ marginTop:20 }}>
            <div style={{ fontWeight:700, fontSize:".65rem", textTransform:"uppercase", letterSpacing:".08em", opacity:.7, marginBottom:10 }}>Skills</div>
            {(data.skills||[]).map((g,i) => (
              <div key={i} style={{ marginBottom:10 }}>
                <div style={{ fontSize:".65rem", fontWeight:700, opacity:.7, marginBottom:4 }}>{g.label}</div>
                {(g.items||[]).map((s,j) => <div key={j} style={{ fontSize:".72rem", marginBottom:2, opacity:.9 }}>• {s}</div>)}
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Right column */}
      <div style={{ padding:28 }}>
        {data.summary && <p style={{ fontSize:".83rem", color:"#444", marginBottom:24, lineHeight:1.7 }}>{data.summary}</p>}
        {(data.experience||[]).length > 0 && (
          <div style={{ marginBottom:24 }}>
            <div style={{ fontWeight:800, fontSize:".65rem", textTransform:"uppercase", letterSpacing:".1em", color:design.primary, marginBottom:12 }}>Experience</div>
            {(data.experience||[]).map((e,i) => (
              <div key={i} style={{ marginBottom:16 }}>
                <div style={{ fontWeight:700, fontSize:".88rem" }}>{e.role}</div>
                <div style={{ fontSize:".75rem", color:"#888", marginBottom:6 }}>{e.company} · {e.date}</div>
                {(e.bullets||[]).map((b,j) => <div key={j} style={{ fontSize:".78rem", color:"#444", marginBottom:3 }}>• {b}</div>)}
              </div>
            ))}
          </div>
        )}
        {(data.education||[]).length > 0 && (
          <div>
            <div style={{ fontWeight:800, fontSize:".65rem", textTransform:"uppercase", letterSpacing:".1em", color:design.primary, marginBottom:12 }}>Education</div>
            {(data.education||[]).map((e,i) => (
              <div key={i} style={{ marginBottom:10 }}>
                <div style={{ fontWeight:700, fontSize:".85rem" }}>{e.degree}</div>
                <div style={{ fontSize:".75rem", color:"#888" }}>{e.school} · {e.date}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── BUSINESS CARD ─────────────────────────────────────────────────────────────
function BizCardTemplate({ data, design }) {
  const bg = design.bgType === "gradient"
    ? `linear-gradient(135deg, ${design.bgColor}, ${design.gradientB})`
    : design.bgColor;
  return (
    <div style={{ display:"flex", justifyContent:"center", padding:40, background:"#111" }}>
      <div style={{ background:bg, borderRadius:16, padding:"32px 36px", width:380, color:design.textColor, position:"relative", overflow:"hidden" }}>
        <div style={{ position:"absolute", top:-30, right:-30, width:150, height:150, borderRadius:"50%", background:`${design.primary}15` }} />
        <div style={{ position:"relative" }}>
          <div style={{ width:52, height:52, borderRadius:"50%", overflow:"hidden", marginBottom:16, border:`2px solid ${design.primary}` }}>
            <UImg category={data.imageCategory||"business"} idx={0} style={{width:"100%",height:"100%",objectFit:"cover"}} />
          </div>
          <div style={{ fontFamily:design.fontHeading, fontSize:"1.4rem", fontWeight:700, color:"#fff", marginBottom:4 }}>{data.name}</div>
          <div style={{ color:design.primary, fontWeight:600, fontSize:".8rem", marginBottom:2 }}>{data.title}</div>
          <div style={{ color:design.textColor, opacity:.7, fontSize:".78rem", marginBottom:16 }}>{data.company}</div>
          {data.tagline && <div style={{ fontStyle:"italic", opacity:.6, fontSize:".75rem", marginBottom:20 }}>{data.tagline}</div>}
          <div style={{ borderTop:`1px solid rgba(255,255,255,0.12)`, paddingTop:16, fontSize:".72rem", opacity:.8, display:"flex", flexDirection:"column", gap:5 }}>
            {data.contact?.email   && <span>✉ {data.contact.email}</span>}
            {data.contact?.phone   && <span>📞 {data.contact.phone}</span>}
            {data.contact?.website && <span>🌐 {data.contact.website}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PRESENTATION ──────────────────────────────────────────────────────────────
function PresentationTemplate({ data, design }) {
  const [slide, setSlide] = useState(0);
  const slides = data.slides || [];
  const s = slides[slide] || {};
  const bg = `linear-gradient(135deg, ${design.bgColor}, ${design.gradientB||"#1a1040"})`;

  return (
    <div style={{ background:design.bgColor, minHeight:500 }}>
      <div style={{ background:bg, minHeight:460, display:"flex", flexDirection:"column", justifyContent:"center", alignItems:"center", padding:48, textAlign:"center", position:"relative" }}>
        {s.image || data.imageCategory ? (
          <div style={{ position:"absolute", inset:0, overflow:"hidden", opacity:.15 }}>
            <UImg category={data.imageCategory||"technology"} idx={slide} style={{width:"100%",height:"100%",objectFit:"cover"}} />
          </div>
        ) : null}
        <div style={{ position:"relative", maxWidth:600 }}>
          {s.tag && <div style={{ fontSize:".65rem", fontWeight:700, textTransform:"uppercase", letterSpacing:".12em", color:design.primary, marginBottom:12 }}>{s.tag}</div>}
          <h1 style={{ fontFamily:design.fontHeading, fontSize:"2.2rem", fontWeight:700, color:"#fff", marginBottom:16, lineHeight:1.2 }}>{s.title}</h1>
          {s.subtitle && <p style={{ color:"rgba(255,255,255,.75)", fontSize:"1rem", lineHeight:1.6, marginBottom:16 }}>{s.subtitle}</p>}
          {(s.bullets||[]).length > 0 && (
            <ul style={{ textAlign:"left", display:"inline-block" }}>
              {(s.bullets||[]).map((b,i) => (
                <li key={i} style={{ color:"rgba(255,255,255,.8)", fontSize:".88rem", marginBottom:6, paddingLeft:4 }}>• {b}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
      {/* Slide nav */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:12, padding:14, background:"rgba(0,0,0,.3)" }}>
        <button onClick={() => setSlide(i => Math.max(0,i-1))} disabled={slide===0}
          className="btn" style={{fontSize:".65rem",padding:"4px 10px"}}>← Prev</button>
        <span style={{ fontSize:".65rem", color:"var(--text2)" }}>{slide+1} / {slides.length}</span>
        <button onClick={() => setSlide(i => Math.min(slides.length-1,i+1))} disabled={slide>=slides.length-1}
          className="btn" style={{fontSize:".65rem",padding:"4px 10px"}}>Next →</button>
      </div>
    </div>
  );
}

// ── PHASE 5: SOCIAL POST ──────────────────────────────────────────────────────
function SocialPostTemplate({ data, design }) {
  const PALETTE_GRADIENTS = {
    purple: "linear-gradient(135deg,#4f46e5,#7c3aed)",
    blue:   "linear-gradient(135deg,#2563eb,#1d4ed8)",
    green:  "linear-gradient(135deg,#059669,#047857)",
    orange: "linear-gradient(135deg,#d97706,#b45309)",
    pink:   "linear-gradient(135deg,#db2777,#9d174d)",
  };
  const gradient = PALETTE_GRADIENTS[data.palette||"purple"];

  return (
    <div style={{ display:"flex", justifyContent:"center", padding:24, background:"#111" }}>
      <div className="social-wrap" style={{ maxWidth:440 }}>
        {/* Background image with overlay */}
        <UImg category={data.imageCategory||"business"} idx={0}
          style={{ position:"absolute", inset:0, width:"100%", height:"100%", objectFit:"cover" }} />
        {/* Gradient overlay */}
        <div style={{ position:"absolute", inset:0, background: data.style==="gradient"? gradient : data.style==="dark"?"rgba(0,0,0,.75)":"rgba(0,0,0,.5)" }} />
        {/* Content */}
        <div className="social-overlay">
          <h2 className="social-headline">{data.headline}</h2>
          <p className="social-subtext">{data.subtext}</p>
          {data.cta && <span className="social-cta">{data.cta}</span>}
          <div className="social-hashtags">
            {(data.hashtags||[]).slice(0,5).map((h,i) => (
              <span key={i} className="social-tag">#{h}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── PHASE 5: INVOICE ──────────────────────────────────────────────────────────
function InvoiceTemplate({ data, design }) {
  const items    = data.items || [];
  const subtotal = items.reduce((s,i) => s + (i.quantity||0)*(i.rate||0), 0);
  const tax      = subtotal * ((data.tax_percent||0)/100);
  const total    = subtotal + tax;
  const fmt      = n => `₹${n.toLocaleString("en-IN")}`;

  return (
    <div className="invoice-wrap">
      <div className="invoice-header">
        <div>
          <div style={{ fontWeight:800, fontSize:"1.5rem", color:design.primary, marginBottom:4 }}>INVOICE</div>
          <div style={{ fontWeight:700, fontSize:"1rem", marginBottom:2 }}>{data.from?.company}</div>
          <div className="invoice-from">{data.from?.name}<br/>{data.from?.email}<br/>{data.from?.address}</div>
        </div>
        <div style={{ textAlign:"right" }}>
          <div style={{ fontWeight:700, fontSize:".85rem", marginBottom:8 }}>Bill To</div>
          <div className="invoice-to">{data.to?.company}<br/>{data.to?.name}<br/>{data.to?.email}<br/>{data.to?.address}</div>
        </div>
      </div>
      <div style={{ display:"flex", gap:24, marginBottom:24, fontSize:".83rem" }}>
        <div><span style={{color:"#888"}}>Invoice # </span><strong>{data.invoice_number}</strong></div>
        <div><span style={{color:"#888"}}>Date: </span><strong>{data.date}</strong></div>
        <div><span style={{color:"#888"}}>Due: </span><strong>{data.due_date}</strong></div>
      </div>
      <table className="invoice-items">
        <thead><tr>
          <th style={{width:"50%"}}>Description</th>
          <th style={{textAlign:"center"}}>Qty</th>
          <th style={{textAlign:"right"}}>Rate</th>
          <th style={{textAlign:"right"}}>Amount</th>
        </tr></thead>
        <tbody>
          {items.map((item,i) => (
            <tr key={i}>
              <td>{item.description}</td>
              <td style={{textAlign:"center"}}>{item.quantity}</td>
              <td style={{textAlign:"right"}}>{fmt(item.rate)}</td>
              <td style={{textAlign:"right"}}>{fmt((item.quantity||0)*(item.rate||0))}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ display:"flex", justifyContent:"flex-end" }}>
        <table className="invoice-totals">
          <tbody>
            <tr><td>Subtotal</td><td>{fmt(subtotal)}</td></tr>
            {data.tax_percent>0 && <tr><td>Tax ({data.tax_percent}%)</td><td>{fmt(tax)}</td></tr>}
            <tr className="invoice-total-row"><td><strong>Total</strong></td><td><strong style={{color:design.primary}}>{fmt(total)}</strong></td></tr>
          </tbody>
        </table>
      </div>
      {data.notes && (
        <div style={{ marginTop:32, padding:16, background:"#f8f8f8", borderRadius:8, fontSize:".78rem", color:"#555", whiteSpace:"pre-line" }}>
          <div style={{ fontWeight:700, marginBottom:6, fontSize:".7rem", textTransform:"uppercase", letterSpacing:".08em", color:"#888" }}>Notes</div>
          {data.notes}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTH SCREENS
// ─────────────────────────────────────────────────────────────────────────────
function AuthScreen({ onAuth }) {
  const [mode, setMode]         = useState("login"); // login | signup | forgot | reset
  const [name, setName]         = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [msg, setMsg]           = useState(null);

  const urlToken = new URLSearchParams(window.location.search).get("token");
  useEffect(() => { if (urlToken) { setToken(urlToken); setMode("reset"); } }, [urlToken]);

  async function submit() {
    setLoading(true); setMsg(null);
    try {
      if (mode === "login") {
        const r = await API.login(email, password);
        onAuth(r.user);
      } else if (mode === "signup") {
        const r = await API.signup(name, email, password);
        _setAuth(r.token, r.user);
        onAuth(r.user);
      } else if (mode === "forgot") {
        const r = await API.forgotPw(email);
        setMsg({ type:"ok", text: r.message });
      } else if (mode === "reset") {
        await API.resetPw(token, password);
        setMsg({ type:"ok", text: "Password reset! You can now log in." });
        setTimeout(() => setMode("login"), 2000);
      }
    } catch(e) {
      setMsg({ type:"err", text: e.message });
    }
    setLoading(false);
  }

  const titles = { login:"Welcome back", signup:"Create account", forgot:"Reset password", reset:"New password" };

  return (
    <div style={{ minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", background:"var(--bg)", padding:20 }}>
      <div style={{ background:"var(--bg2)", border:"1px solid var(--border2)", borderRadius:16, padding:32, width:"100%", maxWidth:380 }}>
        <div className="logo" style={{ justifyContent:"center", marginBottom:24 }}>Brand<em>Forge</em><sup>Studio</sup></div>
        <h2 style={{ textAlign:"center", fontWeight:700, fontSize:"1.1rem", marginBottom:20 }}>{titles[mode]}</h2>

        {msg && <div style={{ padding:"10px 14px", borderRadius:8, marginBottom:16, fontSize:".78rem", background:msg.type==="ok"?"rgba(16,185,129,.1)":"rgba(239,68,68,.1)", color:msg.type==="ok"?"#10B981":"#EF4444", border:`1px solid ${msg.type==="ok"?"rgba(16,185,129,.3)":"rgba(239,68,68,.3)"}` }}>{msg.text}</div>}

        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {mode==="signup" && <input className="field" style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:".82rem",fontFamily:"'Inter',sans-serif",outline:"none",width:"100%"}} placeholder="Full name" value={name} onChange={e=>setName(e.target.value)} />}
          {mode!=="reset" && <input className="field" style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:".82rem",fontFamily:"'Inter',sans-serif",outline:"none",width:"100%"}} placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} />}
          {(mode==="login"||mode==="signup"||mode==="reset") && <input className="field" style={{background:"var(--bg3)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 12px",color:"var(--text)",fontSize:".82rem",fontFamily:"'Inter',sans-serif",outline:"none",width:"100%"}} placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=>e.key==="Enter"&&submit()} />}
        </div>

        <button className="btn primary" style={{ width:"100%", justifyContent:"center", marginTop:16, padding:"10px" }} onClick={submit} disabled={loading}>
          {loading ? <Loader2 size={14} className="spinning" /> : {login:"Sign In",signup:"Create Account",forgot:"Send Reset Link",reset:"Set Password"}[mode]}
        </button>

        <div style={{ marginTop:14, textAlign:"center", fontSize:".72rem", color:"var(--text3)", display:"flex", flexDirection:"column", gap:6 }}>
          {mode==="login" && <>
            <button style={{background:"none",border:"none",color:"var(--accent2)",cursor:"pointer",fontSize:".72rem"}} onClick={()=>setMode("forgot")}>Forgot password?</button>
            <span>No account? <button style={{background:"none",border:"none",color:"var(--accent2)",cursor:"pointer",fontSize:".72rem"}} onClick={()=>setMode("signup")}>Sign up free</button></span>
          </>}
          {mode==="signup" && <span>Have an account? <button style={{background:"none",border:"none",color:"var(--accent2)",cursor:"pointer",fontSize:".72rem"}} onClick={()=>setMode("login")}>Sign in</button></span>}
          {(mode==="forgot"||mode==="reset") && <button style={{background:"none",border:"none",color:"var(--accent2)",cursor:"pointer",fontSize:".72rem"}} onClick={()=>setMode("login")}>← Back to login</button>}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────────────────────────────────────
export default function BrandForgeStudio() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [user, setUser] = useState(() => _getUser());

  // ── App state ───────────────────────────────────────────────────────────────
  const [activeType, setActiveType]     = useState("portfolio");
  const [activeTab, setActiveTab]       = useState("editor"); // editor | projects | pricing | admin
  const [device, setDevice]             = useState("desktop");
  const [sidebarOpen, setSidebarOpen]   = useState(false);
  const [sidebarTab, setSidebarTab]     = useState("content"); // content | design | assets | photos

  // ── Data with undo/redo ──────────────────────────────────────────────────────
  const DEFAULTS = {
    portfolio: defaultPortfolio, resume: defaultResume,
    business_card: defaultBizCard, presentation: defaultPresentation,
    social_post: defaultSocialPost, invoice: defaultInvoice,
  };
  const { current: data, set: setDataHistory, undo, redo, canUndo, canRedo } = useUndoRedo(DEFAULTS[activeType]());

  const [design, setDesign] = useState(DESIGN_DEFAULTS);

  // ── Projects ────────────────────────────────────────────────────────────────
  const [projects, setProjects]     = useState([]);
  const [projLoading, setProjLoading] = useState(false);
  const [currentProjId, setCurrentProjId] = useState(null);
  const [saving, setSaving]         = useState(false);

  // ── AI usage tracking ────────────────────────────────────────────────────────
  const [aiUsage, setAiUsage]       = useState(null);

  // ── Toast ───────────────────────────────────────────────────────────────────
  const [toast, setToast]           = useState(null);
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  // ── Upgrade modal ────────────────────────────────────────────────────────────
  const [upgradeModal, setUpgradeModal] = useState(false);

  const planKey = getPlanKey(user);
  const plan    = PLANS[planKey];

  // ── On mount ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) {
      preloadAllImages();
      loadProjects();
      API.aiUsage().then(setAiUsage).catch(() => {});
    }
  }, [user]);

  // ── PHASE 3: Keyboard shortcuts ─────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e) {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.key === "y" || (e.key === "z" && e.shiftKey))) { e.preventDefault(); redo(); }
      if (e.key === "s") { e.preventDefault(); handleSave(); }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [canUndo, canRedo, data]);

  // ── Set data helper (wraps undo history) ─────────────────────────────────────
  function setData(newData) { setDataHistory(newData); }
  function updateField(path, value) { setData(deepSet(data, path, value)); }

  // ── Change template type ──────────────────────────────────────────────────────
  function changeType(type) {
    setActiveType(type);
    setData(DEFAULTS[type]());
    setCurrentProjId(null);
  }

  // ── AI generation handler ─────────────────────────────────────────────────────
  async function handleGenerated(rawData) {
    setData({ ...rawData, imageCategory: rawData.imageCategory || "business" });
    // Reload AI usage
    API.aiUsage().then(setAiUsage).catch(() => {});
  }

  // ── Projects CRUD ─────────────────────────────────────────────────────────────
  async function loadProjects() {
    setProjLoading(true);
    try { const d = await API.getProjects(); setProjects(d.projects || []); }
    catch { showToast("Could not load projects"); }
    setProjLoading(false);
  }

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const payload = { type: activeType, data, thumbnail: null };
      let proj;
      if (currentProjId) {
        const r = await API.updateProject(currentProjId, payload);
        proj = r.project;
        setProjects(p => p.map(x => x.id === currentProjId ? proj : x));
        showToast("✓ Project saved");
      } else {
        const r = await API.saveProject(payload);
        proj = r.project;
        setProjects(p => [proj, ...p]);
        setCurrentProjId(proj.id);
        showToast("✓ Project created");
      }
    } catch(e) {
      if (e.upgrade) setUpgradeModal(true);
      else showToast(e.message || "Save failed");
    }
    setSaving(false);
  }

  async function loadProject(proj) {
    setActiveType(proj.type);
    setData(proj.data);
    setCurrentProjId(proj.id);
    setActiveTab("editor");
    showToast("Project loaded");
  }

  async function deleteProject(id) {
    await API.deleteProject(id);
    setProjects(p => p.filter(x => x.id !== id));
    if (currentProjId === id) { setCurrentProjId(null); }
    showToast("Project deleted");
  }

  // ── Export ────────────────────────────────────────────────────────────────────
  async function handleExport(format) {
    if (!plan.export) { setUpgradeModal(true); return; }
    if (format === "html") {
      const el = document.querySelector(".canvas-inner");
      if (!el) return;
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${data.name||"BrandForge"}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Cormorant+Garamond:wght@400;700&display=swap" rel="stylesheet"></head><body style="margin:0">${el.innerHTML}</body></html>`;
      downloadBlob(new Blob([html], {type:"text/html"}), `${data.name||"design"}.html`);
      showToast("✓ HTML exported");
    }
  }

  // ── Payments ──────────────────────────────────────────────────────────────────
  async function handleUpgrade(targetPlan) {
    if (!user) return;
    const loaded = await loadRazorpayScript();
    if (!loaded) { showToast("Payment gateway failed to load"); return; }
    try {
      const { order, key } = await API.createOrder(targetPlan);
      const rzp = new window.Razorpay({
        key, amount: order.amount, currency:"INR",
        name:"BrandForge Studio", description:`Upgrade to ${targetPlan}`,
        order_id: order.id,
        handler: async (resp) => {
          const r = await API.verifyPayment(resp.razorpay_order_id, resp.razorpay_payment_id, resp.razorpay_signature);
          _setAuth(_getToken(), r.user);
          setUser(r.user);
          setUpgradeModal(false);
          showToast(`🎉 Upgraded to ${targetPlan}!`);
        },
        prefill: { name:user.name, email:user.email },
        theme: { color:"#6366F1" },
      });
      rzp.open();
    } catch(e) { showToast(e.message || "Payment error"); }
  }

  // ── Logout ────────────────────────────────────────────────────────────────────
  function logout() { _clearAuth(); setUser(null); setProjects([]); }

  // ── If not logged in ──────────────────────────────────────────────────────────
  if (!user) {
    return (
      <>
        <style>{CSS}</style>
        <AuthScreen onAuth={u => { setUser(u); }} />
      </>
    );
  }

  // ── Design system CSS vars ────────────────────────────────────────────────────
  const dsVars = {
    "--ds-primary":    design.primary,
    "--ds-font-head":  design.fontHeading,
    "--ds-font-body":  design.fontBody,
    "--ds-ls":         `${design.letterSpacing||0}em`,
    "--ds-lh":         design.lineHeight || "1.6",
    "--ds-align":      design.textAlign || "left",
    "--ds-radius":     `${design.borderRadius}px`,
  };

  // ── Render preview ────────────────────────────────────────────────────────────
  function renderPreview() {
    const props = { data, design };
    switch(activeType) {
      case "portfolio":     return <PortfolioTemplate {...props} />;
      case "resume":        return <ResumeTemplate {...props} />;
      case "business_card": return <BizCardTemplate {...props} />;
      case "presentation":  return <PresentationTemplate {...props} />;
      case "social_post":   return <SocialPostTemplate {...props} />;
      case "invoice":       return <InvoiceTemplate {...props} />;
      default: return <div style={{padding:40,color:"var(--text3)"}}>Select a template type</div>;
    }
  }

  // ── Render content sidebar ────────────────────────────────────────────────────
  function renderContentSidebar() {
    const setField = (path, value) => updateField(path, value);
    switch(activeType) {
      case "portfolio":     return <PortfolioSidebar data={data} set={setField} />;
      case "resume":        return <ResumeSidebar data={data} set={setField} />;
      case "business_card": return <BizCardSidebar data={data} set={setField} />;
      case "social_post":   return <SocialSidebar data={data} set={setField} />;
      case "invoice":       return <InvoiceSidebar data={data} set={setField} />;
      case "presentation":  return <div style={{padding:"8px 14px",color:"var(--text3)",fontSize:".72rem"}}>Use AI generator to create slides, or edit them inline in the preview.</div>;
      default: return null;
    }
  }

  return (
    <>
      <style>{CSS}</style>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}.spinning{animation:spin .7s linear infinite}`}</style>
      {toast && <div className="toast">{toast}</div>}

      {/* Upgrade modal */}
      {upgradeModal && (
        <div className="modal-backdrop" onClick={() => setUpgradeModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <button style={{position:"absolute",top:12,right:12,background:"none",border:"none",color:"var(--text2)",cursor:"pointer"}} onClick={() => setUpgradeModal(false)}><X size={16}/></button>
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:1.6+"rem", marginBottom:8 }}>🚀</div>
              <h3 style={{ fontWeight:700, marginBottom:6 }}>Upgrade to Pro</h3>
              <p style={{ color:"var(--text3)", fontSize:".82rem" }}>Unlock unlimited AI, exports, deployments, and more.</p>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {["pro","enterprise"].map(p => (
                <button key={p} className="btn primary" style={{justifyContent:"center",padding:"12px",flexDirection:"column",gap:4}}
                  onClick={() => handleUpgrade(p)}>
                  <span style={{fontWeight:800}}>{p==="pro"?"Pro":"Enterprise"}</span>
                  <span style={{fontSize:".65rem",opacity:.8}}>{p==="pro"?"₹499/mo":"₹1,999/mo"}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`app${sidebarOpen?" sidebar-open":""}`} style={dsVars}>
        {/* ── TOPBAR ── */}
        <header className="topbar">
          <button className="btn icon" style={{marginRight:8,display:"flex"}} onClick={() => setSidebarOpen(o=>!o)}>
            <Menu size={14}/>
          </button>
          <div className="logo">Brand<em>Forge</em><sup>Studio</sup></div>

          <nav className="tabs">
            {[
              { id:"editor", label:"Editor", icon:<Pencil size={11}/> },
              { id:"projects", label:"Projects", icon:<FolderOpen size={11}/> },
              { id:"pricing", label:"Pricing", icon:<CreditCard size={11}/> },
              ...(user.is_admin ? [{ id:"admin", label:"Admin", icon:<Shield size={11}/> }] : []),
            ].map(t => (
              <button key={t.id} className={`tab${activeTab===t.id?" active":""}`} onClick={() => setActiveTab(t.id)}>
                {t.icon}<span>{t.label}</span>
              </button>
            ))}
          </nav>

          <div className="acts">
            {/* Undo/Redo */}
            <button className="btn undo" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><RotateCcw size={12}/></button>
            <button className="btn undo" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)"><RotateCw size={12}/></button>
            {/* Save */}
            <button className={`btn save${saving?" saving":""}`} onClick={handleSave} disabled={saving}>
              {saving?<Loader2 size={11} className="spinning"/>:<Save size={11}/>}
              <span>{saving?"Saving…":"Save"}</span>
            </button>
            {/* Export */}
            <button className="btn" onClick={() => handleExport("html")}><Download size={11}/><span>Export</span></button>
            {/* User */}
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 8px", borderRadius:7, background:"var(--bg3)", fontSize:".7rem" }}>
              <div style={{ width:22,height:22,borderRadius:"50%",background:"var(--accent)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".6rem",fontWeight:700,color:"#fff" }}>
                {user.name[0].toUpperCase()}
              </div>
              <span style={{color:"var(--text2)"}}>{planKey}</span>
              {planKey==="starter" && <button className="btn ai" style={{padding:"2px 8px",fontSize:".6rem"}} onClick={() => setUpgradeModal(true)}>↑ Pro</button>}
            </div>
            <button className="btn icon" onClick={logout} title="Logout"><LogOut size={12}/></button>
          </div>
        </header>

        {/* ── SIDEBAR ── */}
        <aside className={`sidebar${sidebarOpen?" open":""}`}>
          {activeTab === "editor" && (
            <>
              {/* Template type picker */}
              <SidebarSection title="Template Type" defaultOpen={true}>
                <div className="tpl-grid">
                  {TEMPLATE_TYPES.map(t => (
                    <div key={t.id} className={`tpl-card${activeType===t.id?" active":""}`}
                      onClick={() => { if(t.premium && !plan.premiumTemplates) { setUpgradeModal(true); return; } changeType(t.id); }}>
                      <span className="tpl-icon">{t.icon}</span>
                      <span className="tpl-label">{t.label}</span>
                      <span className="tpl-desc">{t.desc}</span>
                      {t.premium && <span className="tpl-badge">Pro</span>}
                    </div>
                  ))}
                </div>
              </SidebarSection>

              {/* Sidebar tabs: Content / Design / Assets / Photos */}
              <div style={{ display:"flex", borderBottom:"1px solid var(--border)" }}>
                {[
                  { id:"content", icon:<FileText size={10}/>, label:"Content" },
                  { id:"design",  icon:<Palette size={10}/>,  label:"Design" },
                  { id:"assets",  icon:<ImagePlus size={10}/>,label:"Assets" },
                  { id:"photos",  icon:<Search size={10}/>,   label:"Photos" },
                ].map(t => (
                  <button key={t.id} className={`tab${sidebarTab===t.id?" active":""}`}
                    style={{flex:1,justifyContent:"center",borderRadius:0,fontSize:".6rem"}}
                    onClick={() => setSidebarTab(t.id)}>
                    {t.icon}<span style={{display:"none"}}>{t.label}</span>
                  </button>
                ))}
              </div>

              {/* AI Generator */}
              <AIPanel activeType={activeType} onGenerated={handleGenerated} aiUsage={aiUsage} />

              {/* Tab content */}
              {sidebarTab === "content" && renderContentSidebar()}
              {sidebarTab === "design" && <DesignControls design={design} onChange={(k,v) => setDesign(d => ({...d,[k]:v}))} />}
              {sidebarTab === "assets" && (
                <div style={{padding:"0 14px 12px"}}>
                  <AssetLibraryPanel onInsertImage={(url) => {
                    // Insert image URL into current data where applicable
                    if (data.projects?.length > 0) updateField("projects.0.image", url);
                    else if (data.image !== undefined) updateField("image", url);
                    showToast("✓ Image inserted");
                  }} />
                </div>
              )}
              {sidebarTab === "photos" && (
                <div style={{padding:"0 14px 12px"}}>
                  <div style={{fontSize:".65rem",color:"var(--text3)",marginBottom:6}}>Search Unsplash stock photos</div>
                  <StockPhotoSearch onInsertImage={(url) => {
                    if (data.imageCategory !== undefined) updateField("imageCategory", "custom");
                    showToast("✓ Image inserted — adjust via 'Image Category' in content panel");
                  }} />
                </div>
              )}
            </>
          )}

          {/* Projects tab */}
          {activeTab === "projects" && (
            <div style={{padding:14}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <span style={{fontWeight:700,fontSize:".75rem"}}>Your Projects</span>
                <button className="btn" style={{fontSize:".65rem",padding:"4px 8px"}} onClick={loadProjects}>
                  <RefreshCw size={10}/>
                </button>
              </div>
              {projLoading ? <SkeletonCard /> : projects.length === 0 ? (
                <div style={{textAlign:"center",padding:"32px 0",color:"var(--text3)",fontSize:".75rem"}}>
                  No projects yet.<br/>Create something in the Editor tab.
                </div>
              ) : (
                projects.map(p => (
                  <div key={p.id} className="item-block" style={{cursor:"pointer"}} onClick={() => loadProject(p)}>
                    <div className="item-hd">
                      <span style={{fontWeight:600,fontSize:".78rem",color:"#fff"}}>{p.title||"Untitled"}</span>
                      <button style={{background:"none",border:"none",color:"var(--red)",cursor:"pointer"}}
                        onClick={e=>{e.stopPropagation();deleteProject(p.id)}}><Trash2 size={11}/></button>
                    </div>
                    <div style={{fontSize:".65rem",color:"var(--text3)"}}>{p.type} · {new Date(p.updated_at).toLocaleDateString()}</div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Pricing tab */}
          {activeTab === "pricing" && (
            <div style={{padding:14}}>
              {[
                { id:"starter",    name:"Starter",    price:"Free",     features:["3 projects","3 AI generations","HTML export","10 asset uploads"] },
                { id:"pro",        name:"Pro",         price:"₹499/mo",  features:["50 projects","Unlimited AI","All exports","Deploy","200 asset uploads"] },
                { id:"enterprise", name:"Enterprise",  price:"₹1,999/mo",features:["Unlimited everything","White-label","Priority support"] },
              ].map(p => (
                <div key={p.id} className="item-block" style={{marginBottom:10,borderColor:planKey===p.id?"var(--accent)":"var(--border)"}}>
                  <div style={{fontWeight:700,marginBottom:2}}>{p.name}</div>
                  <div style={{color:"var(--accent2)",fontWeight:600,fontSize:".85rem",marginBottom:8}}>{p.price}</div>
                  {p.features.map((f,i) => <div key={i} style={{fontSize:".7rem",color:"var(--text3)",marginBottom:3}}>✓ {f}</div>)}
                  {planKey!==p.id && p.id!=="starter" && (
                    <button className="btn primary" style={{width:"100%",justifyContent:"center",marginTop:8,fontSize:".7rem"}}
                      onClick={() => handleUpgrade(p.id)}>Upgrade to {p.name}</button>
                  )}
                  {planKey===p.id && <div style={{fontSize:".65rem",color:"var(--green)",marginTop:6}}>✓ Current plan</div>}
                </div>
              ))}
            </div>
          )}

          {/* Admin tab */}
          {activeTab === "admin" && user.is_admin && <AdminPanel />}
        </aside>

        {/* ── MAIN CANVAS ── */}
        <main className="main">
          {/* Preview bar */}
          <div className="preview-bar">
            <span className="prev-label">Preview</span>
            <div className="device-btns">
              {[
                { id:"desktop", icon:<Monitor size={12}/> },
                { id:"tablet",  icon:<Tablet size={12}/> },
                { id:"mobile",  icon:<Smartphone size={12}/> },
              ].map(d => (
                <button key={d.id} className={`btn icon${device===d.id?" active":""}`}
                  onClick={() => setDevice(d.id)}>{d.icon}</button>
              ))}
            </div>
            {canUndo && <span style={{fontSize:".6rem",color:"var(--text3)"}}>Ctrl+Z to undo</span>}
          </div>

          {/* Canvas */}
          <div className="canvas-wrap">
            <div className={`canvas-inner${device==="mobile"?" mobile":device==="tablet"?" tablet":""}`}
              style={dsVars}>
              {renderPreview()}
            </div>
          </div>
        </main>
      </div>

      {/* Mobile sidebar toggle */}
      <button className="sidebar-toggle" onClick={() => setSidebarOpen(o=>!o)}>
        <Menu size={18}/>
      </button>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN PANEL
// ─────────────────────────────────────────────────────────────────────────────
function AdminPanel() {
  const [stats, setStats]   = useState(null);
  const [users, setUsers]   = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([API.adminStats(), API.adminUsers()])
      .then(([s, u]) => { setStats(s); setUsers(u.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function changePlan(id, plan) {
    await API.updatePlan(id, plan);
    setUsers(u => u.map(x => x.id === id ? {...x, plan} : x));
  }

  if (loading) return <div style={{padding:14}}><SkeletonCard /></div>;

  return (
    <div style={{padding:14}}>
      <div style={{fontWeight:700,marginBottom:12,fontSize:".8rem"}}>Admin Dashboard</div>
      {stats && (
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}}>
          {[
            { label:"Total Users",    val: stats.users?.total },
            { label:"Pro Users",      val: stats.users?.pro },
            { label:"Total Projects", val: stats.projects?.total },
            { label:"Revenue (INR)",  val: `₹${(stats.payments?.revenue||0).toLocaleString()}` },
            { label:"AI Generations", val: stats.ai?.total },
            { label:"AI Tokens",      val: (stats.ai?.tokens||0).toLocaleString() },
          ].map((s,i) => (
            <div key={i} style={{background:"var(--bg3)",borderRadius:8,padding:"8px 10px"}}>
              <div style={{fontSize:".55rem",color:"var(--text3)",textTransform:"uppercase",letterSpacing:".06em"}}>{s.label}</div>
              <div style={{fontWeight:700,fontSize:"1rem",color:"#fff"}}>{s.val}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{fontWeight:600,fontSize:".72rem",marginBottom:8,color:"var(--text2)"}}>Users ({users.length})</div>
      {users.map(u => (
        <div key={u.id} className="item-block" style={{marginBottom:6}}>
          <div style={{fontWeight:600,fontSize:".75rem",color:"#fff"}}>{u.name}</div>
          <div style={{fontSize:".65rem",color:"var(--text3)",marginBottom:6}}>{u.email}</div>
          <div style={{display:"flex",gap:4}}>
            {["starter","pro","enterprise"].map(p => (
              <button key={p} className={`btn${u.plan===p?" primary":""}`}
                style={{flex:1,justifyContent:"center",fontSize:".6rem",padding:"3px 4px"}}
                onClick={() => changePlan(u.id, p)}>{p}</button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
