// Portfolio Advisor — Safari compatible, sin JSX ni Babel
const { useState, useEffect, useCallback, useRef, createElement: h } = React;
const { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } = Recharts;

const SK_P = "adv-p-v1", SK_H = "adv-h-v1";
const store = {
  get: k => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

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
  body { background: #f7f6f2; color: #1a1815; font-family: 'DM Sans', sans-serif; }
  ::-webkit-scrollbar { width: 4px; }
  ::-webkit-scrollbar-thumb { background: #d4cfc7; border-radius: 3px; }
  .mono { font-family: 'IBM Plex Mono', monospace !important; }
  .serif { font-family: 'Playfair Display', serif !important; }
  input, select, textarea {
    font-family: 'DM Sans', sans-serif; background: #fff;
    border: 1px solid #e8e5df; color: #1a1815;
    border-radius: 6px; padding: 8px 11px; font-size: 13px;
    outline: none; width: 100%; transition: border-color .15s;
  }
  input:focus, select:focus, textarea:focus { border-color: #2a4fd4; }
  button { cursor: pointer; font-family: 'DM Sans', sans-serif; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.3} }
  .fu { animation: fadeUp .3s ease both; }
  .pulse { animation: pulse 2s infinite; }
`;

const TYPES = [
  {id:"crypto",    l:"Crypto",    c:"#e67e22"},
  {id:"us_stock",  l:"US Equity", c:"#2980b9"},
  {id:"cedear",    l:"CEDEAR",    c:"#8e44ad"},
  {id:"arg_stock", l:"Acción AR", c:"#c0392b"},
  {id:"arg_bond",  l:"Bono AR",   c:"#27ae60"},
  {id:"fci_usd",   l:"FCI/USD",   c:"#16a085"},
];
const PROFILES = ["Conservador","Moderado","Balanceado","Dinámico","Agresivo"];
const ti = id => TYPES.find(t => t.id === id) || TYPES[0];

const LC = {
  green:  {c:"#1a7a4a", bg:"#edf7f1", bo:"#b8dfc9", l:"En objetivo"},
  yellow: {c:"#a07010", bg:"#fdf8ec", bo:"#e8d48a", l:"Atención"},
  red:    {c:"#b52a2a", bg:"#fdf0f0", bo:"#e8aaaa", l:"Desvío crítico"},
  grey:   {c:"#a09a93", bg:"#f7f6f2", bo:"#e8e5df", l:"Sin datos"},
};

async function getPrice(a) {
  try {
    if (a.type === "crypto") {
      const map = {BTC:"bitcoin",ETH:"ethereum",BNB:"binancecoin",SOL:"solana",ADA:"cardano",USDT:"tether",USDC:"usd-coin",XRP:"ripple"};
      const id = map[a.ticker ? a.ticker.toUpperCase() : ""] || (a.ticker ? a.ticker.toLowerCase() : "");
      const r = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=" + id + "&vs_currencies=usd&include_24hr_change=true");
      const d = await r.json();
      if (d[id]) return {p: d[id].usd, ch: d[id].usd_24h_change||0, src:"CoinGecko"};
    }
    if (a.type === "us_stock" || a.type === "cedear") {
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + encodeURIComponent(a.ticker) + "?interval=1d&range=5d");
      const d = await r.json();
      const q = d && d.chart && d.chart.result && d.chart.result[0];
      if (q) {
        const c = q.indicators && q.indicators.quote && q.indicators.quote[0] && q.indicators.quote[0].close ? q.indicators.quote[0].close.filter(Boolean) : [];
        const p = c[c.length-1], pv = c[c.length-2] || p;
        return {p, ch: pv ? ((p-pv)/pv)*100 : 0, src:"Yahoo Finance"};
      }
    }
    if (a.type === "arg_stock" || a.type === "arg_bond") {
      const tk = a.ticker ? a.ticker.toUpperCase().replace(".BA","") : "";
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/" + tk + ".BA?interval=1d&range=5d");
      const d = await r.json();
      const q = d && d.chart && d.chart.result && d.chart.result[0];
      if (q) {
        const c = q.indicators && q.indicators.quote && q.indicators.quote[0] && q.indicators.quote[0].close ? q.indicators.quote[0].close.filter(Boolean) : [];
        const p = c[c.length-1], pv = c[c.length-2] || p;
        return {p, ch: pv ? ((p-pv)/pv)*100 : 0, src:"BYMA/Yahoo"};
      }
    }
    if (a.type === "fci_usd") {
      const r = await fetch("https://api.bluelytics.com.ar/v2/latest");
      const d = await r.json();
      return {p: (d && d.blue && d.blue.value_sell) || (d && d.oficial && d.oficial.value_sell) || a.mp || 1, ch:0, src:"Bluelytics"};
    }
  } catch(e) {}
  return {p: a.mp || 0, ch:0, src:"Manual"};
}

function teaF(tea, d) { return Math.pow(1 + tea/100, d/365); }
function trafficLight(rp, tea, el) {
  if (el <= 0) return "grey";
  const exp = (teaF(tea, el)-1)*100;
  const delta = rp - exp;
  return delta >= -2 ? "green" : delta >= -8 ? "yellow" : "red";
}

function fU(n) { return n != null ? "$" + Math.abs(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "—"; }
function fP(n, s) { if (s === undefined) s = true; return n != null ? (s && n >= 0 ? "+" : "") + n.toFixed(2) + "%" : "—"; }
function fD(d) { return d ? new Date(d).toLocaleDateString("es-AR",{day:"2-digit",month:"short",year:"numeric"}) : "—"; }
function fT(d) { return d ? d.toLocaleTimeString("es-AR",{hour:"2-digit",minute:"2-digit"}) : "—"; }

function TTip(props) {
  const active = props.active, payload = props.payload, label = props.label;
  if (!active || !payload || !payload.length) return null;
  return h("div", {style:{background:"#fff",border:"1px solid #e8e5df",borderRadius:8,padding:"9px 13px",fontSize:12,boxShadow:"0 4px 16px rgba(0,0,0,.06)"}},
    h("div", {style:{color:"#6b6560",marginBottom:5}}, label),
    payload.map(function(p,i) {
      return h("div", {key:i, style:{color:p.color,display:"flex",gap:7,marginBottom:2}},
        h("span", {style:{fontWeight:600}}, p.name + ":"),
        h("span", {className:"mono"}, p.value != null ? (p.value>=0?"+":"") + Number(p.value).toFixed(2) + "%" : "—")
      );
    })
  );
}

function App() {
  const [ports, setPorts]     = useState(function() { return store.get(SK_P) || []; });
  const [prices, setPrices]   = useState({});
  const [hist, setHist]       = useState(function() { return store.get(SK_H) || {}; });
  const [view, setView]       = useState("overview");
  const [aid, setAid]         = useState(null);
  const [loading, setLoading] = useState(false);
  const [sync, setSync]       = useState(null);
  const [np, setNp] = useState({name:"",client:"",profile:"Moderado",tea:"",startDate:new Date().toISOString().slice(0,10),endDate:"",notes:""});
  const [na, setNa] = useState({name:"",ticker:"",type:"crypto",qty:"",cost:"",mp:""});
  const [err, setErr] = useState("");
  const tmr = useRef(null);

  useEffect(function() { store.set(SK_P, ports); }, [ports]);
  useEffect(function() { store.set(SK_H, hist); }, [hist]);

  const refresh = useCallback(async function() {
    const all = ports.reduce(function(acc, p) { return acc.concat(p.assets || []); }, []);
    if (!all.length) return;
    setLoading(true);
    const res = {};
    await Promise.all(all.map(async function(a) { res[a.id] = await getPrice(a); }));
    setPrices(res);
    const today = new Date().toISOString().slice(0,10);
    setHist(function(prev) {
      const next = Object.assign({}, prev);
      ports.forEach(function(port) {
        const assets = port.assets || [];
        const tv = assets.reduce(function(s,a) { return s + ((res[a.id] && res[a.id].p) || a.mp || 0) * a.qty; }, 0);
        const tc = assets.reduce(function(s,a) { return s + a.cost * a.qty; }, 0);
        const rp = tc ? ((tv-tc)/tc)*100 : 0;
        if (!next[port.id]) next[port.id] = [];
        const ex = next[port.id].find(function(s) { return s.date === today; });
        if (!ex) next[port.id] = next[port.id].slice(-89).concat([{date:today, real:parseFloat(rp.toFixed(3))}]);
        else next[port.id] = next[port.id].map(function(s) { return s.date === today ? Object.assign({},s,{real:parseFloat(rp.toFixed(3))}) : s; });
      });
      return next;
    });
    setSync(new Date());
    setLoading(false);
  }, [ports]);

  useEffect(function() {
    clearInterval(tmr.current);
    if (ports.length) { refresh(); tmr.current = setInterval(refresh, 90000); }
    return function() { clearInterval(tmr.current); };
  }, [ports.length]);

  function calc(port) {
    const assets = port.assets || [];
    const en = assets.map(function(a) {
      const price = (prices[a.id] && prices[a.id].p) || a.mp || 0;
      return Object.assign({}, a, {price:price, value:price*a.qty, costT:a.cost*a.qty, ch:(prices[a.id]&&prices[a.id].ch)||0, src:prices[a.id]&&prices[a.id].src});
    });
    const tv = en.reduce(function(s,a){return s+a.value;},0);
    const tc = en.reduce(function(s,a){return s+a.costT;},0);
    const rp = tc ? ((tv-tc)/tc)*100 : 0;
    const gain = tv-tc;
    const st = new Date(port.startDate), e = new Date(port.endDate), now = new Date();
    const el  = Math.max(0,(now-st)/86400000);
    const tot = Math.max(1,(e-st)/86400000);
    const prog = Math.min(1,el/tot);
    const tea  = parseFloat(port.tea)||0;
    const tNow = (teaF(tea,el)-1)*100;
    const tEnd = (teaF(tea,tot)-1)*100;
    const delta = rp-tNow;
    const lc   = trafficLight(rp,tea,el);
    const pts=50, curve=[];
    for(var i=0;i<=pts;i++){
      var d=tot*i/pts;
      var dt=new Date(st.getTime()+d*86400000);
      curve.push({day:Math.round(d), date:dt.toLocaleDateString("es-AR",{day:"2-digit",month:"2-digit"}), target:parseFloat(((teaF(tea,d)-1)*100).toFixed(3)), isPast:dt<=now});
    }
    const snaps = hist[port.id] || [];
    const chartData = curve.map(function(pt) {
      const dt = new Date(st.getTime()+pt.day*86400000);
      const snap = snaps.find(function(x){ return Math.abs((new Date(x.date)-dt)/86400000)<1; });
      return Object.assign({},pt,{real: snap && snap.real!=null ? snap.real : (pt.day===0?0:undefined)});
    });
    return {en,tv,tc,rp,gain,el,tot,prog,tea,tNow,tEnd,delta,lc,chartData,daysLeft:Math.max(0,tot-el)};
  }

  function createPort() {
    if (!np.name||!np.client||!np.tea||!np.startDate||!np.endDate){setErr("Completá todos los campos.");return;}
    if (new Date(np.endDate)<=new Date(np.startDate)){setErr("La fecha fin debe ser posterior al inicio.");return;}
    const port = Object.assign({},np,{id:crypto.randomUUID(),tea:parseFloat(np.tea),assets:[],createdAt:new Date().toISOString()});
    setPorts(function(p){return p.concat([port]);});
    setNp({name:"",client:"",profile:"Moderado",tea:"",startDate:new Date().toISOString().slice(0,10),endDate:"",notes:""});
    setErr(""); setAid(port.id); setView("portfolio");
  }

  function addAsset() {
    if (!na.name||!na.ticker||!na.qty||!na.cost){setErr("Completá los campos obligatorios.");return;}
    const asset = {id:crypto.randomUUID(),name:na.name,ticker:na.ticker.toUpperCase(),type:na.type,qty:parseFloat(na.qty),cost:parseFloat(na.cost),mp:parseFloat(na.mp)||0};
    setPorts(function(prev){return prev.map(function(p){return p.id===aid?Object.assign({},p,{assets:(p.assets||[]).concat([asset])}):p;});});
    setNa({name:"",ticker:"",type:"crypto",qty:"",cost:"",mp:""}); setErr(""); setView("portfolio");
  }

  function remAsset(pid,aid2){setPorts(function(prev){return prev.map(function(p){return p.id===pid?Object.assign({},p,{assets:(p.assets||[]).filter(function(a){return a.id!==aid2;})}):p;});});}
  function delPort(id){setPorts(function(p){return p.filter(function(x){return x.id!==id;});});setView("overview");}
  function navTo(v,id){if(id)setAid(id);setView(v);}
  const aport = ports.find(function(p){return p.id===aid;});
  const am    = aport ? calc(aport) : null;

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const sidebar = h("aside",{style:{width:220,background:"#fff",borderRight:"1px solid #e8e5df",display:"flex",flexDirection:"column",flexShrink:0}},
    h("div",{style:{padding:"22px 18px 16px",borderBottom:"1px solid #e8e5df"}},
      h("div",{className:"serif",style:{fontSize:18,fontWeight:700,lineHeight:1.25}},"Portfolio",h("br"),h("span",{style:{color:"#2a4fd4"}},"Advisor")),
      h("div",{style:{fontSize:9,color:"#a09a93",marginTop:4,letterSpacing:".1em",fontWeight:600}},"GESTIÓN MULTI-CARTERA")
    ),
    h("nav",{style:{flex:1,padding:"12px 10px",overflowY:"auto"}},
      h("button",{onClick:function(){navTo("overview");},style:{width:"100%",textAlign:"left",padding:"9px 10px",borderRadius:6,border:"none",background:view==="overview"?"#eef1fc":"transparent",color:view==="overview"?"#2a4fd4":"#6b6560",fontWeight:600,fontSize:13,marginBottom:6}},"◈ Vista general"),
      h("div",{style:{fontSize:9,color:"#a09a93",letterSpacing:".1em",padding:"8px 10px 5px",fontWeight:600}},"CARTERAS"),
      ports.map(function(p){
        const m=calc(p),lc=LC[m.lc],isA=view==="portfolio"&&aid===p.id;
        return h("button",{key:p.id,onClick:function(){navTo("portfolio",p.id);},style:{width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:6,border:"none",background:isA?lc.bg:"transparent",color:"#1a1815",fontSize:12,marginBottom:2,display:"flex",alignItems:"center",gap:7}},
          h("span",{style:{color:lc.c,fontSize:9,flexShrink:0}},"●"),
          h("div",{style:{flex:1,overflow:"hidden"}},
            h("div",{style:{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},p.name),
            h("div",{style:{fontSize:10,color:"#a09a93",marginTop:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},p.client)
          )
        );
      }),
      h("button",{onClick:function(){setErr("");navTo("new-portfolio");},style:{width:"100%",textAlign:"left",padding:"8px 10px",borderRadius:6,border:"1px dashed #d4cfc7",background:"transparent",color:"#6b6560",fontSize:12,marginTop:8,fontWeight:500}},"+ Nueva cartera")
    ),
    h("div",{style:{padding:"10px 14px",borderTop:"1px solid #e8e5df",fontSize:10,color:"#a09a93",display:"flex",alignItems:"center",gap:6}},
      h("span",{className:"pulse",style:{width:6,height:6,borderRadius:"50%",background:loading?"#c9973a":"#1a7a4a",display:"inline-block",flexShrink:0}}),
      loading?"Actualizando…":"Sync "+fT(sync),
      !loading&&ports.length>0&&h("button",{onClick:refresh,style:{marginLeft:"auto",background:"none",border:"none",color:"#a09a93",fontSize:14,padding:0}},"↻")
    )
  );

  // ── Overview ──────────────────────────────────────────────────────────────
  function renderOverview(){
    const all=ports.map(function(p){return calc(p);});
    const aum=all.reduce(function(s,m){return s+m.tv;},0);
    const gain=all.reduce(function(s,m){return s+m.gain;},0);
    const greens=all.filter(function(m){return m.lc==="green";}).length;
    const reds=all.filter(function(m){return m.lc==="red";}).length;
    return h("div",{style:{padding:"32px 36px"}},
      h("h1",{className:"serif",style:{fontSize:28,fontWeight:700,marginBottom:4}},"Vista General"),
      h("p",{style:{color:"#6b6560",fontSize:14,marginBottom:24}},ports.length+" "+(ports.length===1?"cartera":"carteras")+" activas"),
      ports.length===0
        ?h("div",{style:{textAlign:"center",padding:"80px 0"}},
            h("div",{className:"serif",style:{fontSize:56,color:"#d4cfc7",marginBottom:14}},"◈"),
            h("div",{style:{fontSize:16,fontWeight:600,color:"#6b6560",marginBottom:6}},"Todavía no hay carteras"),
            h("div",{style:{fontSize:13,color:"#a09a93",marginBottom:24}},"Creá la primera desde el panel lateral"),
            h("button",{onClick:function(){setErr("");navTo("new-portfolio");},style:{padding:"11px 24px",borderRadius:8,border:"none",background:"#1a1815",color:"#fff",fontSize:14,fontWeight:600}},"+ Nueva cartera")
          )
        :h("div",null,
            h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:12,marginBottom:28}},
              [{l:"AUM Total",v:fU(aum),c:"#1a1815"},{l:"Ganancia Global",v:(gain>=0?"+":"")+fU(gain),c:gain>=0?"#1a7a4a":"#b52a2a"},{l:"En objetivo",v:greens+" / "+ports.length,c:"#1a7a4a"},{l:"Desvío crítico",v:reds+" / "+ports.length,c:reds>0?"#b52a2a":"#6b6560"}].map(function(k,i){
                return h("div",{key:i,className:"fu",style:{background:"#fff",border:"1px solid #e8e5df",borderRadius:10,padding:"16px 18px",animationDelay:(i*.06)+"s"}},
                  h("div",{style:{fontSize:9,color:"#a09a93",fontWeight:600,letterSpacing:".09em",textTransform:"uppercase",marginBottom:8}},k.l),
                  h("div",{className:"mono",style:{fontSize:22,fontWeight:500,color:k.c}},k.v)
                );
              })
            ),
            h("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))",gap:14}},
              ports.map(function(port){
                const m=calc(port),lc=LC[m.lc];
                return h("div",{key:port.id,onClick:function(){navTo("portfolio",port.id);},style:{background:"#fff",border:"1px solid #e8e5df",borderRadius:12,padding:20,cursor:"pointer",transition:"box-shadow .2s,border-color .2s"},
                  onMouseEnter:function(e){e.currentTarget.style.borderColor="#d4cfc7";e.currentTarget.style.boxShadow="0 4px 20px rgba(0,0,0,.06)"},
                  onMouseLeave:function(e){e.currentTarget.style.borderColor="#e8e5df";e.currentTarget.style.boxShadow="none"}},
                  h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}},
                    h("div",null,h("div",{style:{fontWeight:700,fontSize:15}},port.name),h("div",{style:{fontSize:11,color:"#6b6560",marginTop:2}},port.client+" · "+port.profile)),
                    h("div",{style:{background:lc.bg,border:"1px solid "+lc.bo,borderRadius:20,padding:"3px 10px",display:"flex",alignItems:"center",gap:5,flexShrink:0}},
                      h("span",{style:{color:lc.c,fontSize:8}},"●"),h("span",{style:{color:lc.c,fontSize:11,fontWeight:600}},lc.l)
                    )
                  ),
                  h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:14}},
                    [{l:"Valor",v:fU(m.tv)},{l:"Rentab.",v:fP(m.rp),c:m.rp>=0?"#1a7a4a":"#b52a2a"},{l:"TEA obj.",v:port.tea+"%"}].map(function(x,i){
                      return h("div",{key:i,style:{background:"#f7f6f2",borderRadius:6,padding:"7px 9px"}},
                        h("div",{style:{fontSize:9,color:"#a09a93",marginBottom:3}},x.l),
                        h("div",{className:"mono",style:{fontSize:13,fontWeight:500,color:x.c||"#1a1815"}},x.v)
                      );
                    })
                  ),
                  h("div",{style:{fontSize:9,color:"#a09a93",marginBottom:5,display:"flex",justifyContent:"space-between"}},
                    h("span",null,fD(port.startDate)),h("span",null,Math.round(m.daysLeft)+" días rest."),h("span",null,fD(port.endDate))
                  ),
                  h("div",{style:{background:"#f7f6f2",borderRadius:4,height:5}},
                    h("div",{style:{background:lc.c,borderRadius:4,height:5,width:(m.prog*100)+"%",transition:"width 1s ease"}})
                  )
                );
              })
            )
          )
    );
  }

  // ── Portfolio Detail ──────────────────────────────────────────────────────
  function renderPortfolio(){
    if(!aport||!am)return null;
    const port=aport,m=am,lc=LC[m.lc];
    return h("div",{style:{padding:"32px 36px"}},
      h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:24}},
        h("div",null,
          h("button",{onClick:function(){navTo("overview");},style:{background:"none",border:"none",color:"#a09a93",fontSize:12,padding:"0 0 6px",fontWeight:500}},"← Vista general"),
          h("h1",{className:"serif",style:{fontSize:26,fontWeight:700}},port.name),
          h("div",{style:{fontSize:13,color:"#6b6560",marginTop:3}},port.client+" · "+port.profile+" · TEA objetivo: ",h("strong",null,port.tea+"%"))
        ),
        h("div",{style:{display:"flex",gap:8}},
          h("button",{onClick:function(){setErr("");navTo("add-asset");},style:{padding:"9px 16px",borderRadius:8,border:"1px solid #e8e5df",background:"#fff",color:"#1a1815",fontSize:13,fontWeight:600}},"+ Activo"),
          h("button",{onClick:refresh,disabled:loading,style:{padding:"9px 14px",borderRadius:8,border:"1px solid #e8e5df",background:"#fff",color:"#6b6560",fontSize:13}},"↻"),
          h("button",{onClick:function(){if(confirm("¿Eliminar \""+port.name+"\"?"))delPort(port.id);},style:{padding:"9px 14px",borderRadius:8,border:"1px solid #e8aaaa",background:"#fdf0f0",color:"#b52a2a",fontSize:13,fontWeight:600}},"✕")
        )
      ),
      h("div",{style:{display:"grid",gridTemplateColumns:"140px 1fr 1fr 1fr",gap:12,marginBottom:18}},
        h("div",{style:{background:lc.bg,border:"1px solid "+lc.bo,borderRadius:12,padding:18,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}},
          h("div",{style:{fontSize:34,color:lc.c,marginBottom:5}},"●"),
          h("div",{style:{fontWeight:700,color:lc.c,fontSize:12,textAlign:"center"}},lc.l),
          h("div",{className:"mono",style:{fontSize:11,color:lc.c,marginTop:4,opacity:.8}},(m.delta>=0?"+":"")+m.delta.toFixed(2)+"pp")
        ),
        [{l:"Valor actual",v:fU(m.tv),sub:"costo "+fU(m.tc)},{l:"Rentabilidad real",v:fP(m.rp),sub:(m.gain>=0?"+":"")+fU(m.gain),c:m.rp>=0?"#1a7a4a":"#b52a2a"},{l:"Objetivo al venc.",v:fP(m.tEnd),sub:"Día "+Math.round(m.el)+" de "+Math.round(m.tot)}].map(function(k,i){
          return h("div",{key:i,style:{background:"#fff",border:"1px solid #e8e5df",borderRadius:12,padding:"16px 20px"}},
            h("div",{style:{fontSize:9,color:"#a09a93",fontWeight:600,letterSpacing:".09em",marginBottom:7}},k.l),
            h("div",{className:"mono",style:{fontSize:22,fontWeight:500,color:k.c||"#1a1815"}},k.v),
            h("div",{style:{fontSize:11,color:"#a09a93",marginTop:4}},k.sub)
          );
        })
      ),
      h("div",{style:{background:"#fff",border:"1px solid #e8e5df",borderRadius:10,padding:"12px 18px",marginBottom:16}},
        h("div",{style:{display:"flex",justifyContent:"space-between",fontSize:10,color:"#a09a93",marginBottom:6}},
          h("span",null,fD(port.startDate)),
          h("span",{style:{fontWeight:600,color:"#1a1815"}},"Progreso: "+(m.prog*100).toFixed(0)+"% · "+Math.round(m.daysLeft)+" días restantes"),
          h("span",null,fD(port.endDate))
        ),
        h("div",{style:{background:"#f7f6f2",borderRadius:5,height:6}},h("div",{style:{background:lc.c,borderRadius:5,height:6,width:(m.prog*100)+"%",transition:"width 1s ease"}}))
      ),
      h("div",{style:{background:"#fff",border:"1px solid #e8e5df",borderRadius:12,padding:"18px 16px 10px",marginBottom:16}},
        h("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}},
          h("div",null,
            h("div",{style:{fontWeight:700,fontSize:14}},"Trayectoria real vs objetivo"),
            h("div",{style:{fontSize:11,color:"#a09a93",marginTop:2}},"Rentabilidad acumulada · TEA "+port.tea+"%")
          ),
          h("div",{style:{display:"flex",gap:14,fontSize:11,color:"#6b6560"}},
            h("span",{style:{display:"flex",alignItems:"center",gap:5}},h("span",{style:{width:18,height:2,background:"#2a4fd4",display:"inline-block"}})," Real"),
            h("span",{style:{display:"flex",alignItems:"center",gap:5}},h("span",{style:{width:18,height:2,background:"#c9973a",display:"inline-block"}})," Objetivo")
          )
        ),
        h(ResponsiveContainer,{width:"100%",height:200},
          h(LineChart,{data:m.chartData,margin:{top:4,right:10,bottom:0,left:0}},
            h(XAxis,{dataKey:"date",tick:{fontSize:10,fill:"#a09a93"},tickLine:false,axisLine:false,interval:"preserveStartEnd"}),
            h(YAxis,{tick:{fontSize:10,fill:"#a09a93"},tickLine:false,axisLine:false,tickFormatter:function(v){return (v>=0?"+":"")+v.toFixed(0)+"%";},width:42}),
            h(Tooltip,{content:h(TTip)}),
            h(ReferenceLine,{y:0,stroke:"#e8e5df",strokeDasharray:"3 3"}),
            h(Line,{dataKey:"target",name:"Objetivo",stroke:"#c9973a",strokeWidth:1.5,strokeDasharray:"5 4",dot:false,connectNulls:true}),
            h(Line,{dataKey:"real",name:"Real",stroke:"#2a4fd4",strokeWidth:2,dot:{r:3,fill:"#2a4fd4"},connectNulls:true})
          )
        ),
        m.chartData.filter(function(d){return d.real!=null;}).length<=1&&h("div",{style:{textAlign:"center",fontSize:11,color:"#a09a93",paddingBottom:4}},"El historial real se acumula con cada sesión diaria.")
      ),
      h("div",{style:{background:"#fff",border:"1px solid #e8e5df",borderRadius:12,overflow:"hidden",marginBottom:16}},
        h("div",{style:{padding:"14px 20px",borderBottom:"1px solid #e8e5df",display:"flex",justifyContent:"space-between",alignItems:"center"}},
          h("div",{style:{fontWeight:700,fontSize:14}},"Activos ",h("span",{style:{color:"#a09a93",fontWeight:400,fontSize:13}},"("+m.en.length+")")),
          h("button",{onClick:function(){setErr("");navTo("add-asset");},style:{padding:"6px 14px",borderRadius:6,border:"1px solid #e8e5df",background:"#f7f6f2",color:"#6b6560",fontSize:12,fontWeight:600}},"+ Agregar")
        ),
        m.en.length===0
          ?h("div",{style:{padding:40,textAlign:"center",color:"#a09a93",fontSize:13}},"No hay activos. Usá '+ Agregar'.")
          :h("div",null,
              h("div",{style:{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 30px",padding:"8px 20px",background:"#f7f6f2"}},
                ["Activo","Precio","Valor","G/P","24h",""].map(function(hh,i){return h("div",{key:i,style:{fontSize:9,color:"#a09a93",fontWeight:600,letterSpacing:".08em",textAlign:i>0?"right":"left"}},hh);})
              ),
              m.en.map(function(a){
                const gain=a.value-a.costT,gpct=a.costT?(gain/a.costT)*100:0,t=ti(a.type);
                return h("div",{key:a.id,style:{display:"grid",gridTemplateColumns:"2fr 1fr 1fr 1fr 1fr 30px",padding:"13px 20px",borderTop:"1px solid #e8e5df",alignItems:"center"}},
                  h("div",null,
                    h("div",{style:{display:"flex",alignItems:"center",gap:7}},
                      h("span",{style:{background:t.c+"18",color:t.c,fontSize:8,fontWeight:700,padding:"2px 6px",borderRadius:4}},t.l),
                      h("span",{style:{fontWeight:600,fontSize:13}},a.name)
                    ),
                    h("div",{className:"mono",style:{fontSize:9,color:"#a09a93",marginTop:2}},a.ticker+" · "+a.qty+" u.")
                  ),
                  h("div",{className:"mono",style:{textAlign:"right",fontSize:12}},fU(a.price)),
                  h("div",{className:"mono",style:{textAlign:"right",fontSize:13,fontWeight:500}},fU(a.value)),
                  h("div",{className:"mono",style:{textAlign:"right",fontSize:12,color:gpct>=0?"#1a7a4a":"#b52a2a",fontWeight:500}},fP(gpct),h("br"),h("span",{style:{fontSize:9,opacity:.7}},(gain>=0?"+":"")+fU(gain))),
                  h("div",{className:"mono",style:{textAlign:"right",fontSize:12,color:a.ch>=0?"#1a7a4a":"#b52a2a"}},fP(a.ch)),
                  h("div",{style:{textAlign:"right"}},h("button",{onClick:function(){remAsset(port.id,a.id);},style:{background:"none",border:"none",color:"#b52a2a88",fontSize:13,padding:3}},"✕"))
                );
              })
            )
      ),
      port.notes&&h("div",{style:{background:"#fdf8ec",border:"1px solid #e8d48a",borderRadius:10,padding:"12px 18px"}},
        h("div",{style:{fontSize:9,fontWeight:600,color:"#a07010",letterSpacing:".08em",marginBottom:4}},"NOTA DEL ASESOR"),
        h("div",{style:{fontSize:13,color:"#1a1815",lineHeight:1.6}},port.notes)
      )
    );
  }

  // ── Nueva cartera ─────────────────────────────────────────────────────────
  function renderNewPort(){
    return h("div",{style:{padding:"32px 36px",maxWidth:560}},
      h("button",{onClick:function(){navTo("overview");},style:{background:"none",border:"none",color:"#a09a93",fontSize:12,padding:"0 0 10px",fontWeight:500}},"← Volver"),
      h("h1",{className:"serif",style:{fontSize:24,fontWeight:700,marginBottom:4}},"Nueva cartera"),
      h("p",{style:{color:"#6b6560",fontSize:13,marginBottom:20}},"Definí el cliente, perfil y objetivo de rentabilidad."),
      err&&h("div",{style:{background:"#fdf0f0",border:"1px solid #e8aaaa",borderRadius:8,padding:"9px 14px",marginBottom:14,fontSize:13,color:"#b52a2a"}},err),
      h("div",{style:{background:"#fff",border:"1px solid #e8e5df",borderRadius:12,padding:24,display:"flex",flexDirection:"column",gap:14}},
        h("div",null,h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Nombre de la cartera *"),h("input",{value:np.name,onChange:function(e){setNp(function(p){return Object.assign({},p,{name:e.target.value});});},placeholder:"ej. Cartera Dinámica 2025"})),
        h("div",null,h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Cliente *"),h("input",{value:np.client,onChange:function(e){setNp(function(p){return Object.assign({},p,{client:e.target.value});});},placeholder:"ej. Juan Pérez"})),
        h("div",null,
          h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Perfil de riesgo"),
          h("select",{value:np.profile,onChange:function(e){setNp(function(p){return Object.assign({},p,{profile:e.target.value});});}},
            PROFILES.map(function(pr){return h("option",{key:pr},pr);})
          )
        ),
        h("div",null,
          h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"TEA objetivo (%) *"),
          h("input",{type:"number",value:np.tea,onChange:function(e){setNp(function(p){return Object.assign({},p,{tea:e.target.value});});},placeholder:"ej. 18 para 18% anual"}),
          np.tea&&h("div",{style:{fontSize:11,color:"#a09a93",marginTop:4}},"→ Equivale a "+((teaF(parseFloat(np.tea)||0,365)-1)*100).toFixed(2)+"% al año compuesto")
        ),
        h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}},
          h("div",null,h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Fecha inicio *"),h("input",{type:"date",value:np.startDate,onChange:function(e){setNp(function(p){return Object.assign({},p,{startDate:e.target.value});});}})),
          h("div",null,h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Fecha vencimiento *"),h("input",{type:"date",value:np.endDate,onChange:function(e){setNp(function(p){return Object.assign({},p,{endDate:e.target.value});});}}))
        ),
        h("div",null,
          h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Notas del asesor"),
          h("textarea",{rows:3,value:np.notes,onChange:function(e){setNp(function(p){return Object.assign({},p,{notes:e.target.value});});},placeholder:"Estrategia, restricciones, observaciones del cliente…",style:{resize:"vertical"}})
        ),
        h("button",{onClick:createPort,style:{padding:12,borderRadius:8,border:"none",background:"#1a1815",color:"#fff",fontSize:14,fontWeight:700,marginTop:4}},"Crear cartera →")
      )
    );
  }

  // ── Agregar activo ────────────────────────────────────────────────────────
  function renderAddAsset(){
    if(!aport)return null;
    const QUICK=[["BTC","Bitcoin","crypto"],["ETH","Ethereum","crypto"],["SOL","Solana","crypto"],["AAPL","Apple","us_stock"],["MSFT","Microsoft","us_stock"],["GOOGL","Alphabet","us_stock"],["GGAL","Galicia","arg_stock"],["YPFD","YPF","arg_stock"],["AL30","AL30","arg_bond"],["GD30","GD30","arg_bond"]];
    return h("div",{style:{padding:"32px 36px",maxWidth:500}},
      h("button",{onClick:function(){navTo("portfolio");},style:{background:"none",border:"none",color:"#a09a93",fontSize:12,padding:"0 0 10px",fontWeight:500}},"← Volver a "+aport.name),
      h("h1",{className:"serif",style:{fontSize:22,fontWeight:700,marginBottom:14}},"Agregar activo"),
      err&&h("div",{style:{background:"#fdf0f0",border:"1px solid #e8aaaa",borderRadius:8,padding:"9px 14px",marginBottom:14,fontSize:13,color:"#b52a2a"}},err),
      h("div",{style:{background:"#fff",border:"1px solid #e8e5df",borderRadius:12,padding:22,display:"flex",flexDirection:"column",gap:13}},
        h("div",null,h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Nombre *"),h("input",{value:na.name,onChange:function(e){setNa(function(p){return Object.assign({},p,{name:e.target.value});});},placeholder:"ej. Apple"})),
        h("div",null,h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Ticker *"),h("input",{value:na.ticker,onChange:function(e){setNa(function(p){return Object.assign({},p,{ticker:e.target.value});});},placeholder:"ej. AAPL · BTC · GGAL · AL30"})),
        h("div",null,
          h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Tipo de activo"),
          h("select",{value:na.type,onChange:function(e){setNa(function(p){return Object.assign({},p,{type:e.target.value});});}},
            TYPES.map(function(t){return h("option",{key:t.id,value:t.id},t.l);})
          )
        ),
        h("div",{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}},
          h("div",null,h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Cantidad *"),h("input",{type:"number",value:na.qty,onChange:function(e){setNa(function(p){return Object.assign({},p,{qty:e.target.value});});},placeholder:"ej. 10"})),
          h("div",null,h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Precio de costo (USD) *"),h("input",{type:"number",value:na.cost,onChange:function(e){setNa(function(p){return Object.assign({},p,{cost:e.target.value});});},placeholder:"ej. 175.50"}))
        ),
        h("div",null,h("label",{style:{fontSize:12,color:"#6b6560",fontWeight:600,display:"block",marginBottom:5}},"Precio manual (si API falla)"),h("input",{type:"number",value:na.mp,onChange:function(e){setNa(function(p){return Object.assign({},p,{mp:e.target.value});});},placeholder:"opcional"})),
        h("div",{style:{background:"#f7f6f2",borderRadius:8,padding:"10px 12px"}},
          h("div",{style:{fontSize:9,color:"#a09a93",fontWeight:600,letterSpacing:".08em",marginBottom:7}},"ACCESO RÁPIDO"),
          h("div",{style:{display:"flex",flexWrap:"wrap",gap:6}},
            QUICK.map(function(item){
              return h("button",{key:item[0],onClick:function(){setNa(function(p){return Object.assign({},p,{ticker:item[0],name:item[1],type:item[2]});});},style:{padding:"4px 10px",borderRadius:5,border:"1px solid #e8e5df",background:"#fff",fontSize:11,color:"#6b6560",fontWeight:500}},item[0]);
            })
          )
        ),
        h("div",{style:{display:"flex",gap:10,marginTop:4}},
          h("button",{onClick:function(){navTo("portfolio");},style:{flex:1,padding:11,borderRadius:8,border:"1px solid #e8e5df",background:"#fff",color:"#6b6560",fontSize:13,fontWeight:600}},"Cancelar"),
          h("button",{onClick:addAsset,style:{flex:2,padding:11,borderRadius:8,border:"none",background:"#1a1815",color:"#fff",fontSize:13,fontWeight:700}},"Agregar activo →")
        )
      )
    );
  }

  return h("div",null,
    h("style",null,CSS),
    h("div",{style:{display:"flex",height:"100vh",overflow:"hidden",background:"#f7f6f2"}},
      sidebar,
      h("main",{style:{flex:1,overflowY:"auto",background:"#f7f6f2"}},
        view==="overview"      && renderOverview(),
        view==="portfolio"     && renderPortfolio(),
        view==="new-portfolio" && renderNewPort(),
        view==="add-asset"     && renderAddAsset()
      )
    )
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
