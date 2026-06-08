import { useState, useEffect, useRef } from "react";

const WEATHER = {
  temp: 72, feels: 68, condition: "Partly Cloudy",
  high: 76, low: 58, humidity: 54, icon: "⛅",
};

const TODOS = [
  { id: 1, text: "Pick up Emma from soccer practice", done: false, who: "Dad", priority: true },
  { id: 2, text: "Dentist appointment — call to confirm", done: false, who: "Mom", priority: true },
  { id: 3, text: "Buy groceries: milk, eggs, bread", done: false, who: "Anyone", priority: false },
  { id: 4, text: "Return library books", done: true, who: "Kids", priority: false },
  { id: 5, text: "Pay electricity bill", done: false, who: "Dad", priority: false },
  { id: 6, text: "Schedule playdate for Jake", done: true, who: "Mom", priority: false },
];

const EVENTS = [
  { id: 1, title: "Emma's Soccer Practice", time: "3:30 PM", duration: "90 min", who: "Emma", color: "#f59e0b", today: true },
  { id: 2, title: "Family Dinner — Grandma's", time: "6:00 PM", duration: "2 hrs", who: "All", color: "#10b981", today: true },
  { id: 3, title: "Jake Piano Lesson", time: "4:00 PM", duration: "45 min", who: "Jake", color: "#6366f1", today: false, day: "Tomorrow" },
  { id: 4, title: "Parent-Teacher Conference", time: "2:00 PM", duration: "30 min", who: "Mom & Dad", color: "#ec4899", today: false, day: "Thu" },
  { id: 5, title: "Movie Night", time: "7:00 PM", duration: "2 hrs", who: "All", color: "#f97316", today: false, day: "Fri" },
];

const WHO_COLORS = {
  "Dad": "#6366f1", "Mom": "#ec4899", "Kids": "#f59e0b",
  "Emma": "#10b981", "Jake": "#3b82f6", "Anyone": "#8b5cf6",
  "Mom & Dad": "#f43f5e", "All": "#14b8a6",
};

const SUGGESTIONS = [
  "What's on the family schedule today?",
  "Add 'call the plumber' to the to-do list",
  "What's a quick dinner idea for tonight?",
  "Remind me what tasks are still pending",
];

const FAMILY_CONTEXT = `You are a warm, helpful family assistant for the Smith family. You have access to the following family data:

CALENDAR EVENTS TODAY:
- Emma's Soccer Practice at 3:30 PM (90 min)
- Family Dinner at Grandma's at 6:00 PM (2 hrs)

UPCOMING EVENTS:
- Jake Piano Lesson tomorrow at 4:00 PM (45 min)
- Parent-Teacher Conference Thu at 2:00 PM (Mom & Dad)
- Movie Night Fri at 7:00 PM (All)

ACTIVE TO-DOs:
- [Dad, PRIORITY] Pick up Emma from soccer practice
- [Mom, PRIORITY] Dentist appointment — call to confirm
- [Anyone] Buy groceries: milk, eggs, bread
- [Dad] Pay electricity bill

WEATHER TODAY: 72°F, Partly Cloudy, High 76°F / Low 58°F, Humidity 54%

Respond conversationally, helpfully, and warmly. Keep answers concise — this is a family hub display. Use friendly formatting. If asked to add a to-do or event, confirm cheerfully and say it's been noted.`;

// ── Clock ──────────────────────────────────────────────────────────────────
function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const h = time.getHours(), m = String(time.getMinutes()).padStart(2,"0"), s = String(time.getSeconds()).padStart(2,"0");
  const ampm = h >= 12 ? "PM" : "AM", hr = h % 12 || 12;
  const days = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
  const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-start", gap:"2px" }}>
      <div style={{ display:"flex", alignItems:"flex-end", gap:"8px", lineHeight:1 }}>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:"clamp(52px,8vw,96px)", fontWeight:300, letterSpacing:"-2px", color:"#f8f4ec" }}>
          {hr}:{m}
        </span>
        <span style={{ fontFamily:"'DM Mono',monospace", fontSize:"clamp(20px,3vw,36px)", fontWeight:300, color:"#b8a898", marginBottom:"10px", letterSpacing:"1px" }}>
          {s}<span style={{ fontSize:"0.6em", marginLeft:"4px" }}>{ampm}</span>
        </span>
      </div>
      <div style={{ fontFamily:"'Lora',serif", fontSize:"clamp(13px,1.8vw,18px)", color:"#a09080", letterSpacing:"0.5px", fontStyle:"italic" }}>
        {days[time.getDay()]}, {months[time.getMonth()]} {time.getDate()}, {time.getFullYear()}
      </div>
    </div>
  );
}

