import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import {
  collection, query, where, onSnapshot, orderBy, getDocs
} from "firebase/firestore";
import { format } from "date-fns";

// ── Dept meta ──────────────────────────────────────────────────────────────
const DEPT_META = {
  reception:    { label: "Reception",  icon: "🏥", color: "bg-slate-100 text-slate-700",    bar: "#94A3B8" },
  consultation: { label: "Doctor",     icon: "👨‍⚕️", color: "bg-blue-50 text-blue-700",      bar: "#0D2C6E" },
  lab:          { label: "Lab",        icon: "🔬", color: "bg-violet-50 text-violet-700",   bar: "#7C3AED" },
  pharmacy:     { label: "Pharmacy",   icon: "💊", color: "bg-amber-50 text-amber-700",     bar: "#D97706" },
  billing:      { label: "Billing",    icon: "💳", color: "bg-emerald-50 text-emerald-700", bar: "#059669" },
  done:         { label: "Discharged", icon: "✓",  color: "bg-slate-50 text-slate-600",     bar: "#00A9E0" },
};

// ── Stat cards ─────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent, icon }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm relative overflow-hidden">
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-xl" style={{ background: accent }} />
      <div className="pl-3">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
        <p className="text-2xl font-bold" style={{ color: accent }}>{value}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Pipeline bar chart ─────────────────────────────────────────────────────
