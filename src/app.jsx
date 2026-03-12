// Portfolio Advisor — Multi-cartera para asesores financieros
// Fuentes: CoinGecko, Yahoo Finance, Bluelytics/BCRA

const { useState, useEffect, useCallback, useRef } = React;
const { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } = Recharts;

// ── Storage (localStorage para versión web) ───────────────────────────────────
const SK_P = "adv-portfolios-v1";
const SK_H = "adv-history-v1";
const store = {
  get: (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  bg:"#f7f6f2", sur:"#ffffff", bor:"#e8e5df", borD:"#d4cfc7",
  ink:"#1a1815", inkM:"#6b6560", inkL:"#a09a93",
  gr:"#1a7a4a", grB:"#edf7f1", grBo:"#b8dfc9",
  ye:"#a07010", yeB:"#fdf8ec", yeBo:"#e8d48a",
  re:"#b52a2a", reB:"#fdf0f0", reBo:"#e8aaaa",
  ac:"#2a4fd4", acB:"#eef1fc", go:"#c9973a",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=DM+Sans:wght@400;500;600&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html, body, #root { height: 100%; }
  body { background: ${T.bg}; color: ${T.ink}; font-family: 'DM Sans', sans-serif; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-track { background: ${T.bg}; }
  ::-webkit-scrollbar-thumb { background: ${T.borD}; border-radius: 3px; }
  .mono { font-family: 'IBM Plex Mono', monospace !important; }
  .serif { font-family: 'Playfair Display', serif !important; }
  input, select, textarea {
    font-family: 'DM Sans', sans-serif;
    background: #fff; border: 1px solid ${T.bor};
    color: ${T.ink}; border-radius: 6px;
    padding: 8px 11px; font-size: 13px;
    outline: none; width: 100%;
    transition: border-color .15s;
  }
  input:focus, select:focus, textarea:focus { border-color: ${T.ac}; }
  button { cursor: pointer; font-family: 'DM Sans', sans-serif; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  .fu { animation: fadeUp .3s ease both; }
  .pulse { animation: pulse 2s infinite; }
  .card-hover { transition: box-shadow .2s, border-color .2s; }
  .card-hover:hover { border-color: ${T.borD} !important; box-shadow: 0 4px 20px rgba(0,0,0,.06); }
`;

// ── Tipos de activos ──────────────────────────────────────────────────────────
const TYPES = [
  { id:"crypto",    l:"Crypto",    c:"#e67e22" },
  { id:"us_stock",  l:"US Equity", c:"#2980b9" },
  { id:"cedear",    l:"CEDEAR",    c:"#8e44ad" },
  { id:"arg_stock", l:"Acción AR", c:"#c0392b" },
  { id:"arg_bond",  l:"Bono AR",   c:"#27ae60" },
  { id:"fci_usd",   l:"FCI/USD",   c:"#16a085" },
];
const PROFILES = ["Conservador","Moderado","Balanceado","Dinámico","Agresivo"];
const ti = id => TYPES.find(t => t.id === id) || TYPES[0];

// ── Semáforo ──────────────────────────────────────────────────────────────────
const LC = {
  green:  { c:T.gr,   bg:T.grB, bo:T.grBo, l:"En objetivo"    },
  yellow: { c:T.ye,   bg:T.yeB, bo:T.yeBo, l:"Atención"       },
  red:    { c:T.re,   bg:T.reB, bo:T.reBo, l:"Desvío crítico" },
  grey:   { c:T.inkL, bg:T.bg,  bo:T.bor,  l:"Sin datos"      },
};

// ── Fetch precios ─────────────────────────────────────────────────────────────
async function getPrice(a) {
  try {
    if (a.type === "crypto") {
      const map = { BTC:"bitcoin",ETH:"ethereum",BNB:"binancecoin",SOL:"solana",ADA:"cardano",USDT:"tether",USDC:"usd-coin",XRP:"ripple" };
      const id = map[a.ticker?.toUpperCase()] || a.ticker?.toLowerCase();
      const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`);
      const d = await r.json();
      if (d[id]) return { p: d[id].usd, ch: d[id].usd_24h_change || 0, src:"CoinGecko" };
    }
    if (["us_stock","cedear"].includes(a.type)) {
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(a.ticker)}?interval=1d&range=5d`);
      const d = await r.json();
      const q = d?.chart?.result?.[0];
      if (q) {
        const c = q.indicators?.quote?.[0]?.close?.filter(Boolean);
        const p = c?.at(-1), pv = c?.at(-2) || p;
        return { p, ch: pv ? ((p-pv)/pv)*100 : 0, src:"Yahoo Finance" };
      }
    }
    if (["arg_stock","arg_bond"].includes(a.type)) {
      const tk = a.ticker?.toUpperCase().replace(".BA","");
      const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${tk}.BA?interval=1d&range=5d`);
      const d = await r.json();
      const q = d?.chart?.result?.[0];
      if (q) {
        const c = q.indicators?.quote?.[0]?.close?.filter(Boolean);
        const p = c?.at(-1), pv = c?.at(-2) || p;
        return { p, ch: pv ? ((p-pv)/pv)*100 : 0, src:"BYMA/Yahoo" };
      }
    }
    if (a.type === "fci_usd") {
      const r = await fetch("https://api.bluelytics.com.ar/v2/latest");
      const d = await r.json();
      return { p: d?.blue?.value_sell || d?.oficial?.value_sell || a.mp || 1, ch:0, src:"Bluelytics" };
    }
  } catch {}
  return { p: a.mp || 0, ch: 0, src:"Manual" };
}

