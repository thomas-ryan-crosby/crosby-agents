import { useState, useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, CartesianGrid, Legend } from "recharts";
import { Activity, CheckCircle, Clock, AlertCircle, FileText, Mail, MessageSquare, TrendingUp, Briefcase, Image, ChevronRight, Calendar, Filter, LayoutDashboard, Building2, Bot, Eye, RotateCcw, Check, X } from "lucide-react";

// ── Sample Data (Metairie Plaza as test property) ──────────────────────────
const PROPERTIES = [
  { slug: "metairie-plaza", name: "Metairie Plaza", location: "Metairie, LA", units: 66, occupancy: 91, class: "Multi-Family" },
  { slug: "mandeville-lake-apartments", name: "Mandeville Lake Apartments", location: "Mandeville, LA", units: 0, occupancy: 0, class: "Multi-Family" },
  { slug: "sanctuary-office-park", name: "Sanctuary Office Park", location: "Mandeville, LA", units: 0, occupancy: 0, class: "Commercial" },
  { slug: "lakeside-village-townhomes", name: "Lakeside Village Townhomes", location: "Mandeville, LA", units: 0, occupancy: 0, class: "Multi-Family" },
  { slug: "gulf-south-commerce-park", name: "Gulf South Commerce Park", location: "Mandeville, LA", units: 0, occupancy: 0, class: "Industrial" },
  { slug: "delimon-place", name: "DeLimon Place", location: "Metairie, LA", units: 0, occupancy: 0, class: "Residential" },
  { slug: "metairie-lake-apartments", name: "Metairie Lake Apartments", location: "Metairie, LA", units: 0, occupancy: 0, class: "Multi-Family" },
  { slug: "the-sanctuary", name: "The Sanctuary", location: "Mandeville, LA", units: 0, occupancy: 0, class: "Residential" },
];

const AGENTS = [
  { slug: "listing-copy-agent", name: "Listing Copy", icon: FileText, phase: 1, color: "#2563eb" },
  { slug: "brochure-builder-agent", name: "Brochure Builder", icon: Image, phase: 2, color: "#7c3aed" },
  { slug: "email-campaign-agent", name: "Email Campaign", icon: Mail, phase: 2, color: "#059669" },
  { slug: "social-media-agent", name: "Social Media", icon: MessageSquare, phase: 2, color: "#d97706" },
  { slug: "market-analysis-agent", name: "Market Analysis", icon: TrendingUp, phase: 3, color: "#dc2626" },
  { slug: "commercial-pitch-agent", name: "Commercial Pitch", icon: Briefcase, phase: 3, color: "#0891b2" },
];

const ACTIVITY_FEED = [
  { id: 1, agent: "listing-copy-agent", property: "metairie-plaza", task: "Generated full listing copy suite", output: "2026-04-01_listing-copy_full-suite.md", status: "pending_review", timestamp: "2026-04-01T14:30:00Z" },
  { id: 2, agent: "listing-copy-agent", property: "metairie-plaza", task: "Created A/B headline pairs for 2BR Flat", output: "2026-04-01_listing-copy_ab-headlines-2br.md", status: "approved", timestamp: "2026-04-01T11:15:00Z" },
  { id: 3, agent: "email-campaign-agent", property: "metairie-plaza", task: "Drafted prospect inquiry response template", output: "2026-04-01_email_inquiry-response.md", status: "pending_review", timestamp: "2026-04-01T10:00:00Z" },
  { id: 4, agent: "brochure-builder-agent", property: "metairie-plaza", task: "Created 2-page property brochure", output: "2026-03-31_brochure_metairie-plaza-overview.pdf", status: "revision_requested", timestamp: "2026-03-31T16:45:00Z" },
  { id: 5, agent: "social-media-agent", property: "metairie-plaza", task: "Generated April content calendar", output: "2026-04_social-calendar.md", status: "approved", timestamp: "2026-03-31T09:00:00Z" },
  { id: 6, agent: "listing-copy-agent", property: "metairie-plaza", task: "Wrote 3BR Townhome descriptions (3 lengths)", output: "2026-03-30_listing-copy_3br-th.md", status: "approved", timestamp: "2026-03-30T15:20:00Z" },
  { id: 7, agent: "market-analysis-agent", property: "metairie-plaza", task: "Q1 2026 Metairie submarket report", output: "2026-Q1_market-report.md", status: "approved", timestamp: "2026-03-28T13:00:00Z" },
  { id: 8, agent: "email-campaign-agent", property: "metairie-plaza", task: "Built 5-email prospect drip sequence", output: "2026-03-28_email_prospect-drip.md", status: "approved", timestamp: "2026-03-28T10:30:00Z" },
  { id: 9, agent: "listing-copy-agent", property: "metairie-plaza", task: "Updated Extended 3BR descriptions for vacancy", output: "2026-03-27_listing-copy_ex3br-vacancy.md", status: "approved", timestamp: "2026-03-27T11:00:00Z" },
  { id: 10, agent: "commercial-pitch-agent", property: "sanctuary-office-park", task: "Generated LOI template for Suite 200", output: "LOI_TEMPLATE_suite-200.docx", status: "pending_review", timestamp: "2026-03-26T14:00:00Z" },
];