function DeptPipelineBar({ visits }) {
  const counts = {};
  Object.keys(DEPT_META).forEach(k => (counts[k] = 0));
  visits.forEach(v => {
    const dept = v.currentDepartment || "reception";
    if (counts[dept] !== undefined) counts[dept]++;
  });
  const total = visits.length || 1;

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-1 h-4 rounded-full" style={{ background: "#00A9E0" }} />
          <p className="text-sm font-bold text-[#0D2C6E]">Patient Pipeline</p>
        </div>
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest">Today · Live</span>
      </div>
      <div className="space-y-3.5">
        {Object.entries(DEPT_META).map(([key, meta]) => {
          const count = counts[key] || 0;
          const pct   = Math.round((count / total) * 100);
          return (
            <div key={key} className="flex items-center gap-3">
              <div className="w-[88px] text-xs font-medium text-slate-600 flex items-center gap-1.5 flex-shrink-0">
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
              </div>
              <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width:      count > 0 ? `${Math.max(pct, 3)}%` : "0%",
                    background: meta.bar,
                  }}
                />
              </div>
              <span className="text-xs font-bold text-slate-700 w-4 text-right flex-shrink-0">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Visit row in the live log ──────────────────────────────────────────────
function VisitLogRow({ visit, patientMap }) {
  const dept    = visit.currentDepartment || "reception";
  const meta    = DEPT_META[dept] || DEPT_META.reception;
  const time    = visit.createdAt?.toDate ? format(visit.createdAt.toDate(), "HH:mm") : "--:--";
  const name    = patientMap[visit.patientId] || "—";
  const initials = name.split(" ").map(n => n[0]).slice(0,2).join("");
  const isEmerg = visit.visitType === "Emergency";

  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
      <div className="flex items-center gap-3">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0 text-white ${isEmerg ? "bg-red-500" : ""}`}
             style={!isEmerg ? { background: "linear-gradient(135deg, #0D2C6E 0%, #00A9E0 100%)" } : {}}>
          {initials}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            {name}
            {isEmerg && <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">⚡</span>}
          </p>
          <p className="text-[11px] text-slate-400">{visit.visitType} · {time}</p>
        </div>
      </div>
      <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${meta.color}`}>
        {meta.icon} {meta.label}
      </span>
    </div>
  );
}

// ── Dept load mini tiles ───────────────────────────────────────────────────
function DeptLoadTile({ deptKey, meta, count }) {
  return (
    <div className={`rounded-xl p-3 text-center ${meta.color}`}>
      <p className="text-xl font-bold">{count}</p>
      <p className="text-[10px] font-semibold mt-0.5 uppercase tracking-wide">
        {meta.icon} {meta.label}
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function AdminDashboard({ clinicId, userProfile }) {
  const [visits, setVisits]       = useState([]);
  const [patientMap, setPatientMap] = useState({});
  const [revenue, setRevenue]     = useState(0);
  const [loading, setLoading]     = useState(true);

  // Real-time today's visits
  useEffect(() => {
    if (!clinicId) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, "visits"),
      where("clinicId", "==", clinicId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, async (snap) => {
      const all         = snap.docs.map(d => ({ visitId: d.id, ...d.data() }));
      const todayVisits = all.filter(v => v.createdAt?.toDate && v.createdAt.toDate() >= today);
      setVisits(todayVisits);

      const ids = [...new Set(todayVisits.map(v => v.patientId))];
      const map = { ...patientMap };
      for (const pid of ids) {
        if (!map[pid]) {
          try {
            const pSnap = await getDocs(
              query(collection(db, "patients"), where("__name__", "==", pid))
            );
            if (!pSnap.empty) {
              const p = pSnap.docs[0].data();
              map[pid] = `${p.firstName} ${p.lastName}`;
            }
          } catch {}
        }
      }
      setPatientMap(map);
      setLoading(false);
    });
  }, [clinicId]);

  // Real-time revenue
  useEffect(() => {
    if (!clinicId) return;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const q = query(
      collection(db, "invoices"),
      where("clinicId", "==", clinicId),
      where("status", "==", "paid")
    );
    return onSnapshot(q, (snap) => {
      let total = 0;
      snap.docs.forEach(d => {
        const data = d.data();
        if (data.paidAt?.toDate && data.paidAt.toDate() >= today) total += data.totalAmount || 0;
      });
      setRevenue(total);
    });
  }, [clinicId]);

  const activeVisits   = visits.filter(v => v.status !== "done");
  const doneVisits     = visits.filter(v => v.status === "done");
  const emergencies    = visits.filter(v => v.visitType === "Emergency" && v.status !== "done");
  const waitingAtDesk  = visits.filter(v => !v.currentDepartment || v.currentDepartment === "reception");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24" style={{ background: "#F7F9FC", minHeight: "100vh" }}>
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3"
               style={{ borderColor: "#0D2C6E", borderTopColor: "transparent" }} />
          <p className="text-slate-400 text-sm font-medium">Loading dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5" style={{ background: "#F7F9FC", minHeight: "100vh", padding: "1rem" }}>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <div className="w-1 h-5 rounded-full" style={{ background: "#00A9E0" }} />
            <h1 className="text-xl font-bold text-[#0D2C6E] tracking-tight">Dashboard</h1>
          </div>
          <p className="text-xs text-slate-500 pl-3">
            {format(new Date(), "EEEE, dd MMMM yyyy")}
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-full">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-semibold text-emerald-700">Live</span>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Total Visits"  value={visits.length}        sub="today"             accent="#0D2C6E" />
        <KpiCard label="Active"        value={activeVisits.length}  sub="in system"         accent="#D97706" />
        <KpiCard label="Discharged"    value={doneVisits.length}    sub="completed"         accent="#059669" />
        <KpiCard
          label="Revenue"
          value={revenue >= 1000 ? `${(revenue/1000).toFixed(0)}K` : revenue.toLocaleString()}
          sub="UGX collected"
          accent="#7C3AED"
        />
      </div>

      {/* Emergency banner */}
      {emergencies.length > 0 && (
        <div className="rounded-xl border-2 border-red-300 p-4 flex items-center gap-3"
             style={{ background: "linear-gradient(135deg, #FEF2F2 0%, #FEE2E2 100%)" }}>
          <div className="w-10 h-10 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0 text-white text-lg animate-pulse">
            ⚡
          </div>
          <div>
            <p className="font-bold text-red-800 text-sm">
              {emergencies.length} Active Emergency{emergencies.length !== 1 ? " Cases" : ""}
            </p>
            <p className="text-xs text-red-600 mt-0.5">Check Reception and Doctor queues immediately</p>
          </div>
        </div>
      )}

      {/* Pipeline */}
      <DeptPipelineBar visits={visits} />

      {/* Unrouted alert */}
      {waitingAtDesk.length > 0 && (
        <div className="rounded-xl border border-amber-300 p-4 flex items-center gap-3"
             style={{ background: "linear-gradient(135deg, #FFFBEB 0%, #FEF3C7 100%)" }}>
          <span className="text-xl">⏳</span>
          <p className="text-sm font-semibold text-amber-800">
            {waitingAtDesk.length} patient{waitingAtDesk.length !== 1 ? "s" : ""} at Reception — not yet routed to a department
          </p>
        </div>
      )}

      {/* Department load */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-1 h-4 rounded-full" style={{ background: "#00A9E0" }} />
          <p className="text-sm font-bold text-[#0D2C6E]">Current Load by Department</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {Object.entries(DEPT_META)
            .filter(([k]) => k !== "done")
            .map(([key, meta]) => {
              const count = visits.filter(
                v => (v.currentDepartment || "reception") === key && v.status !== "done"
              ).length;
              return <DeptLoadTile key={key} deptKey={key} meta={meta} count={count} />;
            })}
        </div>
      </div>

      {/* Today's visit log */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-1 h-4 rounded-full" style={{ background: "#00A9E0" }} />
            <p className="text-sm font-bold text-[#0D2C6E]">Today's Visit Log</p>
          </div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            {visits.length} total
          </span>
        </div>

        {visits.length === 0 ? (
          <div className="text-center py-8 text-slate-400">
            <p className="text-3xl mb-2">📋</p>
            <p className="text-sm font-medium">No visits recorded today</p>
          </div>
        ) : (
          <div>
            {visits.slice(0, 20).map(visit => (
              <VisitLogRow key={visit.visitId} visit={visit} patientMap={patientMap} />
            ))}
            {visits.length > 20 && (
              <p className="text-xs text-slate-400 text-center pt-3">
                +{visits.length - 20} more visits today
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
