import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://feiafohgpoafwctmiuwt.supabase.co";
const SUPABASE_KEY = "sb_publishable_JwhbfdI2rV_pluh-BQdhJg_s-0KNvd-";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const STATUSES = ["Applied","Screening","Technical","Final","Offer","Rejected","Withdrawn"];
const OUTREACH = ["Not contacted","DM sent","Email sent","Replied","Call scheduled","No response"];
const SOURCES  = ["LinkedIn","Handshake","Referral","Company site","Recruiter","Other"];
const REL_TYPES = ["Connection","Referral","Recruiter","Friend","Alumni","Other"];
const WEEK_TARGET = 50;

const STATUS_STYLE = {
  Applied:   { bg:"#E6F1FB", color:"#185FA5" },
  Screening: { bg:"#FAEEDA", color:"#854F0B" },
  Technical: { bg:"#EAF3DE", color:"#3B6D11" },
  Final:     { bg:"#EEEDFE", color:"#534AB7" },
  Offer:     { bg:"#E1F5EE", color:"#0F6E56" },
  Rejected:  { bg:"#FCEBEB", color:"#A32D2D" },
  Withdrawn: { bg:"#F1EFE8", color:"#5F5E5A" },
};

const fmtDate = d => d ? new Date(d + "T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"}) : "—";
const initials = s => s?.split(" ").map(w=>w[0]).join("").toUpperCase().slice(0,2) || "?";
const COLORS  = ["#E6F1FB","#FAEEDA","#E1F5EE","#FCEBEB","#EEEDFE","#EAF3DE"];
const TCOLORS = ["#185FA5","#854F0B","#0F6E56","#A32D2D","#534AB7","#3B6D11"];
const colorFor = s => { const i = ((s||"A").charCodeAt(0)-65)%6; return {bg:COLORS[i],color:TCOLORS[i]}; };
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };

// Get Mon–Sun of a given date string
const weekBounds = (dateStr) => {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay(); // 0=Sun
  const mon = new Date(d); mon.setDate(d.getDate() - ((day+6)%7));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const fmt = x => `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`;
  return { mon: fmt(mon), sun: fmt(sun) };
};

const currentWeekBounds = () => weekBounds(localToday());

// Session hours: [{start:"09:00",end:"12:00"}, ...]
const sessionHours = sessions => sessions.reduce((acc, s) => {
  if (!s.start || !s.end) return acc;
  const [sh, sm] = s.start.split(":").map(Number);
  const [eh, em] = s.end.split(":").map(Number);
  const hrs = (eh * 60 + em - sh * 60 - sm) / 60;
  return acc + (hrs > 0 ? hrs : 0);
}, 0);

const emptyApp = () => ({
  company:"", role:"", location:"", jd_url:"", source:"LinkedIn",
  applied_date: localToday(),
  status:"Applied", opt_verified:true, resume_name:"", resume_url:"", notes:"", salary_range:""
});
const emptyContact = id => ({ application_id:id, name:"", title:"", email:"", linkedin_url:"", outreach_status:"Not contacted", outreach_date:"", notes:"" });

const inp = { width:"100%", padding:"8px 12px", fontSize:13, border:"0.5px solid #ccc", borderRadius:8, background:"#fff", color:"#111", outline:"none", boxSizing:"border-box" };

async function uploadResume(file, company, role) {
  const ext = file.name.split(".").pop();
  const safeName = `${company}-${role}-${Date.now()}.${ext}`.replace(/\s+/g,"-");
  const { error } = await supabase.storage.from("resume").upload(safeName, file, { upsert: true });
  if (error) { alert("Upload failed: " + error.message); return { name: file.name, url: "" }; }
  return { name: safeName, url: safeName };
}

async function getSignedUrl(path) {
  const { data, error } = await supabase.storage.from("resume").createSignedUrl(path, 3600);
  if (error || !data) return null;
  return data.signedUrl;
}

// ── SHARED UI ─────────────────────────────────────────────
function Badge({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.Applied;
  return <span style={{fontSize:11,padding:"3px 10px",borderRadius:20,fontWeight:500,whiteSpace:"nowrap",background:s.bg,color:s.color}}>{status}</span>;
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.4)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#fff",borderRadius:12,border:"1px solid #e5e5e5",width:wide?640:500,maxHeight:"85vh",overflow:"auto",padding:24}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
          <span style={{fontWeight:600,fontSize:15}}>{title}</span>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#888"}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{marginBottom:14}}>
      <label style={{display:"block",fontSize:11,fontWeight:600,marginBottom:5,color:"#666",textTransform:"uppercase",letterSpacing:".04em"}}>{label}</label>
      {children}
    </div>
  );
}