// ── Cálculos TEA ─────────────────────────────────────────────────────────────
const teaF = (tea, d) => Math.pow(1 + tea/100, d/365);

function trafficLight(rp, tea, el) {
  if (el <= 0) return "grey";
  const exp = (teaF(tea, el) - 1) * 100;
  const d = rp - exp;
  return d >= -2 ? "green" : d >= -8 ? "yellow" : "red";
}

// ── Formatters ────────────────────────────────────────────────────────────────
const fU = n => n != null ? `$${Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}` : "—";
const fP = (n, s=true) => n != null ? `${s&&n>=0?"+":""}${n.toFixed(2)}%` : "—";
const fD = d => d ? new Date(d).toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"numeric"}) : "—";
const fT = d => d ? d.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}) : "—";

// ── Tooltip del gráfico ───────────────────────────────────────────────────────
function TTip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:"#fff",border:`1px solid ${T.bor}`,borderRadius:8,padding:"9px 13px",fontSize:12,boxShadow:"0 4px 16px rgba(0,0,0,.06)"}}>
      <div style={{color:T.inkM,marginBottom:5}}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{color:p.color,display:"flex",gap:7,marginBottom:2}}>
          <span style={{fontWeight:600}}>{p.name}:</span>
          <span className="mono">{p.value != null ? `${p.value>=0?"+":""}${Number(p.value).toFixed(2)}%` : "—"}</span>
        </div>
      ))}
    </div>
  );
}

