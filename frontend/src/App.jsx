import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, CheckCircle2, CircleDot, Clock3, ExternalLink, Gauge, Globe2, Plus, RefreshCw, Server, ShieldCheck, Trash2, X, Zap } from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API = '/api';
const formatTime = value => value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
const formatDate = value => value ? new Date(value).toLocaleString() : 'Never checked';

function StatCard({ label, value, suffix, icon: Icon, tone, detail }) {
  return <div className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}><Icon size={17}/></span></div><div className="stat-value">{value ?? '—'}<small>{value !== null && value !== undefined ? suffix : ''}</small></div><div className="stat-detail">{detail}</div></div>;
}

export default function App() {
  const [monitors, setMonitors] = useState([]);
  const [summary, setSummary] = useState({});
  const [selected, setSelected] = useState(null);
  const [checks, setChecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function loadData(quiet = false) {
    if (!quiet) setRefreshing(true);
    try {
      const [monitorResponse, summaryResponse] = await Promise.all([fetch(`${API}/monitors`), fetch(`${API}/summary`)]);
      if (!monitorResponse.ok || !summaryResponse.ok) throw new Error('Could not load dashboard data');
      const monitorData = await monitorResponse.json();
      setMonitors(monitorData); setSummary(await summaryResponse.json());
      if (selected) {
        const current = monitorData.find(item => item.id === selected.id);
        if (current) setSelected(current); else setSelected(null);
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); setRefreshing(false); }
  }

  const activeMonitor = selected || monitors[0] || null;

  useEffect(() => { loadData(true); const timer = setInterval(() => loadData(true), 15000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (!activeMonitor) { setChecks([]); return; }
    fetch(`${API}/monitors/${activeMonitor.id}/checks?limit=50`).then(r => r.ok ? r.json() : []).then(setChecks).catch(() => setChecks([]));
  }, [activeMonitor?.id, monitors.length, summary.averageLatency]);

  async function createMonitor(event) {
    event.preventDefault(); setError(''); setSaving(true);
    try {
      const response = await fetch(`${API}/monitors`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name, url }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Could not create monitor');
      setName(''); setUrl(''); setShowForm(false); await loadData();
    } catch (err) { setError(err.message); } finally { setSaving(false); }
  }

  async function deleteMonitor(id) {
    if (!window.confirm('Delete this monitor and all its check history?')) return;
    try { const response = await fetch(`${API}/monitors/${id}`, { method: 'DELETE' }); if (!response.ok) throw new Error('Delete failed'); setSelected(null); await loadData(); }
    catch (err) { setError(err.message); }
  }

  const chartData = useMemo(() => [...checks].reverse().map(item => ({ time: formatTime(item.checkedAt), latency: item.latencyMs, up: item.isUp })), [checks]);

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><Activity size={21}/></div><div><strong>api pulse</strong><span>MONITORING PLATFORM</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <div className="nav-item active"><Gauge size={17}/> Overview</div>
      <div className="nav-item"><Globe2 size={17}/> Monitors <span className="nav-count">{monitors.length}</span></div>
      <div className="nav-item"><AlertTriangle size={17}/> Incidents <span className="nav-count">{monitors.filter(m => m.currentUp === false).length}</span></div>
      <div className="sidebar-bottom"><div className="system-status"><span className="pulse-dot"/> All systems operational<div className="system-sub">API Pulse local workspace</div></div><div className="user-chip"><div className="avatar">AP</div><div><strong>Workspace</strong><span>Local environment</span></div><CircleDot size={15} className="user-dot"/></div></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>Overview</strong></div><div className="top-actions"><div className="live-indicator"><span className="pulse-dot"/> LIVE UPDATES</div><button className="icon-button" onClick={() => loadData()} title="Refresh"><RefreshCw size={16} className={refreshing ? 'spin' : ''}/></button><div className="avatar small">AP</div></div></header>
      <section className="page-heading"><div><div className="eyebrow">MONITORING OVERVIEW</div><h1>Good to see you.</h1><p>Here's what's happening across your monitored endpoints.</p></div><button className="primary-button" onClick={() => { setError(''); setShowForm(true); }}><Plus size={17}/> Add monitor</button></section>

      {error && <div className="alert"><AlertTriangle size={17}/><span>{error}</span><button onClick={() => setError('')}><X size={15}/></button></div>}

      <section className="stats-grid">
        <StatCard label="TOTAL MONITORS" value={summary.totalMonitors ?? 0} icon={Globe2} tone="blue" detail="Configured endpoints"/>
        <StatCard label="OPERATIONAL" value={summary.upMonitors ?? 0} icon={CheckCircle2} tone="green" detail="Currently responding"/>
        <StatCard label="DOWN" value={summary.downMonitors ?? 0} icon={AlertTriangle} tone="red" detail="Needs your attention"/>
        <StatCard label="AVG. RESPONSE TIME" value={summary.averageLatency} suffix=" ms" icon={Zap} tone="purple" detail="Across latest 100 checks"/>
      </section>

      <section className="content-grid">
        <div className="panel monitor-panel"><div className="panel-heading"><div><h2>Monitored endpoints</h2><p>Live health status of your services</p></div><span className="subtle-count">{monitors.length} TOTAL</span></div>
          {loading ? <div className="empty-state">Loading monitors...</div> : monitors.length === 0 ? <div className="empty-state"><div className="empty-icon"><Server size={24}/></div><strong>No monitors yet</strong><span>Add a public API endpoint to start tracking uptime and performance.</span><button className="secondary-button" onClick={() => setShowForm(true)}><Plus size={15}/> Create your first monitor</button></div> : <div className="monitor-list">{monitors.map(monitor => <button key={monitor.id} className={`monitor-row ${activeMonitor?.id === monitor.id ? 'selected' : ''}`} onClick={() => setSelected(monitor)}><div className={`status-symbol ${monitor.currentUp === true ? 'up' : monitor.currentUp === false ? 'down' : 'pending'}`}>{monitor.currentUp === true ? <CheckCircle2 size={17}/> : monitor.currentUp === false ? <AlertTriangle size={17}/> : <Clock3 size={17}/>}</div><div className="monitor-info"><strong>{monitor.name}</strong><span>{monitor.url}</span></div><div className="monitor-metrics"><strong>{monitor.metrics.averageLatency != null ? `${monitor.metrics.averageLatency} ms` : '—'}</strong><span>AVG LATENCY</span></div><div className={`status-pill ${monitor.currentUp === true ? 'healthy' : monitor.currentUp === false ? 'unhealthy' : 'pending-pill'}`}>{monitor.currentUp === true ? 'Operational' : monitor.currentUp === false ? 'Down' : 'Pending'}</div><button className="row-delete" title="Delete monitor" onClick={e => { e.stopPropagation(); deleteMonitor(monitor.id); }}><Trash2 size={15}/></button></button>)}</div>}
        </div>

        <div className="panel detail-panel"><div className="panel-heading"><div><h2>Endpoint details</h2><p>{activeMonitor ? 'Performance snapshot' : 'Select an endpoint'}</p></div>{activeMonitor && <span className={`status-pill ${activeMonitor.currentUp ? 'healthy' : activeMonitor.currentUp === false ? 'unhealthy' : 'pending-pill'}`}>{activeMonitor.currentUp ? 'Operational' : activeMonitor.currentUp === false ? 'Down' : 'Pending'}</span>}</div>
          {activeMonitor ? <><div className="endpoint-title"><div className="endpoint-icon"><Globe2 size={19}/></div><div><strong>{activeMonitor.name}</strong><a href={activeMonitor.url} target="_blank" rel="noreferrer">{activeMonitor.url} <ExternalLink size={11}/></a></div></div><div className="detail-metrics"><div><span>UPTIME (RECENT)</span><strong>{activeMonitor.metrics.uptime != null ? `${activeMonitor.metrics.uptime}%` : '—'}</strong></div><div><span>AVG. LATENCY</span><strong>{activeMonitor.metrics.averageLatency != null ? `${activeMonitor.metrics.averageLatency} <small>ms</small>` : '—'}</strong></div><div><span>LAST CHECKED</span><strong className="last-checked">{formatDate(activeMonitor.lastChecked)}</strong></div></div><div className="chart-heading"><strong>Response time</strong><span>LAST 50 CHECKS</span></div><div className="chart-wrap">{chartData.some(item => item.latency != null) ? <ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="latencyFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6d8cff" stopOpacity={0.28}/><stop offset="95%" stopColor="#6d8cff" stopOpacity={0.01}/></linearGradient></defs><CartesianGrid stroke="#222b3b" strokeDasharray="3 5" vertical={false}/><XAxis dataKey="time" tick={{ fill: '#77839a', fontSize: 10 }} axisLine={false} tickLine={false}/><YAxis tick={{ fill: '#77839a', fontSize: 10 }} axisLine={false} tickLine={false} width={35}/><Tooltip contentStyle={{ background: '#151d2c', border: '1px solid #293449', borderRadius: 9, color: '#edf2ff' }} formatter={value => [`${value} ms`, 'Latency']}/><Area type="monotone" dataKey="latency" stroke="#7d96ff" strokeWidth={2} fill="url(#latencyFill)" connectNulls/></AreaChart></ResponsiveContainer> : <div className="chart-empty">Waiting for the first monitoring results…</div>}</div><div className="detail-footer"><span><ShieldCheck size={14}/> Checks every 60 seconds</span><span><Clock3 size={14}/> Added {new Date(activeMonitor.createdAt).toLocaleDateString()}</span></div></> : <div className="empty-state compact"><div className="empty-icon"><Activity size={22}/></div><span>Your endpoint metrics will appear here.</span></div>}
        </div>
      </section>

      <section className="panel activity-panel"><div className="panel-heading"><div><h2>Recent check activity</h2><p>Latest monitoring events across your endpoints</p></div><span className="subtle-count">LATEST EVENTS</span></div>{monitors.flatMap(m => (m.checks || []).map(c => ({ ...c, monitorName: m.name }))).sort((a,b) => new Date(b.checkedAt)-new Date(a.checkedAt)).slice(0,8).length ? <div className="activity-table"><div className="activity-header"><span>ENDPOINT</span><span>RESULT</span><span>LATENCY</span><span>TIME</span></div>{monitors.flatMap(m => (m.checks || []).map(c => ({ ...c, monitorName: m.name }))).sort((a,b) => new Date(b.checkedAt)-new Date(a.checkedAt)).slice(0,8).map(check => <div className="activity-row" key={check.id}><span className="activity-name"><span className={`mini-dot ${check.isUp ? 'green-dot' : 'red-dot'}`}/>{check.monitorName}</span><span className={check.isUp ? 'result-ok' : 'result-fail'}>{check.isUp ? `HTTP ${check.statusCode ?? 'OK'}` : check.error || 'Failed'}</span><span>{check.latencyMs != null ? `${check.latencyMs} ms` : '—'} {check.isAnomaly && <span className="anomaly-tag">ANOMALY</span>}</span><span className="activity-time">{formatDate(check.checkedAt)}</span></div>)}</div> : <div className="activity-empty">No check activity yet. Your first check will appear shortly after adding a monitor.</div>}</section>
      <footer className="footer"><span>API PULSE <b>·</b> LOCAL MONITORING WORKSPACE</span><span>Built with Node.js, Python & React</span></footer>
    </main>

    {showForm && <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setShowForm(false); }}><form className="modal" onSubmit={createMonitor}><div className="modal-heading"><div><div className="eyebrow">NEW ENDPOINT</div><h2>Add a monitor</h2><p>Start tracking a public HTTP or HTTPS endpoint.</p></div><button type="button" className="icon-button" onClick={() => setShowForm(false)}><X size={18}/></button></div><label>Monitor name<input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. GitHub API" minLength="2" maxLength="60" required/></label><label>Endpoint URL<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://api.github.com" type="url" required/></label><div className="form-note"><ShieldCheck size={15}/> Public HTTP/HTTPS URLs only. Local and private network targets are blocked.</div>{error && <div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? 'Adding…' : <><Plus size={16}/> Add monitor</>}</button></div></form></div>}
  </div>;
}