// ── WORK LOG ──────────────────────────────────────────────
function WorkLogPanel({ logs, onSaveLog, onDeleteSession, weeklyHistory }) {
  const [showModal, setShowModal] = useState(false);
  const [editDate, setEditDate] = useState(null);

  const { mon, sun } = currentWeekBounds();
  const thisWeekLogs = logs.filter(l => l.log_date >= mon && l.log_date <= sun);
  const totalWeekHrs = thisWeekLogs.reduce((acc, l) => acc + sessionHours(l.sessions||[]), 0);
  const pct = Math.min(100, (totalWeekHrs / WEEK_TARGET) * 100);

  const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
  const dayDates = DAYS.map((_, i) => {
    const d = new Date(mon + "T12:00:00"); d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  });

  const openLog = (date) => { setEditDate(date); setShowModal(true); };

  return (
    <div style={{padding:"16px 16px 0"}}>
      {/* Weekly progress */}
      <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".04em",color:"#999",fontWeight:600,marginBottom:8}}>This week</div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:600,color:pct>=100?"#3B6D11":"#111"}}>{totalWeekHrs.toFixed(1)} / {WEEK_TARGET} hrs</span>
        <span style={{fontSize:11,color:"#999"}}>{pct.toFixed(0)}%</span>
      </div>
      {/* Progress bar */}
      <div style={{height:8,background:"#f0f0f0",borderRadius:4,marginBottom:14,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:pct>=100?"#3B6D11":pct>=60?"#BA7517":"#185FA5",borderRadius:4,transition:"width .3s"}}/>
      </div>

      {/* Day rows */}
      {DAYS.map((day, i) => {
        const date = dayDates[i];
        const log = thisWeekLogs.find(l => l.log_date === date);
        const hrs = log ? sessionHours(log.sessions||[]) : 0;
        const isToday = date === localToday();
        return (
          <div key={day} onClick={()=>openLog(date)} style={{
            display:"flex", alignItems:"center", gap:8, padding:"7px 8px",
            borderRadius:6, marginBottom:4, cursor:"pointer",
            background:isToday?"#f0f5ff":"transparent",
            border:isToday?"1px solid #d0e0ff":"1px solid transparent"
          }}>
            <div style={{width:28,fontSize:11,color:isToday?"#185FA5":"#999",fontWeight:isToday?700:400}}>{day}</div>
            <div style={{flex:1,height:5,background:"#f0f0f0",borderRadius:3,overflow:"hidden"}}>
              <div style={{height:"100%",width:`${Math.min(100,(hrs/8)*100)}%`,background:hrs>=8?"#3B6D11":"#378ADD",borderRadius:3}}/>
            </div>
            <div style={{fontSize:11,color:"#666",minWidth:32,textAlign:"right"}}>{hrs>0?`${hrs.toFixed(1)}h`:""}</div>
            <div style={{fontSize:12,color:"#bbb"}}>+</div>
          </div>
        );
      })}

      {/* Past weeks */}
      {weeklyHistory.length > 0 && (
        <div style={{marginTop:16,borderTop:"1px solid #f0f0f0",paddingTop:12}}>
          <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".04em",color:"#999",fontWeight:600,marginBottom:8}}>Past weeks</div>
          {weeklyHistory.map((w, i) => (
            <div key={i} style={{display:"flex",justifyContent:"space-between",marginBottom:6,alignItems:"center"}}>
              <span style={{fontSize:11,color:"#666"}}>{fmtDate(w.mon)} – {fmtDate(w.sun)}</span>
              <span style={{fontSize:12,fontWeight:600,color:w.total>=WEEK_TARGET?"#3B6D11":"#666"}}>{w.total.toFixed(1)}h</span>
            </div>
          ))}
        </div>
      )}

      {showModal && <WorkLogModal date={editDate} existing={logs.find(l=>l.log_date===editDate)} onSave={async(log)=>{await onSaveLog(log);setShowModal(false);}} onClose={()=>setShowModal(false)}/>}
    </div>
  );
}

function WorkLogModal({ date, existing, onSave, onClose }) {
  const [sessions, setSessions] = useState(existing?.sessions || []);
  const [notes, setNotes] = useState(existing?.notes || "");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  const addSession = () => {
    if (!newStart || !newEnd) return;
    setSessions(p => [...p, { start: newStart, end: newEnd }]);
    setNewStart(""); setNewEnd("");
  };

  const removeSession = idx => setSessions(p => p.filter((_,i)=>i!==idx));

  const total = sessionHours(sessions);

  const handleSave = () => {
    onSave({ log_date: date, sessions, notes, id: existing?.id });
  };

  return (
    <Modal title={`Work log — ${fmtDate(date)}`} onClose={onClose}>
      <div style={{marginBottom:16}}>
        <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".04em",color:"#999",fontWeight:600,marginBottom:10}}>Sessions</div>
        {sessions.map((s,i) => (
          <div key={i} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,padding:"6px 10px",background:"#f8f8f8",borderRadius:6}}>
            <span style={{fontSize:13,flex:1}}>{s.start} – {s.end}</span>
            <span style={{fontSize:12,color:"#666"}}>{sessionHours([s]).toFixed(1)}h</span>
            <button onClick={()=>removeSession(i)} style={{background:"none",border:"none",cursor:"pointer",color:"#A32D2D",fontSize:14}}>×</button>
          </div>
        ))}
        {sessions.length === 0 && <div style={{fontSize:12,color:"#aaa",marginBottom:8}}>No sessions yet</div>}
        <div style={{display:"flex",gap:8,alignItems:"flex-end",marginTop:10}}>
          <Field label="Start (HH:MM)"><input type="text" maxLength={5} placeholder="09:00" style={{...inp,width:100}} value={newStart} onChange={e=>{let v=e.target.value.replace(/[^0-9:]/g,"");if(v.length===2&&!v.includes(":")&&newStart.length===1)v=v+":";setNewStart(v);}}/></Field>
          <Field label="End (HH:MM)"><input type="text" maxLength={5} placeholder="17:00" style={{...inp,width:100}} value={newEnd} onChange={e=>{let v=e.target.value.replace(/[^0-9:]/g,"");if(v.length===2&&!v.includes(":")&&newEnd.length===1)v=v+":";setNewEnd(v);}}/></Field>
          <button onClick={addSession} style={{padding:"8px 14px",fontSize:13,border:"none",borderRadius:8,background:"#111",color:"#fff",cursor:"pointer",fontWeight:600,marginBottom:14}}>+ Add</button>
        </div>
        {total > 0 && <div style={{fontSize:13,fontWeight:600,color:"#185FA5"}}>Total: {total.toFixed(1)} hours</div>}
      </div>
      <Field label="Notes (optional)"><textarea style={{...inp,minHeight:56,resize:"vertical"}} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="What did you work on?"/></Field>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
        <button onClick={onClose} style={{padding:"8px 18px",fontSize:13,border:"1px solid #ddd",borderRadius:8,background:"#fff",cursor:"pointer"}}>Cancel</button>
        <button onClick={handleSave} style={{padding:"8px 18px",fontSize:13,border:"none",borderRadius:8,background:"#111",color:"#fff",cursor:"pointer",fontWeight:600}}>Save</button>
      </div>
    </Modal>
  );
}