// ── Weather ────────────────────────────────────────────────────────────────
function WeatherPanel() {
  return (
    <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"20px", padding:"20px 24px", display:"flex", flexDirection:"column", gap:"12px", backdropFilter:"blur(10px)" }}>
      <div style={{ fontFamily:"'Lora',serif", fontSize:"11px", letterSpacing:"2px", textTransform:"uppercase", color:"#a09080" }}>Weather</div>
      <div style={{ display:"flex", alignItems:"center", gap:"16px" }}>
        <span style={{ fontSize:"48px", lineHeight:1 }}>{WEATHER.icon}</span>
        <div>
          <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"40px", fontWeight:300, color:"#f8f4ec", lineHeight:1 }}>{WEATHER.temp}°</div>
          <div style={{ fontFamily:"'Lora',serif", fontSize:"13px", color:"#b8a898", fontStyle:"italic", marginTop:"2px" }}>{WEATHER.condition}</div>
        </div>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"8px", paddingTop:"8px", borderTop:"1px solid rgba(255,255,255,0.07)" }}>
        {[{label:"High",val:`${WEATHER.high}°`},{label:"Low",val:`${WEATHER.low}°`},{label:"Humidity",val:`${WEATHER.humidity}%`}].map(({label,val})=>(
          <div key={label} style={{ textAlign:"center" }}>
            <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"15px", color:"#f8f4ec" }}>{val}</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:"10px", color:"#a09080", marginTop:"2px" }}>{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Calendar ───────────────────────────────────────────────────────────────
function EventRow({ event }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:"10px", padding:"8px 10px", borderRadius:"10px", background:"rgba(255,255,255,0.04)", borderLeft:`3px solid ${event.color}` }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:"13px", fontWeight:500, color:"#f0ebe2", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{event.title}</div>
        <div style={{ fontFamily:"'Lora',serif", fontSize:"11px", color:"#9d8d7d", fontStyle:"italic", marginTop:"2px" }}>{event.time} · {event.duration}</div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:"2px", flexShrink:0 }}>
        {event.day && <span style={{ fontFamily:"'DM Mono',monospace", fontSize:"10px", color:"#7d6d5d", letterSpacing:"0.5px" }}>{event.day}</span>}
        <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:"10px", fontWeight:600, color:WHO_COLORS[event.who]||"#f8f4ec", background:`${WHO_COLORS[event.who]}22`, padding:"2px 6px", borderRadius:"20px", border:`1px solid ${WHO_COLORS[event.who]}55` }}>{event.who}</span>
      </div>
    </div>
  );
}

function CalendarPanel() {
  const todayEvents = EVENTS.filter(e=>e.today), upcoming = EVENTS.filter(e=>!e.today);
  return (
    <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"20px", padding:"20px 24px", display:"flex", flexDirection:"column", gap:"14px", backdropFilter:"blur(10px)", flex:1, minHeight:0, overflow:"hidden" }}>
      <div style={{ fontFamily:"'Lora',serif", fontSize:"11px", letterSpacing:"2px", textTransform:"uppercase", color:"#a09080", flexShrink:0 }}>Calendar</div>
      <div style={{ flexShrink:0 }}>
        <div style={{ fontFamily:"'Lora',serif", fontSize:"11px", letterSpacing:"1.5px", textTransform:"uppercase", color:"#6d5d50", marginBottom:"8px" }}>Today</div>
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>{todayEvents.map(ev=><EventRow key={ev.id} event={ev}/>)}</div>
      </div>
      <div style={{ borderTop:"1px solid rgba(255,255,255,0.07)", paddingTop:"10px" }}>
        <div style={{ fontFamily:"'Lora',serif", fontSize:"11px", letterSpacing:"1.5px", textTransform:"uppercase", color:"#6d5d50", marginBottom:"8px" }}>Upcoming</div>
        <div style={{ display:"flex", flexDirection:"column", gap:"8px" }}>{upcoming.map(ev=><EventRow key={ev.id} event={ev}/>)}</div>
      </div>
    </div>
  );
}