// ── App principal ─────────────────────────────────────────────────────────────
function App() {
  const [ports, setPorts]   = useState(() => store.get(SK_P) || []);
  const [prices, setPrices] = useState({});
  const [hist, setHist]     = useState(() => store.get(SK_H) || {});
  const [view, setView]     = useState("overview");
  const [aid, setAid]       = useState(null);
  const [loading, setLoading] = useState(false);
  const [sync, setSync]     = useState(null);
  const [np, setNp]         = useState({ name:"",client:"",profile:"Moderado",tea:"",startDate:new Date().toISOString().slice(0,10),endDate:"",notes:"" });
  const [na, setNa]         = useState({ name:"",ticker:"",type:"crypto",qty:"",cost:"",mp:"" });
  const [err, setErr]       = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const tmr = useRef(null);

  // Guardar en localStorage
  useEffect(() => { store.set(SK_P, ports); }, [ports]);
  useEffect(() => { store.set(SK_H, hist); }, [hist]);

  // Refresh precios
  const refresh = useCallback(async () => {
    const all = ports.flatMap(p => p.assets || []);
    if (!all.length) return;
    setLoading(true);
    const res = {};
    await Promise.all(all.map(async a => { res[a.id] = await getPrice(a); }));
    setPrices(res);

    // Snapshot diario
    const today = new Date().toISOString().slice(0,10);
    setHist(prev => {
      const next = { ...prev };
      ports.forEach(port => {
        const assets = port.assets || [];
        const tv = assets.reduce((s,a) => s + (res[a.id]?.p || a.mp || 0) * a.qty, 0);
        const tc = assets.reduce((s,a) => s + a.cost * a.qty, 0);
        const rp = tc ? ((tv-tc)/tc)*100 : 0;
        if (!next[port.id]) next[port.id] = [];
        const ex = next[port.id].find(s => s.date === today);
        if (!ex) next[port.id] = [...next[port.id].slice(-89), { date:today, real:parseFloat(rp.toFixed(3)) }];
        else next[port.id] = next[port.id].map(s => s.date === today ? {...s, real:parseFloat(rp.toFixed(3))} : s);
      });
      return next;
    });
    setSync(new Date());
    setLoading(false);
  }, [ports]);

  useEffect(() => {
    clearInterval(tmr.current);
    if (ports.length) {
      refresh();
      tmr.current = setInterval(refresh, 90000);
    }
    return () => clearInterval(tmr.current);
  }, [ports.length]); // eslint-disable-line

  // Calcular métricas de una cartera
  function calc(port) {
    const assets = port.assets || [];
    const en = assets.map(a => {
      const price = prices[a.id]?.p || a.mp || 0;
      return { ...a, price, value: price * a.qty, costT: a.cost * a.qty, ch: prices[a.id]?.ch || 0, src: prices[a.id]?.src };
    });
    const tv   = en.reduce((s,a) => s + a.value, 0);
    const tc   = en.reduce((s,a) => s + a.costT, 0);
    const rp   = tc ? ((tv-tc)/tc)*100 : 0;
    const gain = tv - tc;
    const s    = new Date(port.startDate), e = new Date(port.endDate), now = new Date();
    const el   = Math.max(0, (now-s)/86400000);
    const tot  = Math.max(1, (e-s)/86400000);
    const prog = Math.min(1, el/tot);
    const tea  = parseFloat(port.tea) || 0;
    const tNow = (teaF(tea, el) - 1) * 100;
    const tEnd = (teaF(tea, tot) - 1) * 100;
    const delta = rp - tNow;
    const lc   = trafficLight(rp, tea, el);

    // Curva objetivo
    const pts = 50, curve = [];
    for (let i = 0; i <= pts; i++) {
      const d  = tot * i / pts;
      const dt = new Date(s.getTime() + d * 86400000);
      curve.push({ day:Math.round(d), date:dt.toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit"}), target:parseFloat(((teaF(tea,d)-1)*100).toFixed(3)), isPast:dt<=now });
    }
    const snaps = hist[port.id] || [];
    const chartData = curve.map(pt => {
      const dt   = new Date(s.getTime() + pt.day * 86400000);
      const snap = snaps.find(x => Math.abs((new Date(x.date)-dt)/86400000) < 1);
      return { ...pt, real: snap?.real != null ? snap.real : (pt.day === 0 ? 0 : undefined) };
    });
    return { en, tv, tc, rp, gain, el, tot, prog, tea, tNow, tEnd, delta, lc, chartData, daysLeft:Math.max(0,tot-el) };
  }

  // Crear cartera
  function createPort() {
    const { name, client, tea, startDate, endDate } = np;
    if (!name||!client||!tea||!startDate||!endDate) { setErr("Completá todos los campos."); return; }
    if (new Date(endDate) <= new Date(startDate)) { setErr("La fecha fin debe ser posterior al inicio."); return; }
    const port = { id: crypto.randomUUID(), ...np, tea: parseFloat(tea), assets:[], createdAt: new Date().toISOString() };
    setPorts(p => [...p, port]);
    setNp({ name:"",client:"",profile:"Moderado",tea:"",startDate:new Date().toISOString().slice(0,10),endDate:"",notes:"" });
    setErr(""); setAid(port.id); setView("portfolio");
  }

  // Agregar activo
  function addAsset() {
    const { name, ticker, type, qty, cost } = na;
    if (!name||!ticker||!qty||!cost) { setErr("Completá los campos obligatorios."); return; }
    const asset = { id:crypto.randomUUID(), name, ticker:ticker.toUpperCase(), type, qty:parseFloat(qty), cost:parseFloat(cost), mp:parseFloat(na.mp)||0 };
    setPorts(prev => prev.map(p => p.id === aid ? {...p, assets:[...(p.assets||[]),asset]} : p));
    setNa({ name:"",ticker:"",type:"crypto",qty:"",cost:"",mp:"" });
    setErr(""); setView("portfolio");
  }

  const remAsset = (pid, aid2) => setPorts(prev => prev.map(p => p.id === pid ? {...p, assets:(p.assets||[]).filter(a => a.id !== aid2)} : p));
  const delPort  = id => { setPorts(p => p.filter(x => x.id !== id)); setView("overview"); };

  const aport = ports.find(p => p.id === aid);
  const am    = aport ? calc(aport) : null;

  const Lbl = ({children}) => <label style={{fontSize:12,color:T.inkM,fontWeight:600,display:"block",marginBottom:5}}>{children}</label>;

  const navTo = (v, id=null) => { if(id) setAid(id); setView(v); setMenuOpen(false); };

  // ── RENDER ────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{CSS}</style>
      <div style={{display:"flex",height:"100vh",overflow:"hidden",background:T.bg}}>

        {/* ── SIDEBAR (desktop) ── */}
        <aside style={{width:220,background:T.sur,borderRight:`1px solid ${T.bor}`,display:"flex",flexDirection:"column",flexShrink:0,position:"relative",zIndex:10}}>
          <div style={{padding:"22px 18px 16px",borderBottom:`1px solid ${T.bor}`}}>
            <div className="serif" style={{fontSize:18,fontWeight:700,lineHeight:1.25,color:T.ink}}>Portfolio<br/><span style={{color:T.ac}}>Advisor</span></div>
            <div style={{fontSize:9,color:T.inkL,marginTop:4,letterSpacing:".1em",fontWeight:600}}>GESTIÓN MULTI-CARTERA</div>
          </div>

          <nav style={{flex:1,padding:"12px 10px",overflowY:"auto"}}>
            <button onClick={() => navTo("overview")} style={{width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:6,border:"none",background:view==="overview"?T.acB:"transparent",color:view==="overview"?T.ac:T.inkM,fontWeight:600,fontSize:13,marginBottom:6}}>
              ◈ Vista general
            </button>

            <div style={{fontSize:9,color:T.inkL,letterSpacing:".1em",padding:"8px 10px 5px",fontWeight:600}}>CARTERAS</div>

            {ports.map(p => {
              const m  = calc(p);
              const lc = LC[m.lc];
              const isA = view === "portfolio" && aid === p.id;
              return (
                <button key={p.id} onClick={() => navTo("portfolio", p.id)} style={{width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:6,border:"none",background:isA?lc.bg:"transparent",color:T.ink,fontSize:12,marginBottom:2,display:"flex",alignItems:"center",gap:7,transition:"background .15s"}}>
                  <span style={{color:lc.c,fontSize:9,flexShrink:0}}>●</span>
                  <div style={{flex:1,overflow:"hidden"}}>
                    <div style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.name}</div>
                    <div style={{fontSize:10,color:T.inkL,marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{p.client}</div>
                  </div>
                </button>
              );
            })}

            <button onClick={() => { setErr(""); navTo("new-portfolio"); }} style={{width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:6,border:`1px dashed ${T.borD}`,background:"transparent",color:T.inkM,fontSize:12,marginTop:8,fontWeight:500}}>
              + Nueva cartera
            </button>
          </nav>

          <div style={{padding:"10px 14px",borderTop:`1px solid ${T.bor}`,fontSize:10,color:T.inkL,display:"flex",alignItems:"center",gap:6}}>
            <span className="pulse" style={{width:6,height:6,borderRadius:"50%",background:loading?T.go:T.gr,display:"inline-block",flexShrink:0}}/>
            {loading ? "Actualizando…" : `Sync ${fT(sync)}`}
            {!loading && ports.length > 0 && <button onClick={refresh} style={{marginLeft:"auto",background:"none",border:"none",color:T.inkL,fontSize:12,padding:0}}>↻</button>}
          </div>
        </aside>

        {/* ── MAIN ── */}
        <main style={{flex:1,overflowY:"auto",background:T.bg}}>

          {/* ══════ OVERVIEW ══════ */}
          {view === "overview" && (
            <div style={{padding:"32px 36px"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",marginBottom:6}}>
                <div>
                  <h1 className="serif" style={{fontSize:28,fontWeight:700,color:T.ink}}>Vista General</h1>
                  <p style={{color:T.inkM,fontSize:14,marginTop:3}}>{ports.length} {ports.length===1?"cartera":"carteras"} activas</p>
                </div>
                <div style={{fontSize:11,color:T.inkL,textAlign:"right"}}>
                  {new Date().toLocaleDateString("es-AR",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}
                </div>
              </div>

              <div style={{height:1,background:T.bor,margin:"20px 0"}}/>

              {ports.length === 0 ? (
                <div style={{textAlign:"center",padding:"80px 0"}}>
                  <div className="serif" style={{fontSize:56,color:T.borD,marginBottom:14}}>◈</div>
                  <div style={{fontSize:16,fontWeight:600,color:T.inkM,marginBottom:6}}>Todavía no hay carteras</div>
                  <div style={{fontSize:13,color:T.inkL,marginBottom:24}}>Creá la primera desde el panel lateral</div>
                  <button onClick={() => { setErr(""); navTo("new-portfolio"); }} style={{padding:"11px 24px",borderRadius:8,border:"none",background:T.ink,color:"#fff",fontSize:14,fontWeight:600}}>
                    + Nueva cartera
                  </button>
                </div>
              ) : (
                <>
                  {/* KPIs globales */}
                  {(() => {
                    const all   = ports.map(p => calc(p));
                    const aum   = all.reduce((s,m) => s + m.tv, 0);
                    const gain  = all.reduce((s,m) => s + m.gain, 0);
                    const greens = all.filter(m => m.lc === "green").length;
                    const reds   = all.filter(m => m.lc === "red").length;
                    return (
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:28}}>
                        {[
                          {l:"AUM Total",       v:fU(aum),                            c:T.ink },
                          {l:"Ganancia Global", v:(gain>=0?"+":"")+fU(gain),          c:gain>=0?T.gr:T.re },
                          {l:"En objetivo",     v:`${greens} / ${ports.length}`,      c:T.gr },
                          {l:"Desvío crítico",  v:`${reds} / ${ports.length}`,        c:reds>0?T.re:T.inkM },
                        ].map((k,i) => (
                          <div key={i} className="fu" style={{background:T.sur,border:`1px solid ${T.bor}`,borderRadius:10,padding:"16px 18px",animationDelay:`${i*.06}s`}}>
                            <div style={{fontSize:9,color:T.inkL,fontWeight:600,letterSpacing:".09em",textTransform:"uppercase",marginBottom:8}}>{k.l}</div>
                            <div className="mono" style={{fontSize:22,fontWeight:500,color:k.c}}>{k.v}</div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}

                  {/* Cards */}
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}}>
                    {ports.map(port => {
                      const m  = calc(port);
                      const lc = LC[m.lc];
                      return (
                        <div key={port.id} className="fu card-hover" onClick={() => navTo("portfolio", port.id)}
                          style={{background:T.sur,border:`1px solid ${T.bor}`,borderRadius:12,padding:20,cursor:"pointer"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
                            <div>
                              <div style={{fontWeight:700,fontSize:15,color:T.ink}}>{port.name}</div>
                              <div style={{fontSize:11,color:T.inkM,marginTop:2}}>{port.client} · <span style={{background:T.bg,padding:"1px 6px",borderRadius:4}}>{port.profile}</span></div>
                            </div>
                            <div style={{background:lc.bg,border:`1px solid ${lc.bo}`,borderRadius:20,padding:"3px 10px",display:"flex",alignItems:"center",gap:5,flexShrink:0}}>
                              <span style={{color:lc.c,fontSize:8}}>●</span>
                              <span style={{color:lc.c,fontSize:11,fontWeight:600}}>{lc.l}</span>
                            </div>
                          </div>

                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}}>
                            {[
                              {l:"Valor",     v:fU(m.tv)},
                              {l:"Rentab.",   v:fP(m.rp), c:m.rp>=0?T.gr:T.re},
                              {l:"TEA obj.",  v:`${port.tea}%`},
                            ].map((x,i) => (
                              <div key={i} style={{background:T.bg,borderRadius:6,padding:"7px 9px"}}>
                                <div style={{fontSize:9,color:T.inkL,marginBottom:3}}>{x.l}</div>
                                <div className="mono" style={{fontSize:13,fontWeight:500,color:x.c||T.ink}}>{x.v}</div>
                              </div>
                            ))}
                          </div>

                          <div style={{fontSize:9,color:T.inkL,marginBottom:5,display:"flex",justifyContent:"space-between"}}>
                            <span>{fD(port.startDate)}</span>
                            <span>{Math.round(m.daysLeft)} días restantes</span>
                            <span>{fD(port.endDate)}</span>
                          </div>
                          <div style={{background:T.bg,borderRadius:4,height:5}}>
                            <div style={{background:lc.c,borderRadius:4,height:5,width:`${m.prog*100}%`,transition:"width 1s ease"}}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ══════ PORTFOLIO DETAIL ══════ */}
          {view === "portfolio" && aport && am && (() => {
            const port = aport, m = am, lc = LC[m.lc];
            return (
              <div style={{padding:"32px 36px"}}>
                {/* Header */}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}}>
                  <div>
                    <button onClick={() => navTo("overview")} style={{background:"none",border:"none",color:T.inkL,fontSize:12,padding:"0 0 6px",fontWeight:500}}>← Vista general</button>
                    <h1 className="serif" style={{fontSize:26,fontWeight:700,color:T.ink}}>{port.name}</h1>
                    <div style={{fontSize:13,color:T.inkM,marginTop:3}}>{port.client} · {port.profile} · TEA objetivo: <strong>{port.tea}%</strong></div>
                  </div>
                  <div style={{display:"flex",gap:8}}>
                    <button onClick={() => { setErr(""); navTo("add-asset"); }} style={{padding:"9px 16px",borderRadius:8,border:`1px solid ${T.bor}`,background:T.sur,color:T.ink,fontSize:13,fontWeight:600}}>+ Activo</button>
                    <button onClick={refresh} disabled={loading} style={{padding:"9px 14px",borderRadius:8,border:`1px solid ${T.bor}`,background:T.sur,color:T.inkM,fontSize:13}}>↻</button>
                    <button onClick={() => { if(confirm(`¿Eliminar "${port.name}"?`)) delPort(port.id); }} style={{padding:"9px 14px",borderRadius:8,border:`1px solid ${T.reBo}`,background:T.reB,color:T.re,fontSize:13,fontWeight:600}}>✕</button>
                  </div>
                </div>

                {/* Semáforo + KPIs */}
                <div style={{display:"grid",gridTemplateColumns:"140px 1fr 1fr 1fr",gap:12,marginBottom:18}}>
                  <div style={{background:lc.bg,border:`1px solid ${lc.bo}`,borderRadius:12,padding:"18px",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
                    <div style={{fontSize:34,color:lc.c,marginBottom:5}}>●</div>
                    <div style={{fontWeight:700,color:lc.c,fontSize:12,textAlign:"center"}}>{lc.l}</div>
                    <div className="mono" style={{fontSize:11,color:lc.c,marginTop:4,opacity:.8}}>{m.delta>=0?"+":""}{m.delta.toFixed(2)}pp</div>
                  </div>
                  {[
                    {l:"Valor actual",      v:fU(m.tv),    sub:`costo ${fU(m.tc)}`},
                    {l:"Rentabilidad real", v:fP(m.rp),    sub:`${m.gain>=0?"+":""} ${fU(m.gain)}`, c:m.rp>=0?T.gr:T.re},
                    {l:"Objetivo al venc.", v:fP(m.tEnd),  sub:`Día ${Math.round(m.el)} de ${Math.round(m.tot)}`},
                  ].map((k,i) => (
                    <div key={i} style={{background:T.sur,border:`1px solid ${T.bor}`,borderRadius:12,padding:"16px 20px"}}>
                      <div style={{fontSize:9,color:T.inkL,fontWeight:600,letterSpacing:".09em",marginBottom:7}}>{k.l}</div>
                      <div className="mono" style={{fontSize:22,fontWeight:500,color:k.c||T.ink}}>{k.v}</div>
                      <div style={{fontSize:11,color:T.inkL,marginTop:4}}>{k.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Barra progreso */}
                <div style={{background:T.sur,border:`1px solid ${T.bor}`,borderRadius:10,padding:"12px 18px",marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:T.inkL,marginBottom:6}}>
                    <span>{fD(port.startDate)}</span>
                    <span style={{fontWeight:600,color:T.ink}}>Progreso: {(m.prog*100).toFixed(0)}% · {Math.round(m.daysLeft)} días restantes</span>
                    <span>{fD(port.endDate)}</span>
                  </div>
                  <div style={{background:T.bg,borderRadius:5,height:6}}>
                    <div style={{background:lc.c,borderRadius:5,height:6,width:`${m.prog*100}%`,transition:"width 1s ease"}}/>
                  </div>
                </div>

                {/* Gráfico */}
                <div style={{background:T.sur,border:`1px solid ${T.bor}`,borderRadius:12,padding:"18px 16px 10px",marginBottom:16}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
                    <div>
                      <div style={{fontWeight:700,fontSize:14}}>Trayectoria real vs objetivo</div>
                      <div style={{fontSize:11,color:T.inkL,marginTop:2}}>Rentabilidad acumulada · TEA {port.tea}%</div>
                    </div>
                    <div style={{display:"flex",gap:14,fontSize:11,color:T.inkM}}>
                      <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:18,height:2,background:T.ac,display:"inline-block"}}/> Real</span>
                      <span style={{display:"flex",alignItems:"center",gap:5}}><span style={{width:18,height:2,background:T.go,display:"inline-block"}}/> Objetivo</span>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={m.chartData} margin={{top:4,right:10,bottom:0,left:0}}>
                      <XAxis dataKey="date" tick={{fontSize:10,fill:T.inkL}} tickLine={false} axisLine={false} interval="preserveStartEnd"/>
                      <YAxis tick={{fontSize:10,fill:T.inkL,fontFamily:"IBM Plex Mono"}} tickLine={false} axisLine={false} tickFormatter={v=>`${v>=0?"+":""}${v.toFixed(0)}%`} width={42}/>
                      <Tooltip content={<TTip/>}/>
                      <ReferenceLine y={0} stroke={T.bor} strokeDasharray="3 3"/>
                      <Line dataKey="target" name="Objetivo" stroke={T.go} strokeWidth={1.5} strokeDasharray="5 4" dot={false} connectNulls/>
                      <Line dataKey="real"   name="Real"     stroke={T.ac} strokeWidth={2}   dot={{r:3,fill:T.ac}} connectNulls/>
                    </LineChart>
                  </ResponsiveContainer>
                  {m.chartData.filter(d=>d.real!=null).length <= 1 && (
                    <div style={{textAlign:"center",fontSize:11,color:T.inkL,paddingBottom:4}}>
                      El historial real se acumula con cada sesión diaria que abrís la app.
                    </div>
                  )}
                </div>

                {/* Tabla activos */}
                <div style={{background:T.sur,border:`1px solid ${T.bor}`,borderRadius:12,overflow:"hidden",marginBottom:16}}>
                  <div style={{padding:"14px 20px",borderBottom:`1px solid ${T.bor}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{fontWeight:700,fontSize:14}}>Activos <span style={{color:T.inkL,fontWeight:400,fontSize:13}}>({m.en.length})</span></div>
                    <button onClick={() => { setErr(""); navTo("add-asset"); }} style={{padding:"6px 14px",borderRadius:6,border:`1px solid ${T.bor}`,background:T.bg,color:T.inkM,fontSize:12,fontWeight:600}}>+ Agregar</button>
                  </div>
                  {m.en.length === 0 ? (
                    <div style={{padding:"40px",textAlign:"center",color:T.inkL,fontSize:13}}>No hay activos. Usá "+ Agregar".</div>
                  ) : (
                    <>
                      <div style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 30px",padding:"8px 20px",background:T.bg}}>
                        {["Activo","Precio","Valor","G/P","24h",""].map((h,i) => (
                          <div key={i} style={{fontSize:9,color:T.inkL,fontWeight:600,letterSpacing:".08em",textAlign:i>0?"right":"left"}}>{h}</div>
                        ))}
                      </div>
                      {m.en.map(a => {
                        const gain = a.value - a.costT;
                        const gpct = a.costT ? (gain/a.costT)*100 : 0;
                        const t    = ti(a.type);
                        return (
                          <div key={a.id} style={{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 30px",padding:"13px 20px",borderTop:`1px solid ${T.bor}`,alignItems:"center"}}>
                            <div>
                              <div style={{display:"flex",alignItems:"center",gap:7}}>
                                <span style={{background:`${t.c}18`,color:t.c,fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:4}}>{t.l}</span>
                                <span style={{fontWeight:600,fontSize:13}}>{a.name}</span>
                              </div>
                              <div className="mono" style={{fontSize:9,color:T.inkL,marginTop:2}}>{a.ticker} · {a.qty} u. · <span style={{opacity:.7}}>{a.src}</span></div>
                            </div>
                            <div className="mono" style={{textAlign:"right",fontSize:12}}>{fU(a.price)}</div>
                            <div className="mono" style={{textAlign:"right",fontSize:13,fontWeight:500}}>{fU(a.value)}</div>
                            <div className="mono" style={{textAlign:"right",fontSize:12,color:gpct>=0?T.gr:T.re,fontWeight:500}}>
                              {fP(gpct)}<br/><span style={{fontSize:9,opacity:.7}}>{gain>=0?"+":""}{fU(gain)}</span>
                            </div>
                            <div className="mono" style={{textAlign:"right",fontSize:12,color:a.ch>=0?T.gr:T.re}}>{fP(a.ch)}</div>
                            <div style={{textAlign:"right"}}>
                              <button onClick={() => remAsset(port.id, a.id)} style={{background:"none",border:"none",color:T.re+"88",fontSize:13,padding:3}}>✕</button>
                            </div>
                          </div>
                        );
                      })}
                    </>
                  )}
                </div>

                {/* Nota del asesor */}
                {port.notes && (
                  <div style={{background:T.yeB,border:`1px solid ${T.yeBo}`,borderRadius:10,padding:"12px 18px"}}>
                    <div style={{fontSize:9,fontWeight:600,color:T.ye,letterSpacing:".08em",marginBottom:4}}>NOTA DEL ASESOR</div>
                    <div style={{fontSize:13,color:T.ink,lineHeight:1.6}}>{port.notes}</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ══════ NUEVA CARTERA ══════ */}
          {view === "new-portfolio" && (
            <div style={{padding:"32px 36px",maxWidth:560}}>
              <button onClick={() => navTo("overview")} style={{background:"none",border:"none",color:T.inkL,fontSize:12,padding:"0 0 10px",fontWeight:500}}>← Volver</button>
              <h1 className="serif" style={{fontSize:24,fontWeight:700,marginBottom:4}}>Nueva cartera</h1>
              <p style={{color:T.inkM,fontSize:13,marginBottom:20}}>Definí el cliente, perfil y objetivo de rentabilidad.</p>

              {err && <div style={{background:T.reB,border:`1px solid ${T.reBo}`,borderRadius:8,padding:"9px 14px",marginBottom:14,fontSize:13,color:T.re}}>{err}</div>}

              <div style={{background:T.sur,border:`1px solid ${T.bor}`,borderRadius:12,padding:24,display:"flex",flexDirection:"column",gap:14}}>
                <div><Lbl>Nombre de la cartera *</Lbl><input value={np.name} onChange={e=>setNp(p=>({...p,name:e.target.value}))} placeholder="ej. Cartera Dinámica 2025"/></div>
                <div><Lbl>Cliente *</Lbl><input value={np.client} onChange={e=>setNp(p=>({...p,client:e.target.value}))} placeholder="ej. Juan Pérez"/></div>
                <div>
                  <Lbl>Perfil de riesgo</Lbl>
                  <select value={np.profile} onChange={e=>setNp(p=>({...p,profile:e.target.value}))}>
                    {PROFILES.map(pr => <option key={pr}>{pr}</option>)}
                  </select>
                </div>
                <div>
                  <Lbl>TEA objetivo (%) *</Lbl>
                  <input type="number" value={np.tea} onChange={e=>setNp(p=>({...p,tea:e.target.value}))} placeholder="ej. 18 para 18% anual"/>
                  {np.tea && <div style={{fontSize:11,color:T.inkL,marginTop:4}}>→ Equivale a {((teaF(parseFloat(np.tea)||0,365)-1)*100).toFixed(2)}% al año compuesto</div>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div><Lbl>Fecha inicio *</Lbl><input type="date" value={np.startDate} onChange={e=>setNp(p=>({...p,startDate:e.target.value}))}/></div>
                  <div><Lbl>Fecha vencimiento *</Lbl><input type="date" value={np.endDate} onChange={e=>setNp(p=>({...p,endDate:e.target.value}))}/></div>
                </div>
                <div>
                  <Lbl>Notas del asesor</Lbl>
                  <textarea rows={3} value={np.notes} onChange={e=>setNp(p=>({...p,notes:e.target.value}))} placeholder="Estrategia, restricciones, observaciones del cliente…" style={{resize:"vertical"}}/>
                </div>
                <button onClick={createPort} style={{padding:"12px",borderRadius:8,border:"none",background:T.ink,color:"#fff",fontSize:14,fontWeight:700,marginTop:4}}>
                  Crear cartera →
                </button>
              </div>
            </div>
          )}

          {/* ══════ AGREGAR ACTIVO ══════ */}
          {view === "add-asset" && aport && (
            <div style={{padding:"32px 36px",maxWidth:500}}>
              <button onClick={() => navTo("portfolio")} style={{background:"none",border:"none",color:T.inkL,fontSize:12,padding:"0 0 10px",fontWeight:500}}>← Volver a {aport.name}</button>
              <h1 className="serif" style={{fontSize:22,fontWeight:700,marginBottom:14}}>Agregar activo</h1>

              {err && <div style={{background:T.reB,border:`1px solid ${T.reBo}`,borderRadius:8,padding:"9px 14px",marginBottom:14,fontSize:13,color:T.re}}>{err}</div>}

              <div style={{background:T.sur,border:`1px solid ${T.bor}`,borderRadius:12,padding:22,display:"flex",flexDirection:"column",gap:13}}>
                <div><Lbl>Nombre *</Lbl><input value={na.name} onChange={e=>setNa(p=>({...p,name:e.target.value}))} placeholder="ej. Apple"/></div>
                <div><Lbl>Ticker *</Lbl><input value={na.ticker} onChange={e=>setNa(p=>({...p,ticker:e.target.value}))} placeholder="ej. AAPL · BTC · GGAL · AL30"/></div>
                <div>
                  <Lbl>Tipo de activo</Lbl>
                  <select value={na.type} onChange={e=>setNa(p=>({...p,type:e.target.value}))}>
                    {TYPES.map(t => <option key={t.id} value={t.id}>{t.l}</option>)}
                  </select>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <div><Lbl>Cantidad *</Lbl><input type="number" value={na.qty} onChange={e=>setNa(p=>({...p,qty:e.target.value}))} placeholder="ej. 10"/></div>
                  <div><Lbl>Precio de costo (USD) *</Lbl><input type="number" value={na.cost} onChange={e=>setNa(p=>({...p,cost:e.target.value}))} placeholder="ej. 175.50"/></div>
                </div>
                <div><Lbl>Precio manual (si la API falla)</Lbl><input type="number" value={na.mp} onChange={e=>setNa(p=>({...p,mp:e.target.value}))} placeholder="opcional"/></div>

                {/* Acceso rápido */}
                <div style={{background:T.bg,borderRadius:8,padding:"10px 12px"}}>
                  <div style={{fontSize:9,color:T.inkL,fontWeight:600,letterSpacing:".08em",marginBottom:7}}>ACCESO RÁPIDO</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {[["BTC","Bitcoin","crypto"],["ETH","Ethereum","crypto"],["SOL","Solana","crypto"],["AAPL","Apple","us_stock"],["MSFT","Microsoft","us_stock"],["GOOGL","Alphabet","us_stock"],["GGAL","Galicia","arg_stock"],["YPFD","YPF","arg_stock"],["AL30","AL30","arg_bond"],["GD30","GD30","arg_bond"]].map(([tk,nm,tp]) => (
                      <button key={tk} onClick={() => setNa(p=>({...p,ticker:tk,name:nm,type:tp}))} style={{padding:"4px 10px",borderRadius:5,border:`1px solid ${T.bor}`,background:T.sur,fontSize:11,color:T.inkM,fontWeight:500}}>
                        {tk}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{display:"flex",gap:10,marginTop:4}}>
                  <button onClick={() => navTo("portfolio")} style={{flex:1,padding:"11px",borderRadius:8,border:`1px solid ${T.bor}`,background:T.sur,color:T.inkM,fontSize:13,fontWeight:600}}>Cancelar</button>
                  <button onClick={addAsset} style={{flex:2,padding:"11px",borderRadius:8,border:"none",background:T.ink,color:"#fff",fontSize:13,fontWeight:700}}>Agregar activo →</button>
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