// ── COMPANIES PAGE ────────────────────────────────────────
function CompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [connections, setConnections] = useState({});
  const [selected, setSelected] = useState(null);
  const [showAddCo, setShowAddCo] = useState(false);
  const [showAddConn, setShowAddConn] = useState(false);
  const [editConn, setEditConn] = useState(null);
  const [search, setSearch] = useState("");

  const loadCompanies = useCallback(async () => {
    const { data } = await supabase.from("companies").select("*").order("name");
    setCompanies(data||[]);
  },[]);

  const loadConnections = useCallback(async (cid) => {
    const { data } = await supabase.from("connections").select("*").eq("company_id", cid).order("name");
    setConnections(p=>({...p,[cid]:data||[]}));
  },[]);

  useEffect(()=>{ loadCompanies(); },[loadCompanies]);
  useEffect(()=>{ if(selected) loadConnections(selected.id); },[selected,loadConnections]);

  const saveCo = async (f) => {
    if (f.id) {
      const {data} = await supabase.from("companies").update(f).eq("id",f.id).select().single();
      setCompanies(p=>p.map(c=>c.id===f.id?data:c)); setSelected(data);
    } else {
      const {data} = await supabase.from("companies").insert(f).select().single();
      setCompanies(p=>[...p,data].sort((a,b)=>a.name.localeCompare(b.name)));
      setSelected(data); setShowAddCo(false);
    }
  };

  const deleteCo = async (id) => {
    if(!confirm("Delete company and all its connections?")) return;
    await supabase.from("companies").delete().eq("id",id);
    setCompanies(p=>p.filter(c=>c.id!==id));
    if(selected?.id===id) setSelected(null);
  };

  const saveConn = async (f) => {
    if (f.id) {
      const {data} = await supabase.from("connections").update(f).eq("id",f.id).select().single();
      setConnections(p=>({...p,[f.company_id]:p[f.company_id].map(c=>c.id===f.id?data:c)}));
    } else {
      const {data} = await supabase.from("connections").insert(f).select().single();
      setConnections(p=>({...p,[f.company_id]:[...(p[f.company_id]||[]),data]}));
    }
    setShowAddConn(false); setEditConn(null);
  };

  const deleteConn = async (conn) => {
    await supabase.from("connections").delete().eq("id",conn.id);
    setConnections(p=>({...p,[conn.company_id]:p[conn.company_id].filter(c=>c.id!==conn.id)}));
  };

  const visible = companies.filter(c => !search || c.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div style={{flex:1,display:"flex",overflow:"hidden"}}>
      {/* Company list */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        <div style={{padding:"12px 20px",borderBottom:"1px solid #e5e5e5",display:"flex",alignItems:"center",gap:12,background:"#fff",flexShrink:0}}>
          <span style={{fontWeight:600,fontSize:15,flex:1}}>Companies & Connections</span>
          <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,width:200,padding:"7px 12px",fontSize:12}}/>
          <button onClick={()=>setShowAddCo(true)} style={{padding:"7px 16px",fontSize:13,border:"none",borderRadius:8,background:"#111",color:"#fff",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>+ Add company</button>
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"16px 20px"}}>
          {visible.length===0 && <div style={{textAlign:"center",padding:"60px 0",color:"#999",fontSize:13}}>No companies yet. Add your first one.</div>}
          {visible.map(co => {
            const c = colorFor(co.name);
            const connCount = (connections[co.id]||[]).length;
            return (
              <div key={co.id} onClick={()=>setSelected(co)} style={{background:"#fff",border:selected?.id===co.id?"1.5px solid #111":"1px solid #e5e5e5",borderRadius:8,padding:"12px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
                <div style={{width:36,height:36,borderRadius:8,background:c.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:c.color,flexShrink:0}}>{initials(co.name)}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600}}>{co.name}</div>
                  <div style={{fontSize:12,color:"#666",marginTop:2}}>{co.industry||""}{co.industry&&co.website?" · ":""}{co.website?<a href={co.website} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()} style={{color:"#185FA5",fontSize:11}}>{co.website}</a>:""}</div>
                </div>
                {connCount>0 && <span style={{fontSize:11,color:"#534AB7",fontWeight:600}}>{connCount} connection{connCount!==1?"s":""}</span>}
                <button onClick={e=>{e.stopPropagation();deleteCo(co.id)}} style={{fontSize:12,padding:"3px 7px",border:"1px solid #e5e5e5",borderRadius:6,background:"none",cursor:"pointer",color:"#bbb"}}>×</button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Connection detail */}
      {selected && (
        <div style={{width:320,borderLeft:"1px solid #e5e5e5",overflowY:"auto",background:"#fff",flexShrink:0}}>
          <div style={{padding:16,borderBottom:"1px solid #e5e5e5"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
              <div>
                <div style={{fontWeight:600,fontSize:15}}>{selected.name}</div>
                {selected.industry && <div style={{fontSize:12,color:"#666",marginTop:2}}>{selected.industry}</div>}
                {selected.website && <a href={selected.website} target="_blank" rel="noreferrer" style={{fontSize:12,color:"#185FA5",display:"block",marginTop:2}}>{selected.website} ↗</a>}
              </div>
              <button onClick={()=>setSelected(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#999"}}>×</button>
            </div>
            {selected.notes && <div style={{marginTop:8,padding:"8px 10px",background:"#f8f8f8",borderRadius:8,fontSize:12,color:"#555"}}>{selected.notes}</div>}
          </div>

          <div style={{padding:"14px 16px"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
              <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".04em",color:"#999",fontWeight:600}}>Connections</div>
              <button onClick={()=>setShowAddConn(true)} style={{fontSize:11,padding:"3px 8px",border:"1px solid #e5e5e5",borderRadius:6,background:"none",cursor:"pointer",color:"#555"}}>+ Add</button>
            </div>
            {(connections[selected.id]||[]).length===0 && <div style={{fontSize:12,color:"#aaa"}}>No connections yet</div>}
            {(connections[selected.id]||[]).map(cn => (
              <div key={cn.id} style={{background:"#f8f8f8",borderRadius:8,padding:"10px 12px",marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600}}>{cn.name}</div>
                    {cn.title && <div style={{fontSize:11,color:"#666",marginTop:1}}>{cn.title}</div>}
                    <div style={{display:"flex",gap:6,marginTop:4,flexWrap:"wrap"}}>
                      {cn.relationship && <span style={{fontSize:10,padding:"2px 8px",borderRadius:10,background:"#EEEDFE",color:"#534AB7",fontWeight:500}}>{cn.relationship}</span>}
                    </div>
                    {cn.email && <div style={{fontSize:11,color:"#185FA5",marginTop:4}}>{cn.email}</div>}
                    {cn.linkedin_url && <a href={cn.linkedin_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#185FA5",display:"block",marginTop:2}}>LinkedIn ↗</a>}
                    {cn.notes && <div style={{fontSize:11,color:"#888",marginTop:4}}>{cn.notes}</div>}
                  </div>
                  <div style={{display:"flex",gap:4,flexShrink:0}}>
                    <button onClick={()=>setEditConn(cn)} style={{fontSize:10,padding:"2px 6px",border:"1px solid #e5e5e5",borderRadius:4,background:"none",cursor:"pointer",color:"#555"}}>Edit</button>
                    <button onClick={()=>deleteConn(cn)} style={{fontSize:10,padding:"2px 6px",border:"1px solid #e5e5e5",borderRadius:4,background:"none",cursor:"pointer",color:"#A32D2D"}}>×</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddCo && <Modal title="Add company" onClose={()=>setShowAddCo(false)}>
        <CoForm onSave={saveCo} onClose={()=>setShowAddCo(false)}/>
      </Modal>}
      {showAddConn && selected && <Modal title={`Add connection — ${selected.name}`} onClose={()=>setShowAddConn(false)}>
        <ConnForm initial={{company_id:selected.id,name:"",title:"",email:"",linkedin_url:"",relationship:"Connection",notes:""}} onSave={saveConn} onClose={()=>setShowAddConn(false)}/>
      </Modal>}
      {editConn && <Modal title="Edit connection" onClose={()=>setEditConn(null)}>
        <ConnForm initial={editConn} onSave={saveConn} onClose={()=>setEditConn(null)}/>
      </Modal>}
    </div>
  );
}

function CoForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial||{name:"",website:"",industry:"",notes:""});
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <Field label="Company name"><input style={inp} value={f.name} onChange={set("name")} placeholder="e.g. Google"/></Field>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Industry"><input style={inp} value={f.industry||""} onChange={set("industry")} placeholder="e.g. Tech"/></Field>
        <Field label="Website"><input style={inp} value={f.website||""} onChange={set("website")} placeholder="https://..."/></Field>
      </div>
      <Field label="Notes"><textarea style={{...inp,minHeight:56,resize:"vertical"}} value={f.notes||""} onChange={set("notes")}/></Field>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
        <button onClick={onClose} style={{padding:"8px 18px",fontSize:13,border:"1px solid #ddd",borderRadius:8,background:"#fff",cursor:"pointer"}}>Cancel</button>
        <button onClick={()=>onSave(f)} style={{padding:"8px 18px",fontSize:13,border:"none",borderRadius:8,background:"#111",color:"#fff",cursor:"pointer",fontWeight:600}}>Save</button>
      </div>
    </div>
  );
}

function ConnForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial);
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Name"><input style={inp} value={f.name} onChange={set("name")} placeholder="Full name"/></Field>
        <Field label="Title"><input style={inp} value={f.title||""} onChange={set("title")} placeholder="e.g. Senior Recruiter"/></Field>
        <Field label="Email"><input style={inp} value={f.email||""} onChange={set("email")} placeholder="name@company.com"/></Field>
        <Field label="LinkedIn"><input style={inp} value={f.linkedin_url||""} onChange={set("linkedin_url")} placeholder="https://linkedin.com/in/..."/></Field>
        <Field label="Relationship">
          <select style={inp} value={f.relationship||"Connection"} onChange={set("relationship")}>
            {REL_TYPES.map(r=><option key={r}>{r}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes"><textarea style={{...inp,minHeight:56,resize:"vertical"}} value={f.notes||""} onChange={set("notes")}/></Field>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
        <button onClick={onClose} style={{padding:"8px 18px",fontSize:13,border:"1px solid #ddd",borderRadius:8,background:"#fff",cursor:"pointer"}}>Cancel</button>
        <button onClick={()=>onSave(f)} style={{padding:"8px 18px",fontSize:13,border:"none",borderRadius:8,background:"#111",color:"#fff",cursor:"pointer",fontWeight:600}}>Save</button>
      </div>
    </div>
  );
}

// ── APP FORMS ─────────────────────────────────────────────
function AppForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial || emptyApp());
  const [uploading, setUploading] = useState(false);
  const [resumeFile, setResumeFile] = useState(null);
  const set = k => e => setF(p=>({...p,[k]:e.target.type==="checkbox"?e.target.checked:e.target.value}));

  const handleSave = async () => {
    let finalForm = {...f};
    if (resumeFile) {
      setUploading(true);
      const { name, url } = await uploadResume(resumeFile, f.company||"company", f.role||"role");
      finalForm = {...finalForm, resume_name: name, resume_url: url};
      setUploading(false);
    }
    onSave(finalForm);
  };

  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Company"><input style={inp} value={f.company} onChange={set("company")} placeholder="e.g. Databricks"/></Field>
        <Field label="Role"><input style={inp} value={f.role} onChange={set("role")} placeholder="e.g. Data Engineer"/></Field>
        <Field label="Location"><input style={inp} value={f.location} onChange={set("location")} placeholder="City, ST or Remote"/></Field>
        <Field label="Source"><select style={inp} value={f.source} onChange={set("source")}>{SOURCES.map(s=><option key={s}>{s}</option>)}</select></Field>
        <Field label="Applied date"><input style={inp} type="date" value={f.applied_date} onChange={set("applied_date")}/></Field>
        <Field label="Status"><select style={inp} value={f.status} onChange={set("status")}>{STATUSES.map(s=><option key={s}>{s}</option>)}</select></Field>
        <Field label="Salary range"><input style={inp} value={f.salary_range} onChange={set("salary_range")} placeholder="e.g. $110k–$130k"/></Field>
      </div>
      <Field label="Resume (PDF)">
        <input type="file" accept=".pdf,.doc,.docx" onChange={e=>setResumeFile(e.target.files[0])} style={{...inp,padding:"6px 12px"}}/>
        {f.resume_name && !resumeFile && <div style={{fontSize:11,color:"#3B6D11",marginTop:4}}>Current: {f.resume_name}</div>}
        {resumeFile && <div style={{fontSize:11,color:"#185FA5",marginTop:4}}>Selected: {resumeFile.name}</div>}
      </Field>
      <Field label="JD URL"><input style={inp} value={f.jd_url} onChange={set("jd_url")} placeholder="https://..."/></Field>
      <Field label="Notes"><textarea style={{...inp,minHeight:64,resize:"vertical"}} value={f.notes} onChange={set("notes")}/></Field>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:18}}>
        <input type="checkbox" id="opt" checked={f.opt_verified} onChange={set("opt_verified")}/>
        <label htmlFor="opt" style={{fontSize:13,cursor:"pointer"}}>OPT eligible — verified</label>
      </div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8}}>
        <button onClick={onClose} style={{padding:"8px 18px",fontSize:13,border:"1px solid #ddd",borderRadius:8,background:"#fff",cursor:"pointer"}}>Cancel</button>
        <button onClick={handleSave} disabled={uploading} style={{padding:"8px 18px",fontSize:13,border:"none",borderRadius:8,background:"#111",color:"#fff",cursor:"pointer",fontWeight:600}}>
          {uploading ? "Uploading…" : "Save"}
        </button>
      </div>
    </div>
  );
}