// ── Todos ──────────────────────────────────────────────────────────────────
function TodoRow({ todo, onToggle }) {
  return (
    <div onClick={()=>onToggle(todo.id)} style={{ display:"flex", alignItems:"center", gap:"10px", padding:"8px 10px", borderRadius:"10px", background:todo.done?"rgba(255,255,255,0.02)":"rgba(255,255,255,0.04)", cursor:"pointer", transition:"background 0.15s", borderLeft:todo.priority&&!todo.done?"3px solid #f59e0b":"3px solid transparent" }}>
      <div style={{ width:"18px", height:"18px", borderRadius:"50%", border:todo.done?"none":"2px solid rgba(255,255,255,0.2)", background:todo.done?"#c4956a":"transparent", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", fontSize:"10px", color:"#1a1210", fontWeight:700, transition:"all 0.2s" }}>{todo.done&&"✓"}</div>
      <div style={{ flex:1, fontFamily:"'DM Sans',sans-serif", fontSize:"13px", color:todo.done?"#6d5d50":"#f0ebe2", textDecoration:todo.done?"line-through":"none", lineHeight:1.3 }}>{todo.text}</div>
      <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:"10px", fontWeight:600, color:WHO_COLORS[todo.who]||"#f8f4ec", background:`${WHO_COLORS[todo.who]}22`, padding:"2px 6px", borderRadius:"20px", border:`1px solid ${WHO_COLORS[todo.who]}44`, flexShrink:0, opacity:todo.done?0.4:1 }}>{todo.who}</span>
    </div>
  );
}