const SCHEDULED_TASKS = [
  { agent: "social-media-agent", property: "metairie-plaza", task: "Generate weekly social posts", frequency: "Weekly (Monday)", nextRun: "2026-04-07" },
  { agent: "social-media-agent", property: "metairie-plaza", task: "Publish content calendar", frequency: "Monthly (1st)", nextRun: "2026-05-01" },
  { agent: "market-analysis-agent", property: "metairie-plaza", task: "Quarterly market report", frequency: "Quarterly", nextRun: "2026-07-01" },
  { agent: "market-analysis-agent", property: "metairie-plaza", task: "Monthly comp analysis", frequency: "Monthly (15th)", nextRun: "2026-04-15" },
  { agent: "email-campaign-agent", property: "metairie-plaza", task: "Resident newsletter", frequency: "Monthly (1st)", nextRun: "2026-05-01" },
  { agent: "listing-copy-agent", property: "metairie-plaza", task: "Vacancy listing refresh", frequency: "On vacancy change", nextRun: "On trigger" },
];

const WEEKLY_PRODUCTION = [
  { week: "Mar 3", produced: 2, approved: 2, revised: 0 },
  { week: "Mar 10", produced: 5, approved: 4, revised: 1 },
  { week: "Mar 17", produced: 4, approved: 3, revised: 1 },
  { week: "Mar 24", produced: 6, approved: 5, revised: 1 },
  { week: "Mar 31", produced: 8, approved: 6, revised: 2 },
  { week: "Apr 1", produced: 3, approved: 1, revised: 0 },
];

// ── Utility functions ──────────────────────────────────────────────────────
const getAgent = (slug) => AGENTS.find(a => a.slug === slug);
const getProperty = (slug) => PROPERTIES.find(p => p.slug === slug);
const statusLabel = (s) => ({ approved: "Approved", pending_review: "Pending Review", revision_requested: "Revision Requested" }[s] || s);
const statusColor = (s) => ({ approved: "bg-emerald-100 text-emerald-800", pending_review: "bg-amber-100 text-amber-800", revision_requested: "bg-red-100 text-red-800" }[s] || "bg-gray-100 text-gray-600");
const formatTime = (iso) => { const d = new Date(iso); return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }); };

// ── Components ─────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-start gap-4">
      <div className={`p-2.5 rounded-lg ${accent || "bg-blue-50"}`}>
        <Icon size={20} className={accent ? "text-white" : "text-blue-600"} />
      </div>
      <div>
        <p className="text-sm text-gray-500 font-medium">{label}</p>
        <p className="text-2xl font-bold text-gray-900 mt-0.5">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
      </div>
    </div>
  );
}