function ContactForm({ initial, onSave, onClose }) {
  const [f, setF] = useState(initial);
  const set = k => e => setF(p=>({...p,[k]:e.target.value}));
  return (
    <div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Name"><input style={inp} value={f.name} onChange={set("name")} placeholder="Full name"/></Field>
        <Field label="Title"><input style={inp} value={f.title} onChange={set("title")} placeholder="Recruiter / HM"/></Field>
        <Field label="Email"><input style={inp} value={f.email} onChange={set("email")} placeholder="name@company.com"/></Field>
        <Field label="LinkedIn URL"><input style={inp} value={f.linkedin_url} onChange={set("linkedin_url")} placeholder="https://linkedin.com/in/..."/></Field>
        <Field label="Outreach status"><select style={inp} value={f.outreach_status} onChange={set("outreach_status")}>{OUTREACH.map(o=><option key={o}>{o}</option>)}</select></Field>
        <Field label="Outreach date"><input style={inp} type="date" value={f.outreach_date||""} onChange={set("outreach_date")}/></Field>
      </div>
      <Field label="Notes"><textarea style={{...inp,minHeight:60,resize:"vertical"}} value={f.notes||""} onChange={set("notes")}/></Field>
      <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:4}}>
        <button onClick={onClose} style={{padding:"8px 18px",fontSize:13,border:"1px solid #ddd",borderRadius:8,background:"#fff",cursor:"pointer"}}>Cancel</button>
        <button onClick={()=>onSave(f)} style={{padding:"8px 18px",fontSize:13,border:"none",borderRadius:8,background:"#111",color:"#fff",cursor:"pointer",fontWeight:600}}>Save</button>
      </div>
    </div>
  );
}

