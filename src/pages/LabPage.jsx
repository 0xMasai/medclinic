import { useState, useEffect } from "react";
import { db } from "../firebase/config";
import {
  collection, query, where, onSnapshot, orderBy,
  updateDoc, doc, getDoc, addDoc, serverTimestamp
} from "firebase/firestore";
import { format } from "date-fns";

// ── Shared brand primitives ────────────────────────────────────────────────
function PageHeader({ title, sub }) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 mb-0.5">
        <div className="w-1 h-5 rounded-full" style={{ background: "#00A9E0" }} />
        <h1 className="text-xl font-bold text-[#0D2C6E] tracking-tight">{title}</h1>
      </div>
      <p className="text-xs text-slate-500 pl-3">{sub}</p>
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">
      {children}
    </p>
  );
}

function NavyBtn({ onClick, disabled, children, className = "" }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg font-semibold text-sm text-white transition-all active:scale-95 disabled:opacity-50 shadow-sm ${className}`}
      style={{ background: "linear-gradient(135deg, #0D2C6E 0%, #1a3f94 100%)" }}
    >
      {children}
    </button>
  );
}

// ── Send To routing menu ───────────────────────────────────────────────────
const SEND_TO_OPTIONS = [
  { value: "consultation", label: "Back to Doctor", icon: "👨‍⚕️" },
  { value: "pharmacy",     label: "Pharmacy",       icon: "💊" },
  { value: "billing",      label: "Billing",        icon: "💳" },
];

function SendToMenu({ visit }) {
  const [open, setOpen]       = useState(false);
  const [sending, setSending] = useState(false);

  const handleSend = async (dept) => {
    setSending(true);
    try {
      await updateDoc(doc(db, "visits", visit.visitId), {
        currentDepartment: dept.value,
        status: "waiting",
      });
      setOpen(false);
    } catch {
      alert("Failed to route patient. Check connection.");
    }
    setSending(false);
  };

  return (
    <div className="relative">
      <NavyBtn onClick={() => setOpen(!open)} disabled={sending} className="w-full py-3.5 px-5">
        {sending ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            Routing…
          </span>
        ) : "Route Patient →"}
      </NavyBtn>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 bottom-14 z-20 bg-white rounded-xl border border-slate-100 overflow-hidden"
               style={{ boxShadow: "0 20px 60px rgba(13,44,110,0.15)" }}>
            <div className="px-5 py-3 border-b border-slate-100">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select destination</p>
            </div>
            {SEND_TO_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleSend(opt)}
                className="w-full text-left px-5 py-3.5 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-0 flex items-center gap-3"
              >
                <span>{opt.icon}</span>
                <span>{opt.label}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Lab visit detail ───────────────────────────────────────────────────────
function LabVisitDetail({ visit, patient, clinicId, onBack }) {
  const [tests, setTests]           = useState([]);
  const [editingId, setEditingId]   = useState(null);
  const [resultText, setResultText] = useState("");
  const [saving, setSaving]         = useState(false);
  const [newTestName, setNewTestName] = useState("");
  const [addingTest, setAddingTest] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "lab_tests"), where("visitId", "==", visit.visitId));
    return onSnapshot(q, (snap) => {
      setTests(snap.docs.map(d => ({ labTestId: d.id, ...d.data() })));
    });
  }, [visit.visitId]);

  useEffect(() => {
    if (visit.status === "waiting") {
      updateDoc(doc(db, "visits", visit.visitId), { status: "in_consultation" }).catch(() => {});
    }
  }, [visit.visitId, visit.status]);

  const handleAddTest = async () => {
    if (!newTestName.trim()) return;
    setAddingTest(true);
    try {
      await addDoc(collection(db, "lab_tests"), {
        clinicId,
        visitId:   visit.visitId,
        patientId: visit.patientId,
        testName:  newTestName.trim(),
        status:    "pending",
        results:   "",
        createdAt: serverTimestamp(),
      });
      setNewTestName("");
    } catch {
      alert("Failed to add test.");
    }
    setAddingTest(false);
  };

  const handleSaveResult = async (test) => {
    if (!resultText.trim()) return;
    setSaving(true);
    try {
      await updateDoc(doc(db, "lab_tests", test.labTestId), {
        results:     resultText.trim(),
        status:      "completed",
        completedAt: serverTimestamp(),
      });
      setEditingId(null);
      setResultText("");
    } catch {
      alert("Failed to save result.");
    }
    setSaving(false);
  };

  const allDone   = tests.length > 0 && tests.every(t => t.status === "completed");
  const isEmerg   = visit.visitType === "Emergency";
  const doneCount = tests.filter(t => t.status === "completed").length;

  return (
    <div className="space-y-4" style={{ background: "#F7F9FC", minHeight: "100vh", padding: "1rem" }}>
      <button
        onClick={onBack}
        className="flex items-center gap-2 text-xs font-semibold text-[#0D2C6E] hover:opacity-70 transition-opacity"
      >
        ← Back to queue
      </button>

      {/* Patient card */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 text-white text-lg font-bold"
               style={{ background: isEmerg ? "#DC2626" : "linear-gradient(135deg, #5B21B6 0%, #7C3AED 100%)" }}>
            {patient?.firstName?.[0]}{patient?.lastName?.[0]}
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-bold text-[#0D2C6E]">
              {patient?.firstName} {patient?.lastName}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {patient?.gender} · {patient?.phone || "No phone on record"}
            </p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${
                isEmerg ? "bg-red-100 text-red-700" : "bg-violet-50 text-violet-700"
              }`}>
                {isEmerg ? "⚡ Emergency" : visit.visitType}
              </span>
              <span className="text-[11px] text-slate-400">
                {visit.createdAt?.toDate ? format(visit.createdAt.toDate(), "dd MMM yyyy · HH:mm") : ""}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tests panel */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <SectionLabel>Lab Tests ({tests.length})</SectionLabel>
          {tests.length > 0 && (
            <span className="text-xs font-semibold text-slate-500">
              {doneCount}/{tests.length} complete
            </span>
          )}
        </div>

        {/* Progress bar */}
        {tests.length > 0 && (
          <div className="mb-4">
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.round((doneCount / tests.length) * 100)}%`,
                  background: "linear-gradient(90deg, #0D2C6E, #00A9E0)",
                }}
              />
            </div>
          </div>
        )}

        {tests.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-4">No tests requested yet</p>
        ) : (
          <div className="space-y-3 mb-4">
            {tests.map((test) => {
              const isEditing = editingId === test.labTestId;
              const isDone    = test.status === "completed";
              return (
                <div
                  key={test.labTestId}
                  className={`rounded-xl border-2 p-4 transition-all ${
                    isDone ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3 mb-1">
                    <p className="font-semibold text-slate-900 text-sm">{test.testName}</p>
                    {!isDone && !isEditing && (
                      <button
                        onClick={() => { setEditingId(test.labTestId); setResultText(""); }}
                        className="text-xs font-semibold text-white px-3 py-1.5 rounded-lg transition-all active:scale-95"
                        style={{ background: "linear-gradient(135deg, #5B21B6 0%, #7C3AED 100%)" }}
                      >
                        Enter Results
                      </button>
                    )}
                    {isDone && (
                      <span className="text-[10px] font-bold bg-emerald-200 text-emerald-800 px-2.5 py-1 rounded-full uppercase tracking-wide">
                        ✓ Complete
                      </span>
                    )}
                  </div>

                  {isDone && test.results && (
                    <p className="text-sm text-slate-700 mt-1 leading-relaxed">{test.results}</p>
                  )}

                  {isEditing && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={resultText}
                        onChange={(e) => setResultText(e.target.value)}
                        rows={3}
                        className="w-full border border-slate-200 rounded-lg px-4 py-3 text-sm bg-white focus:border-[#00A9E0] focus:ring-1 focus:ring-[#00A9E0] focus:outline-none resize-none"
                        placeholder="Enter lab results here…"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditingId(null); setResultText(""); }}
                          className="flex-1 py-2.5 border border-slate-200 rounded-lg text-sm text-slate-600 font-medium hover:bg-slate-50 transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleSaveResult(test)}
                          disabled={saving || !resultText.trim()}
                          className="flex-1 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 active:scale-95 transition-all"
                        >
                          {saving ? "Saving…" : "✓ Save Result"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Add test */}
        <div className="flex gap-2 pt-3 border-t border-slate-100">
          <input
            type="text"
            value={newTestName}
            onChange={(e) => setNewTestName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTest()}
            className="flex-1 border border-slate-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:border-[#00A9E0] focus:ring-1 focus:ring-[#00A9E0] focus:outline-none"
            placeholder="Add test (e.g. Full Blood Count)…"
          />
          <button
            onClick={handleAddTest}
            disabled={addingTest || !newTestName.trim()}
            className="px-4 py-2.5 text-sm font-semibold text-white rounded-lg disabled:opacity-50 active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #5B21B6 0%, #7C3AED 100%)" }}
          >
            + Add
          </button>
        </div>

        {allDone && (
          <div className="mt-4 bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
            <p className="text-sm text-emerald-700 font-semibold">
              ✓ All tests complete — ready to route patient
            </p>
          </div>
        )}
      </div>

      {/* Route patient */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
        <SectionLabel>Route Patient</SectionLabel>
        <SendToMenu visit={visit} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function LabPage({ clinicId, userProfile }) {
  const [visits, setVisits]               = useState([]);
  const [patients, setPatients]           = useState({});
  const [selectedVisit, setSelectedVisit] = useState(null);

  useEffect(() => {
    if (!clinicId) return;
    const q = query(
      collection(db, "visits"),
      where("clinicId", "==", clinicId),
      where("currentDepartment", "==", "lab"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, async (snap) => {
      const data = snap.docs.map(d => ({ visitId: d.id, ...d.data() }));
      setVisits(data);
      const updated = { ...patients };
      for (const v of data) {
        if (!updated[v.patientId]) {
          try {
            const pSnap = await getDoc(doc(db, "patients", v.patientId));
            if (pSnap.exists()) updated[v.patientId] = { patientId: v.patientId, ...pSnap.data() };
          } catch {}
        }
      }
      setPatients(updated);
    });
  }, [clinicId]);

  useEffect(() => {
    if (!selectedVisit) return;
    const updated = visits.find(v => v.visitId === selectedVisit.visit.visitId);
    if (!updated) setSelectedVisit(null);
  }, [visits]);

  const handleSelectVisit = async (visit) => {
    let patient = patients[visit.patientId];
    if (!patient) {
      const snap = await getDoc(doc(db, "patients", visit.patientId));
      if (snap.exists()) patient = { patientId: visit.patientId, ...snap.data() };
    }
    setSelectedVisit({ visit, patient });
  };

  if (selectedVisit) {
    return (
      <LabVisitDetail
        visit={selectedVisit.visit}
        patient={selectedVisit.patient}
        clinicId={clinicId}
        onBack={() => setSelectedVisit(null)}
      />
    );
  }

  const sorted = [
    ...visits.filter(v => v.visitType === "Emergency"),
    ...visits.filter(v => v.visitType !== "Emergency"),
  ];

  return (
    <div className="space-y-5" style={{ background: "#F7F9FC", minHeight: "100vh", padding: "1rem" }}>
      <PageHeader
        title="Laboratory"
        sub={`${visits.length} patient${visits.length !== 1 ? "s" : ""} in lab queue`}
      />

      {sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center shadow-sm">
          <p className="text-4xl mb-3">🔬</p>
          <p className="font-semibold text-slate-700 mb-1">Lab queue is clear</p>
          <p className="text-sm text-slate-400">
            Patients routed here from Reception or Doctor will appear in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((visit) => {
            const patient  = patients[visit.patientId];
            const isEmerg  = visit.visitType === "Emergency";
            const time     = visit.createdAt?.toDate ? format(visit.createdAt.toDate(), "HH:mm") : "--:--";

            return (
              <button
                key={visit.visitId}
                onClick={() => handleSelectVisit(visit)}
                className={`w-full bg-white rounded-xl border-2 p-5 text-left transition-all hover:shadow-md ${
                  isEmerg ? "border-red-400" : "border-slate-200 hover:border-violet-300"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm text-white flex-shrink-0 ${
                      isEmerg ? "bg-red-500" : ""
                    }`} style={!isEmerg ? { background: "linear-gradient(135deg, #5B21B6 0%, #7C3AED 100%)" } : {}}>
                      {patient?.firstName?.[0]}{patient?.lastName?.[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900 text-sm">
                        {patient ? `${patient.firstName} ${patient.lastName}` : "Loading…"}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {isEmerg && "⚡ "}{visit.visitType} · {time}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide ${
                      isEmerg ? "bg-red-100 text-red-700" : "bg-violet-50 text-violet-700"
                    }`}>
                      {isEmerg ? "Emergency" : "In Lab"}
                    </span>
                    <span className="text-slate-300">›</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