function AgentStatusRow({ agent, activities }) {
  const agentActs = activities.filter(a => a.agent === agent.slug);
  const lastRun = agentActs.length > 0 ? agentActs[0] : null;
  const pending = agentActs.filter(a => a.status === "pending_review").length;
  const Icon = agent.icon;

  const scheduled = SCHEDULED_TASKS.filter(s => s.agent === agent.slug);
  const nextTask = scheduled.length > 0 ? scheduled[0] : null;

  return (
    <div className="flex items-center gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="p-2 rounded-lg" style={{ backgroundColor: agent.color + "15" }}>
        <Icon size={18} style={{ color: agent.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-sm text-gray-900">{agent.name}</p>
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">Phase {agent.phase}</span>
        </div>
        <p className="text-xs text-gray-400 truncate mt-0.5">
          {lastRun ? `Last: ${lastRun.task}` : "No tasks yet"}
        </p>
      </div>
      <div className="text-right shrink-0">
        {lastRun ? (
          <>
            <p className="text-xs text-gray-500">{formatTime(lastRun.timestamp)}</p>
            {pending > 0 && <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mt-1 inline-block">{pending} pending</span>}
          </>
        ) : (
          <span className="text-xs text-gray-300">Idle</span>
        )}
      </div>
    </div>
  );
}

function ActivityRow({ item }) {
  const agent = getAgent(item.agent);
  const prop = getProperty(item.property);
  const Icon = agent?.icon || Activity;

  return (
    <div className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
      <div className="p-1.5 rounded-md mt-0.5" style={{ backgroundColor: (agent?.color || "#666") + "15" }}>
        <Icon size={14} style={{ color: agent?.color || "#666" }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800">{item.task}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs text-gray-400">{agent?.name}</span>
          <span className="text-xs text-gray-300">|</span>
          <span className="text-xs text-gray-400">{prop?.name}</span>
          <span className="text-xs text-gray-300">|</span>
          <span className="text-xs text-gray-400">{formatTime(item.timestamp)}</span>
        </div>
      </div>
      <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${statusColor(item.status)}`}>
        {statusLabel(item.status)}
      </span>
    </div>
  );
}

function ApprovalCard({ item, onApprove, onReject, onRegenerate }) {
  const agent = getAgent(item.agent);
  const prop = getProperty(item.property);
  const Icon = agent?.icon || Activity;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg" style={{ backgroundColor: (agent?.color || "#666") + "15" }}>
          <Icon size={16} style={{ color: agent?.color || "#666" }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-gray-900">{item.task}</p>
          <p className="text-xs text-gray-400 mt-0.5">{agent?.name} &middot; {prop?.name} &middot; {formatTime(item.timestamp)}</p>
          <p className="text-xs text-gray-500 mt-2 bg-gray-50 rounded px-2 py-1.5 font-mono truncate">{item.output}</p>
        </div>
      </div>
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        <button onClick={() => onApprove(item.id)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
          <Check size={13} /> Approve
        </button>
        <button className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100 transition-colors">
          <Eye size={13} /> Review
        </button>
        <button onClick={() => onRegenerate(item.id)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors">
          <RotateCcw size={13} /> Regenerate
        </button>
        <button onClick={() => onReject(item.id)} className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-red-50 text-red-700 hover:bg-red-100 transition-colors ml-auto">
          <X size={13} /> Reject
        </button>
      </div>
    </div>
  );
}

function PropertyCard({ property }) {
  const acts = ACTIVITY_FEED.filter(a => a.property === property.slug);
  const pending = acts.filter(a => a.status === "pending_review").length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 transition-colors cursor-pointer">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-sm text-gray-900">{property.name}</p>
          <p className="text-xs text-gray-400">{property.location} &middot; {property.class}</p>
        </div>
        <ChevronRight size={16} className="text-gray-300" />
      </div>
      {property.units > 0 ? (
        <div className="mt-3 flex items-center gap-4">
          <div>
            <p className="text-lg font-bold text-gray-900">{property.units}</p>
            <p className="text-xs text-gray-400">Units</p>
          </div>
          <div>
            <p className="text-lg font-bold text-emerald-600">{property.occupancy}%</p>
            <p className="text-xs text-gray-400">Occupied</p>
          </div>
          <div>
            <p className="text-lg font-bold text-gray-900">{acts.length}</p>
            <p className="text-xs text-gray-400">Outputs</p>
          </div>
          {pending > 0 && (
            <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">{pending} pending</span>
          )}
        </div>
      ) : (
        <p className="text-xs text-gray-300 mt-3 italic">Not yet configured</p>
      )}
    </div>
  );
}

// ── Pie chart data for agent breakdown ─────────────────────────────────────
const AGENT_OUTPUT_COUNTS = AGENTS.map(a => ({
  name: a.name,
  value: ACTIVITY_FEED.filter(act => act.agent === a.slug).length,
  color: a.color,
})).filter(d => d.value > 0);

// ── Main Dashboard ─────────────────────────────────────────────────────────
export default function CrosbyDashboard() {
  const [view, setView] = useState("portfolio");
  const [activities, setActivities] = useState(ACTIVITY_FEED);
  const [filterAgent, setFilterAgent] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  const filtered = useMemo(() => {
    return activities.filter(a =>
      (filterAgent === "all" || a.agent === filterAgent) &&
      (filterStatus === "all" || a.status === filterStatus)
    );
  }, [activities, filterAgent, filterStatus]);

  const pendingItems = activities.filter(a => a.status === "pending_review" || a.status === "revision_requested");
  const totalProduced = activities.length;
  const totalApproved = activities.filter(a => a.status === "approved").length;
  const approvalRate = totalProduced > 0 ? Math.round((totalApproved / totalProduced) * 100) : 0;

  const handleApprove = (id) => {
    setActivities(prev => prev.map(a => a.id === id ? { ...a, status: "approved" } : a));
  };
  const handleReject = (id) => {
    setActivities(prev => prev.filter(a => a.id !== id));
  };
  const handleRegenerate = (id) => {
    setActivities(prev => prev.map(a => a.id === id ? { ...a, status: "pending_review", timestamp: new Date().toISOString() } : a));
  };

  const NAV = [
    { id: "portfolio", label: "Portfolio", icon: LayoutDashboard },
    { id: "activity", label: "Activity", icon: Activity },
    { id: "agents", label: "Agents", icon: Bot },
    { id: "approvals", label: "Approvals", icon: CheckCircle, badge: pendingItems.length },
    { id: "schedule", label: "Schedule", icon: Calendar },
    { id: "metrics", label: "Metrics", icon: TrendingUp },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ─ Header ─ */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Building2 size={18} className="text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">Crosby Development</h1>
              <p className="text-xs text-gray-400">Agent Interaction Dashboard</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingItems.length > 0 && (
              <button onClick={() => setView("approvals")} className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors">
                <AlertCircle size={14} /> {pendingItems.length} items need review
              </button>
            )}
            <span className="text-xs text-gray-400 ml-2">April 1, 2026</span>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* ─ Navigation ─ */}
        <nav className="flex gap-1 mb-6 bg-white rounded-xl p-1 border border-gray-200 w-fit">
          {NAV.map(n => (
            <button
              key={n.id}
              onClick={() => setView(n.id)}
              className={`flex items-center gap-1.5 text-sm font-medium px-4 py-2 rounded-lg transition-colors ${
                view === n.id ? "bg-blue-600 text-white" : "text-gray-500 hover:text-gray-900 hover:bg-gray-50"
              }`}
            >
              <n.icon size={15} />
              {n.label}
              {n.badge > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${
                  view === n.id ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                }`}>{n.badge}</span>
              )}
            </button>
          ))}
        </nav>

        {/* ═══════ PORTFOLIO VIEW ═══════ */}
        {view === "portfolio" && (
          <div className="space-y-6">
            {/* Summary stats */}
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="Total Properties" value={PROPERTIES.length} sub="2 markets" icon={Building2} />
              <StatCard label="Materials Produced" value={totalProduced} sub="This period" icon={FileText} />
              <StatCard label="Approval Rate" value={`${approvalRate}%`} sub={`${totalApproved} of ${totalProduced}`} icon={CheckCircle} />
              <StatCard label="Pending Review" value={pendingItems.length} sub="Action needed" icon={Clock} />
            </div>

            {/* Property grid */}
            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Properties</h2>
              <div className="grid grid-cols-2 gap-3">
                {PROPERTIES.map(p => <PropertyCard key={p.slug} property={p} />)}
              </div>
            </div>

            {/* Recent activity */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
                <button onClick={() => setView("activity")} className="text-xs text-blue-600 font-medium hover:text-blue-800">View all</button>
              </div>
              {activities.slice(0, 5).map(a => <ActivityRow key={a.id} item={a} />)}
            </div>
          </div>
        )}

        {/* ═══════ ACTIVITY VIEW ═══════ */}
        {view === "activity" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                <Filter size={14} className="text-gray-400" />
                <select
                  value={filterAgent}
                  onChange={e => setFilterAgent(e.target.value)}
                  className="text-sm text-gray-700 bg-transparent border-none outline-none"
                >
                  <option value="all">All Agents</option>
                  {AGENTS.map(a => <option key={a.slug} value={a.slug}>{a.name}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="text-sm text-gray-700 bg-transparent border-none outline-none"
                >
                  <option value="all">All Statuses</option>
                  <option value="approved">Approved</option>
                  <option value="pending_review">Pending Review</option>
                  <option value="revision_requested">Revision Requested</option>
                </select>
              </div>
              <span className="text-xs text-gray-400">{filtered.length} items</span>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              {filtered.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">No activity matching filters</p>
              ) : (
                filtered.map(a => <ActivityRow key={a.id} item={a} />)
              )}
            </div>
          </div>
        )}

        {/* ═══════ AGENTS VIEW ═══════ */}
        {view === "agents" && (
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Agent Status</h2>
              {AGENTS.map(a => <AgentStatusRow key={a.slug} agent={a} activities={activities} />)}
            </div>
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-3">Output by Agent</h2>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={AGENT_OUTPUT_COUNTS} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} innerRadius={40} paddingAngle={3}>
                      {AGENT_OUTPUT_COUNTS.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v + " outputs", n]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 mt-2">
                  {AGENT_OUTPUT_COUNTS.map((d, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }}></span>
                        <span className="text-gray-600">{d.name}</span>
                      </div>
                      <span className="font-medium text-gray-900">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">Deployment Phases</h2>
                {[1, 2, 3].map(phase => (
                  <div key={phase} className="mb-3 last:mb-0">
                    <p className="text-xs font-medium text-gray-500 mb-1">Phase {phase}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {AGENTS.filter(a => a.phase === phase).map(a => (
                        <span key={a.slug} className="text-xs px-2 py-1 rounded-md" style={{ backgroundColor: a.color + "15", color: a.color }}>{a.name}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════ APPROVALS VIEW ═══════ */}
        {view === "approvals" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <h2 className="text-sm font-semibold text-gray-700">Approval Queue</h2>
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">{pendingItems.length} items</span>
            </div>
            {pendingItems.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
                <p className="text-sm text-gray-500">All caught up! No items pending review.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {pendingItems.map(item => (
                  <ApprovalCard key={item.id} item={item} onApprove={handleApprove} onReject={handleReject} onRegenerate={handleRegenerate} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══════ SCHEDULE VIEW ═══════ */}
        {view === "schedule" && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-gray-700">Scheduled Agent Tasks</h2>
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Agent</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Property</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Task</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Frequency</th>
                    <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Run</th>
                  </tr>
                </thead>
                <tbody>
                  {SCHEDULED_TASKS.map((task, i) => {
                    const agent = getAgent(task.agent);
                    const prop = getProperty(task.property);
                    const Icon = agent?.icon || Activity;
                    return (
                      <tr key={i} className="border-b border-gray-50 last:border-0 hover:bg-gray-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <Icon size={14} style={{ color: agent?.color }} />
                            <span className="text-gray-800 font-medium">{agent?.name}</span>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-gray-600">{prop?.name}</td>
                        <td className="px-5 py-3 text-gray-800">{task.task}</td>
                        <td className="px-5 py-3"><span className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">{task.frequency}</span></td>
                        <td className="px-5 py-3 text-gray-500 font-mono text-xs">{task.nextRun}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══════ METRICS VIEW ═══════ */}
        {view === "metrics" && (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="Total Outputs" value={totalProduced} sub="All time" icon={FileText} />
              <StatCard label="Approval Rate" value={`${approvalRate}%`} sub="First-draft approval" icon={CheckCircle} />
              <StatCard label="Avg Turnaround" value="35 min" sub="Request to delivery" icon={Clock} />
              <StatCard label="Revisions" value={activities.filter(a => a.status === "revision_requested").length} sub="Currently pending" icon={RotateCcw} />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Weekly Production</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={WEEKLY_PRODUCTION}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="produced" name="Produced" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="approved" name="Approved" fill="#059669" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="revised" name="Revised" fill="#d97706" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Approval Rate Trend</h2>
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={WEEKLY_PRODUCTION.map(w => ({
                    ...w,
                    rate: w.produced > 0 ? Math.round((w.approved / w.produced) * 100) : 0,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="week" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} tickFormatter={v => v + "%"} />
                    <Tooltip formatter={v => v + "%"} />
                    <Line type="monotone" dataKey="rate" name="Approval Rate" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4, fill: "#2563eb" }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Metairie Plaza specific */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-1">Metairie Plaza — Property Snapshot</h2>
              <p className="text-xs text-gray-400 mb-4">66 units &middot; Metairie, LA &middot; Data from 2026 Rent Roll</p>
              <div className="grid grid-cols-5 gap-4">
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">66</p>
                  <p className="text-xs text-gray-500">Total Units</p>
                </div>
                <div className="text-center p-3 bg-emerald-50 rounded-lg">
                  <p className="text-2xl font-bold text-emerald-700">60</p>
                  <p className="text-xs text-gray-500">Occupied</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <p className="text-2xl font-bold text-amber-700">4</p>
                  <p className="text-xs text-gray-500">Vacant</p>
                </div>
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <p className="text-2xl font-bold text-blue-700">91%</p>
                  <p className="text-xs text-gray-500">Occupancy</p>
                </div>
                <div className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold text-gray-900">8</p>
                  <p className="text-xs text-gray-500">Unit Types</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