function DetailPanel({ app, contacts, timeline, onUpdate, onContactSave, onContactDelete, onClose }) {
  const [editApp, setEditApp]         = useState(false);
  const [addContact, setAddContact]   = useState(false);
  const [editContact, setEditContact] = useState(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const c = colorFor(app.company);

  const openResume = async () => {
    if (!app.resume_url) return;
    setResumeLoading(true);
    const url = await getSignedUrl(app.resume_url);
    setResumeLoading(false);
    if (url) window.open(url, "_blank");
    else alert("Could not load resume. Try again.");
  };

  return (
    <div style={{width:300,borderLeft:"1px solid #e5e5e5",overflowY:"auto",background:"#fff",flexShrink:0}}>
      <div style={{padding:16,borderBottom:"1px solid #e5e5e5"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <div style={{width:40,height:40,borderRadius:10,background:c.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:c.color,flexShrink:0}}>{initials(app.company)}</div>
            <div><div style={{fontWeight:600,fontSize:14}}>{app.company}</div><div style={{fontSize:12,color:"#666"}}>{app.role}</div></div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",fontSize:20,color:"#999"}}>×</button>
        </div>
        <Badge status={app.status}/>
        <div style={{display:"flex",gap:6,marginTop:12,flexWrap:"wrap"}}>
          {app.jd_url && <a href={app.jd_url} target="_blank" rel="noreferrer" style={{fontSize:11,padding:"4px 10px",border:"1px solid #e5e5e5",borderRadius:8,textDecoration:"none",color:"#555"}}>↗ JD</a>}
          {app.resume_url && <button onClick={openResume} disabled={resumeLoading} style={{fontSize:11,padding:"4px 10px",border:"1px solid #e5e5e5",borderRadius:8,background:"none",cursor:"pointer",color:"#185FA5"}}>{resumeLoading?"Loading…":"📄 Resume"}</button>}
          <button onClick={()=>setEditApp(true)} style={{fontSize:11,padding:"4px 10px",border:"1px solid #e5e5e5",borderRadius:8,background:"none",cursor:"pointer",color:"#555"}}>Edit</button>
        </div>
      </div>
      <div style={{padding:"14px 16px",borderBottom:"1px solid #e5e5e5"}}>
        <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".04em",color:"#999",fontWeight:600,marginBottom:10}}>Details</div>
        {[["Applied",fmtDate(app.applied_date)],["Location",app.location],["Source",app.source],["OPT",app.opt_verified?"✓ Verified":null],["Salary",app.salary_range]].filter(([,v])=>v).map(([k,v])=>(
          <div key={k} style={{display:"flex",justifyContent:"space-between",marginBottom:7,gap:8}}>
            <span style={{fontSize:12,color:"#666"}}>{k}</span>
            <span style={{fontSize:12,fontWeight:600,color:k==="OPT"?"#3B6D11":"#111"}}>{v}</span>
          </div>
        ))}
        {app.notes && <div style={{marginTop:10,padding:"8px 10px",background:"#f8f8f8",borderRadius:8,fontSize:12,color:"#555",lineHeight:1.6}}>{app.notes}</div>}
      </div>
      <div style={{padding:"14px 16px",borderBottom:"1px solid #e5e5e5"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".04em",color:"#999",fontWeight:600}}>Contacts</div>
          <button onClick={()=>setAddContact(true)} style={{fontSize:11,padding:"3px 8px",border:"1px solid #e5e5e5",borderRadius:6,background:"none",cursor:"pointer",color:"#555"}}>+ Add</button>
        </div>
        {contacts.length===0 && <div style={{fontSize:12,color:"#aaa"}}>No contacts yet</div>}
        {contacts.map(ct=>(
          <div key={ct.id} style={{background:"#f8f8f8",borderRadius:8,padding:"10px 12px",marginBottom:6}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
              <div>
                <div style={{fontSize:12,fontWeight:600}}>{ct.name}</div>
                {ct.title && <div style={{fontSize:11,color:"#666",marginTop:1}}>{ct.title}</div>}
                {ct.email && <div style={{fontSize:11,color:"#185FA5",marginTop:4}}>{ct.email}</div>}
                {ct.linkedin_url && <a href={ct.linkedin_url} target="_blank" rel="noreferrer" style={{fontSize:11,color:"#185FA5",display:"block",marginTop:2}}>LinkedIn ↗</a>}
                <div style={{fontSize:11,color:"#999",marginTop:4}}>{ct.outreach_status}</div>
              </div>
              <div style={{display:"flex",gap:4}}>
                <button onClick={()=>setEditContact(ct)} style={{fontSize:10,padding:"2px 6px",border:"1px solid #e5e5e5",borderRadius:4,background:"none",cursor:"pointer",color:"#555"}}>Edit</button>
                <button onClick={()=>onContactDelete(ct.id)} style={{fontSize:10,padding:"2px 6px",border:"1px solid #e5e5e5",borderRadius:4,background:"none",cursor:"pointer",color:"#A32D2D"}}>×</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      <div style={{padding:"14px 16px"}}>
        <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".04em",color:"#999",fontWeight:600,marginBottom:12}}>Timeline</div>
        {timeline.length===0 && <div style={{fontSize:12,color:"#aaa"}}>No events yet</div>}
        {timeline.map((ev,i)=>(
          <div key={ev.id} style={{display:"flex",gap:10,marginBottom:12}}>
            <div style={{width:8,height:8,borderRadius:"50%",marginTop:4,flexShrink:0,background:i===0?"#BA7517":"#3B6D11"}}/>
            <div>
              <div style={{fontSize:12,fontWeight:500}}>{ev.title}</div>
              {ev.description && <div style={{fontSize:11,color:"#666",marginTop:1}}>{ev.description}</div>}
              <div style={{fontSize:11,color:"#aaa"}}>{fmtDate(ev.event_date)}</div>
            </div>
          </div>
        ))}
      </div>
      {editApp && <Modal title={`Edit — ${app.company}`} onClose={()=>setEditApp(false)}><AppForm initial={app} onSave={f=>{onUpdate(f);setEditApp(false)}} onClose={()=>setEditApp(false)}/></Modal>}
      {addContact && <Modal title="Add contact" onClose={()=>setAddContact(false)}><ContactForm initial={emptyContact(app.id)} onSave={f=>{onContactSave(f);setAddContact(false)}} onClose={()=>setAddContact(false)}/></Modal>}
      {editContact && <Modal title="Edit contact" onClose={()=>setEditContact(null)}><ContactForm initial={editContact} onSave={f=>{onContactSave(f);setEditContact(null)}} onClose={()=>setEditContact(null)}/></Modal>}
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────
export default function App() {
  const [page, setPage]         = useState("apps"); // "apps" | "companies"
  const [apps, setApps]         = useState([]);
  const [contacts, setContacts] = useState({});
  const [timeline, setTimeline] = useState({});
  const [selected, setSelected] = useState(null);
  const [filter, setFilter]     = useState("All");
  const [search, setSearch]     = useState("");
  const [showAdd, setShowAdd]   = useState(false);
  const [loading, setLoading]   = useState(true);
  const [workLogs, setWorkLogs] = useState([]);

  const loadApps = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("applications").select("*").order("applied_date",{ascending:false}).order("created_at",{ascending:false});
    setApps(data||[]); setLoading(false);
  },[]);

  const loadDetail = useCallback(async id => {
    const [{data:c},{data:t}] = await Promise.all([
      supabase.from("contacts").select("*").eq("application_id",id).order("created_at"),
      supabase.from("timeline_events").select("*").eq("application_id",id).order("event_date",{ascending:false})
    ]);
    setContacts(p=>({...p,[id]:c||[]}));
    setTimeline(p=>({...p,[id]:t||[]}));
  },[]);

  const loadWorkLogs = useCallback(async () => {
    const { data } = await supabase.from("work_logs").select("*").order("log_date",{ascending:false});
    setWorkLogs(data||[]);
  },[]);

  useEffect(()=>{ loadApps(); loadWorkLogs(); },[loadApps,loadWorkLogs]);
  useEffect(()=>{ if(selected) loadDetail(selected.id); },[selected,loadDetail]);

  const saveApp = async f => {
    if(f.id){
      const {data} = await supabase.from("applications").update(f).eq("id",f.id).select().single();
      setApps(p=>p.map(a=>a.id===f.id?data:a)); setSelected(data);
    } else {
      const {data} = await supabase.from("applications").insert(f).select().single();
      setApps(p=>[data,...p]); setSelected(data); setShowAdd(false);
    }
  };
  const deleteApp = async id => {
    if(!confirm("Delete this application?")) return;
    await supabase.from("applications").delete().eq("id",id);
    setApps(p=>p.filter(a=>a.id!==id));
    if(selected?.id===id) setSelected(null);
  };
  const saveContact = async f => {
    if(f.id){
      const {data} = await supabase.from("contacts").update(f).eq("id",f.id).select().single();
      setContacts(p=>({...p,[f.application_id]:p[f.application_id].map(c=>c.id===f.id?data:c)}));
    } else {
      const {data} = await supabase.from("contacts").insert(f).select().single();
      setContacts(p=>({...p,[f.application_id]:[...(p[f.application_id]||[]),data]}));
    }
  };
  const deleteContact = async cid => {
    const ct = Object.values(contacts).flat().find(c=>c.id===cid);
    if(!ct) return;
    await supabase.from("contacts").delete().eq("id",cid);
    setContacts(p=>({...p,[ct.application_id]:p[ct.application_id].filter(c=>c.id!==cid)}));
  };

  const saveWorkLog = async (log) => {
    const payload = { log_date: log.log_date, sessions: log.sessions, notes: log.notes };
    if (log.id) {
      const {data} = await supabase.from("work_logs").update(payload).eq("id",log.id).select().single();
      setWorkLogs(p=>p.map(l=>l.id===log.id?data:l));
    } else {
      const {data} = await supabase.from("work_logs").upsert({...payload},{onConflict:"log_date"}).select().single();
      setWorkLogs(p=>{const exists=p.find(l=>l.log_date===log.log_date); return exists?p.map(l=>l.log_date===log.log_date?data:l):[data,...p];});
    }
  };

  // Build weekly history (past weeks only)
  const { mon: curMon } = currentWeekBounds();
  const pastWeeks = [];
  const weekMap = {};
  workLogs.forEach(l => {
    const { mon, sun } = weekBounds(l.log_date);
    if (mon >= curMon) return; // skip current week
    if (!weekMap[mon]) weekMap[mon] = { mon, sun, total: 0 };
    weekMap[mon].total += sessionHours(l.sessions||[]);
  });
  Object.values(weekMap).sort((a,b)=>b.mon.localeCompare(a.mon)).forEach(w=>pastWeeks.push(w));

  const visible = apps.filter(a=>{
    const mf = filter==="All"||a.status===filter;
    const q = search.toLowerCase();
    const ms = !q||a.company.toLowerCase().includes(q)||a.role.toLowerCase().includes(q)||(a.location||"").toLowerCase().includes(q);
    return mf&&ms;
  });

  const total      = apps.length;
  const inProgress = apps.filter(a=>["Screening","Technical","Final"].includes(a.status)).length;
  const offers     = apps.filter(a=>a.status==="Offer").length;
  const rejected   = apps.filter(a=>a.status==="Rejected").length;

  // Sidebar nav items
  const navItems = [
    { key:"apps", label:"Applications" },
    { key:"companies", label:"Companies" },
  ];

  return (
    <div style={{fontFamily:"system-ui,sans-serif",display:"flex",height:"100vh",background:"#f5f5f5",color:"#111",overflow:"hidden"}}>

      {/* SIDEBAR */}
      <div style={{width:210,borderRight:"1px solid #e5e5e5",background:"#fafafa",display:"flex",flexDirection:"column",flexShrink:0,overflowY:"auto"}}>
        <div style={{padding:"18px 16px 14px",fontSize:15,fontWeight:700,borderBottom:"1px solid #e5e5e5"}}>🎯 JobTrack</div>

        {/* Main nav */}
        {navItems.map(n=>(
          <div key={n.key} onClick={()=>{setPage(n.key);setSelected(null);}} style={{padding:"9px 16px",fontSize:13,cursor:"pointer",fontWeight:page===n.key?600:400,color:page===n.key?"#111":"#666",background:page===n.key?"#fff":"transparent",borderBottom:"1px solid #f0f0f0"}}>
            {n.key==="apps"?"📋 ":"🏢 "}{n.label}
          </div>
        ))}

        {/* Status filters — only when on apps page */}
        {page==="apps" && (
          <div style={{borderBottom:"1px solid #e5e5e5",paddingBottom:8}}>
            {[["All","All"],...STATUSES.map(s=>[s,s])].map(([label,val])=>(
              <div key={val} onClick={()=>setFilter(val)} style={{padding:"7px 16px",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:8,fontWeight:filter===val?600:400,color:filter===val?"#111":"#666",background:filter===val?"#fff":"transparent"}}>
                {val!=="All" && <span style={{width:6,height:6,borderRadius:"50%",flexShrink:0,background:(STATUS_STYLE[val]||{}).color||"#888"}}/>}
                {label}
                {val!=="All" && <span style={{marginLeft:"auto",fontSize:11,color:"#bbb"}}>{apps.filter(a=>a.status===val).length||""}</span>}
              </div>
            ))}
          </div>
        )}

        {/* Work log panel */}
        <div style={{borderTop:"1px solid #e5e5e5",paddingTop:12}}>
          <div style={{padding:"0 16px 8px",fontSize:11,textTransform:"uppercase",letterSpacing:".04em",color:"#999",fontWeight:700}}>⏱ Work hours</div>
          <WorkLogPanel logs={workLogs} onSaveLog={saveWorkLog} weeklyHistory={pastWeeks}/>
        </div>

        <div style={{marginTop:"auto",padding:"12px 16px",fontSize:11,color:"#bbb",borderTop:"1px solid #e5e5e5"}}>OPT deadline: Jun 15, 2026</div>
      </div>

      {/* MAIN CONTENT */}
      {page === "apps" ? (
        <div style={{flex:1,display:"flex",overflow:"hidden"}}>
          <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"12px 20px",borderBottom:"1px solid #e5e5e5",display:"flex",alignItems:"center",gap:12,flexShrink:0,background:"#fff"}}>
              <span style={{fontWeight:600,fontSize:15,flex:1}}>Applications</span>
              <input placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{...inp,width:220,padding:"7px 12px",fontSize:12}}/>
              <button onClick={()=>setShowAdd(true)} style={{padding:"7px 16px",fontSize:13,border:"none",borderRadius:8,background:"#111",color:"#fff",cursor:"pointer",fontWeight:600,whiteSpace:"nowrap"}}>+ Add role</button>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,padding:"14px 20px",flexShrink:0}}>
              {[["Total applied",total,"#378ADD"],["In progress",inProgress,"#BA7517"],["Offers",offers,"#3B6D11"],["Rejected",rejected,"#A32D2D"]].map(([label,val,color])=>(
                <div key={label} style={{background:"#fff",borderRadius:8,padding:"12px 14px",border:"1px solid #e5e5e5"}}>
                  <div style={{fontSize:11,color:"#999",marginBottom:6,textTransform:"uppercase",letterSpacing:".04em"}}>{label}</div>
                  <div style={{fontSize:22,fontWeight:700,color}}>{val}</div>
                </div>
              ))}
            </div>
            <div style={{flex:1,overflowY:"auto",padding:"0 20px 20px"}}>
              {loading && <div style={{fontSize:13,color:"#999",padding:"20px 0"}}>Loading…</div>}
              {!loading && visible.length===0 && <div style={{textAlign:"center",padding:"60px 0",color:"#999",fontSize:13}}>{search?`No results for "${search}"`:"No applications yet."}</div>}
              {visible.map(a=>{
                const c = colorFor(a.company);
                return (
                  <div key={a.id} onClick={()=>setSelected(a)} style={{background:"#fff",border:selected?.id===a.id?"1.5px solid #111":"1px solid #e5e5e5",borderRadius:8,padding:"11px 14px",marginBottom:8,display:"flex",alignItems:"center",gap:12,cursor:"pointer"}}>
                    <div style={{width:36,height:36,borderRadius:8,background:c.bg,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:c.color,flexShrink:0}}>{initials(a.company)}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{a.role}</div>
                      <div style={{fontSize:12,color:"#666",marginTop:2}}>{a.company}{a.location?` · ${a.location}`:""}</div>
                    </div>
                    {a.resume_url && <span style={{fontSize:11,color:"#185FA5"}}>📄</span>}
                    {a.opt_verified && <span style={{fontSize:11,color:"#3B6D11",fontWeight:600}}>✓ OPT</span>}
                    <Badge status={a.status}/>
                    <div style={{fontSize:11,color:"#bbb",flexShrink:0,minWidth:52,textAlign:"right"}}>{fmtDate(a.applied_date)}</div>
                    <button onClick={e=>{e.stopPropagation();deleteApp(a.id)}} style={{fontSize:12,padding:"3px 7px",border:"1px solid #e5e5e5",borderRadius:6,background:"none",cursor:"pointer",color:"#bbb"}}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
          {selected && <DetailPanel app={selected} contacts={contacts[selected.id]||[]} timeline={timeline[selected.id]||[]} onUpdate={saveApp} onContactSave={saveContact} onContactDelete={deleteContact} onClose={()=>setSelected(null)}/>}
        </div>
      ) : (
        <CompaniesPage/>
      )}

      {showAdd && <Modal title="Add application" onClose={()=>setShowAdd(false)}><AppForm onSave={saveApp} onClose={()=>setShowAdd(false)}/></Modal>}
    </div>
  );
}