function TodoPanel() {
  const [todos, setTodos] = useState(TODOS);
  const [newTodo, setNewTodo] = useState("");
  const [newWho, setNewWho] = useState("Anyone");
  const toggle = (id) => setTodos(todos.map(t=>t.id===id?{...t,done:!t.done}:t));
  const addTodo = () => {
    if (!newTodo.trim()) return;
    setTodos([...todos,{id:Date.now(),text:newTodo.trim(),done:false,who:newWho,priority:false}]);
    setNewTodo("");
  };
  const active = todos.filter(t=>!t.done), done = todos.filter(t=>t.done);
  return (
    <div style={{ background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"20px", padding:"20px 24px", display:"flex", flexDirection:"column", gap:"14px", backdropFilter:"blur(10px)", flex:1, minHeight:0, overflow:"hidden" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0 }}>
        <div style={{ fontFamily:"'Lora',serif", fontSize:"11px", letterSpacing:"2px", textTransform:"uppercase", color:"#a09080" }}>To-Do</div>
        <div style={{ fontFamily:"'DM Mono',monospace", fontSize:"11px", color:"#6d5d50" }}>{active.length} remaining</div>
      </div>
      <div style={{ display:"flex", gap:"6px", flexShrink:0 }}>
        <input value={newTodo} onChange={e=>setNewTodo(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTodo()} placeholder="Add something…" style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"10px", padding:"8px 12px", fontFamily:"'DM Sans',sans-serif", fontSize:"13px", color:"#f0ebe2", outline:"none" }}/>
        <select value={newWho} onChange={e=>setNewWho(e.target.value)} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", borderRadius:"10px", padding:"8px 10px", fontFamily:"'DM Sans',sans-serif", fontSize:"12px", color:"#b8a898", outline:"none" }}>
          {["Dad","Mom","Kids","Emma","Jake","Anyone"].map(w=><option key={w} value={w} style={{background:"#2a2020"}}>{w}</option>)}
        </select>
        <button onClick={addTodo} style={{ background:"#c4956a", border:"none", borderRadius:"10px", width:"36px", height:"36px", color:"#1a1210", fontSize:"20px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontWeight:700, flexShrink:0 }}>+</button>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:"6px", overflowY:"auto" }}>
        {active.map(todo=><TodoRow key={todo.id} todo={todo} onToggle={toggle}/>)}
        {done.length>0&&<>
          <div style={{ fontFamily:"'Lora',serif", fontSize:"10px", letterSpacing:"1.5px", textTransform:"uppercase", color:"#6d5d50", marginTop:"8px", paddingTop:"8px", borderTop:"1px solid rgba(255,255,255,0.06)" }}>Completed</div>
          {done.map(todo=><TodoRow key={todo.id} todo={todo} onToggle={toggle}/>)}
        </>}
      </div>
    </div>
  );
}

// ── AI Chat Modal ──────────────────────────────────────────────────────────
function ChatModal({ onClose }) {
  const [messages, setMessages] = useState([
    { role: "assistant", content: "Hey there! I'm your family assistant. I know your schedule, to-dos, and today's weather — ask me anything or tell me what you need! 🏡" }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const send = async (text) => {
    const msg = text || input.trim();
    if (!msg || loading) return;
    setInput("");
    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setLoading(true);
    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: FAMILY_CONTEXT,
          messages: apiMessages,
        }),
      });
      const data = await res.json();
      const reply = data.content?.map(b => b.text || "").join("") || "Sorry, I couldn't get a response.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", content: "Hmm, something went wrong. Try again in a moment!" }]);
    }
    setLoading(false);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      display: "flex", alignItems: "flex-end", justifyContent: "center",
      padding: "0 0 100px 0",
    }}>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position:"absolute", inset:0, background:"rgba(10,8,6,0.75)", backdropFilter:"blur(8px)" }}/>

      {/* Panel */}
      <div style={{
        position: "relative", zIndex: 1,
        width: "min(640px, 96vw)",
        height: "min(580px, 70vh)",
        background: "#1e1612",
        border: "1px solid rgba(196,149,106,0.25)",
        borderRadius: "28px",
        boxShadow: "0 0 80px rgba(196,149,106,0.12), 0 40px 80px rgba(0,0,0,0.6)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: "slideUp 0.3s cubic-bezier(0.34,1.56,0.64,1)",
      }}>
        {/* Header */}
        <div style={{
          padding: "16px 20px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "center", gap: "12px",
          background: "rgba(196,149,106,0.06)",
          flexShrink: 0,
        }}>
          <div style={{
            width: "36px", height: "36px", borderRadius: "50%",
            background: "linear-gradient(135deg, #c4956a, #e8b887)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: "18px", flexShrink: 0,
            boxShadow: "0 0 16px rgba(196,149,106,0.4)",
          }}>✦</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily:"'DM Sans',sans-serif", fontSize:"14px", fontWeight:600, color:"#f0ebe2" }}>Family Assistant</div>
            <div style={{ fontFamily:"'Lora',serif", fontSize:"11px", color:"#a09080", fontStyle:"italic" }}>Knows your schedule, tasks & weather</div>
          </div>
          <button onClick={onClose} style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:"8px", width:"30px", height:"30px", color:"#a09080", cursor:"pointer", fontSize:"16px", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
        </div>

        {/* Messages */}
        <div style={{ flex:1, overflowY:"auto", padding:"16px", display:"flex", flexDirection:"column", gap:"12px" }}>
          {messages.map((msg, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
              alignItems: "flex-end",
              gap: "8px",
            }}>
              {msg.role === "assistant" && (
                <div style={{ width:"24px", height:"24px", borderRadius:"50%", background:"linear-gradient(135deg,#c4956a,#e8b887)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", flexShrink:0, marginBottom:"2px" }}>✦</div>
              )}
              <div style={{
                maxWidth: "80%",
                padding: "10px 14px",
                borderRadius: msg.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
                background: msg.role === "user" ? "linear-gradient(135deg, #c4956a, #b07d52)" : "rgba(255,255,255,0.06)",
                border: msg.role === "user" ? "none" : "1px solid rgba(255,255,255,0.08)",
                fontFamily: "'DM Sans',sans-serif",
                fontSize: "13px",
                lineHeight: 1.55,
                color: msg.role === "user" ? "#1a1210" : "#e8e0d5",
                whiteSpace: "pre-wrap",
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display:"flex", alignItems:"flex-end", gap:"8px" }}>
              <div style={{ width:"24px", height:"24px", borderRadius:"50%", background:"linear-gradient(135deg,#c4956a,#e8b887)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"11px", flexShrink:0 }}>✦</div>
              <div style={{ padding:"10px 16px", borderRadius:"18px 18px 18px 4px", background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ display:"flex", gap:"5px", alignItems:"center", height:"14px" }}>
                  {[0,1,2].map(i=>(
                    <div key={i} style={{ width:"6px", height:"6px", borderRadius:"50%", background:"#c4956a", opacity:0.7, animation:`pulse 1.2s ease-in-out ${i*0.2}s infinite` }}/>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Quick suggestions */}
        {messages.length <= 1 && (
          <div style={{ padding:"0 16px 10px", display:"flex", gap:"6px", flexWrap:"wrap", flexShrink:0 }}>
            {SUGGESTIONS.map((s, i) => (
              <button key={i} onClick={()=>send(s)} style={{
                background:"rgba(196,149,106,0.1)", border:"1px solid rgba(196,149,106,0.25)",
                borderRadius:"20px", padding:"5px 12px",
                fontFamily:"'DM Sans',sans-serif", fontSize:"11px", color:"#c4956a",
                cursor:"pointer", whiteSpace:"nowrap",
                transition:"all 0.15s",
              }}>{s}</button>
            ))}
          </div>
        )}

        {/* Input */}
        <div style={{
          padding: "12px 16px",
          borderTop: "1px solid rgba(255,255,255,0.07)",
          display: "flex", gap: "8px", alignItems: "flex-end",
          background: "rgba(0,0,0,0.2)",
          flexShrink: 0,
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Ask about your schedule, add to-dos, get ideas…"
            rows={1}
            style={{
              flex: 1, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)",
              borderRadius:"14px", padding:"10px 14px",
              fontFamily:"'DM Sans',sans-serif", fontSize:"13px", color:"#f0ebe2",
              outline:"none", resize:"none", lineHeight:1.4,
              maxHeight:"100px", overflowY:"auto",
            }}
          />
          <button
            onClick={() => send()}
            disabled={!input.trim() || loading}
            style={{
              width:"40px", height:"40px", borderRadius:"12px", border:"none",
              background: input.trim() && !loading ? "linear-gradient(135deg,#c4956a,#e8b887)" : "rgba(255,255,255,0.08)",
              color: input.trim() && !loading ? "#1a1210" : "#6d5d50",
              cursor: input.trim() && !loading ? "pointer" : "default",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:"18px", transition:"all 0.2s", flexShrink:0,
            }}
          >↑</button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp {
          from { opacity:0; transform: translateY(40px) scale(0.96); }
          to { opacity:1; transform: translateY(0) scale(1); }
        }
        @keyframes pulse {
          0%,80%,100% { transform: scale(0.7); opacity:0.4; }
          40% { transform: scale(1); opacity:1; }
        }
        @keyframes orbPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(196,149,106,0.5), 0 0 32px rgba(196,149,106,0.3); }
          50% { box-shadow: 0 0 0 12px rgba(196,149,106,0), 0 0 48px rgba(196,149,106,0.5); }
        }
      `}</style>
    </div>
  );
}

// ── AI Chat Button (FAB) ───────────────────────────────────────────────────
function AIButton({ onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ display:"flex", justifyContent:"center", alignItems:"center", flexDirection:"column", gap:"8px" }}>
      <div style={{
        fontFamily:"'Lora',serif", fontSize:"11px", fontStyle:"italic",
        color:"#7d6d5d", letterSpacing:"0.5px",
        opacity: hovered ? 1 : 0.6,
        transition:"opacity 0.2s",
      }}>Ask your family assistant</div>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width:"64px", height:"64px", borderRadius:"50%", border:"none",
          background: "linear-gradient(135deg, #c4956a 0%, #e8c49a 50%, #c4956a 100%)",
          backgroundSize: "200% 200%",
          cursor:"pointer",
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:"26px",
          boxShadow: hovered
            ? "0 0 0 6px rgba(196,149,106,0.2), 0 0 48px rgba(196,149,106,0.5), 0 8px 32px rgba(0,0,0,0.5)"
            : "0 0 0 0px rgba(196,149,106,0), 0 0 32px rgba(196,149,106,0.3), 0 4px 20px rgba(0,0,0,0.4)",
          transform: hovered ? "scale(1.08)" : "scale(1)",
          transition:"all 0.25s cubic-bezier(0.34,1.56,0.64,1)",
          animation: "orbPulse 2.5s ease-in-out infinite",
          position:"relative",
        }}
      >
        ✦
        {/* Ripple ring */}
        <div style={{
          position:"absolute", inset:"-4px", borderRadius:"50%",
          border:"1px solid rgba(196,149,106,0.3)",
          animation:"orbPulse 2.5s ease-in-out infinite",
          pointerEvents:"none",
        }}/>
      </button>
      <style>{`
        @keyframes orbPulse {
          0%,100% { box-shadow: 0 0 0 0 rgba(196,149,106,0.4), 0 0 32px rgba(196,149,106,0.25); }
          50% { box-shadow: 0 0 0 10px rgba(196,149,106,0), 0 0 48px rgba(196,149,106,0.45); }
        }
      `}</style>
    </div>
  );
}

// ── App ────────────────────────────────────────────────────────────────────
export default function FamilyHub() {
  const [greeting, setGreeting] = useState("");
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 12) setGreeting("Good morning");
    else if (h < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
    const link = document.createElement("link");
    link.href = "https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500;1,300&family=DM+Sans:wght@400;500;600&family=Lora:ital,wght@0,400;0,600;1,400;1,600&display=swap";
    link.rel = "stylesheet";
    document.head.appendChild(link);
  }, []);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#1a1210",
      backgroundImage: `
        radial-gradient(ellipse 80% 60% at 20% 10%, rgba(196,149,106,0.12) 0%, transparent 60%),
        radial-gradient(ellipse 60% 80% at 80% 90%, rgba(99,102,241,0.08) 0%, transparent 60%),
        url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")
      `,
      padding: "clamp(20px,4vw,48px)",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: "clamp(16px,2.5vw,28px)",
      fontFamily: "'DM Sans',sans-serif",
    }}>
      {/* Header */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"24px", alignItems:"start" }}>
        <div>
          <div style={{ fontFamily:"'Lora',serif", fontSize:"clamp(12px,1.5vw,16px)", color:"#c4956a", fontStyle:"italic", marginBottom:"6px", letterSpacing:"0.3px" }}>
            {greeting}, Smith family 👋
          </div>
          <Clock />
        </div>
        <div style={{ width:"clamp(180px,22vw,260px)" }}>
          <WeatherPanel />
        </div>
      </div>

      {/* Body */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"clamp(12px,2vw,24px)", flex:1 }}>
        <CalendarPanel />
        <TodoPanel />
      </div>

      {/* Footer: Legend + AI Button */}
      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:"12px" }}>
        <div style={{ display:"flex", justifyContent:"center", gap:"24px" }}>
          {["Dad","Mom","Emma","Jake"].map(name=>(
            <div key={name} style={{ display:"flex", alignItems:"center", gap:"6px" }}>
              <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:WHO_COLORS[name] }}/>
              <span style={{ fontFamily:"'DM Sans',sans-serif", fontSize:"11px", color:"#7d6d5d" }}>{name}</span>
            </div>
          ))}
        </div>
        <AIButton onClick={() => setChatOpen(true)} />
      </div>

      {/* Chat modal */}
      {chatOpen && <ChatModal onClose={() => setChatOpen(false)} />}
    </div>
  );
}