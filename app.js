// app.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc,
  collection, query, where, getDocs,
  addDoc, serverTimestamp,
  orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/** ====== CONFIG: paste your Firebase config here ====== */
const firebaseConfig = {
  apiKey: "AIzaSyCZxIgiXvpVIA10mbAfXdelZ2GAA8Zc5jQ",
  authDomain: "peer-feedback-4de63.firebaseapp.com",
  projectId: "peer-feedback-4de63",
  storageBucket: "peer-feedback-4de63.firebasestorage.app",
  messagingSenderId: "977480782634",
  appId: "1:977480782634:web:2bf3b786ca8ab3d8e4c453"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

/** ====== Helpers ====== */
export function $(id) { return document.getElementById(id); }

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}

export function normEmail(email) {
  return String(email || "").trim().toLowerCase();
}

export function safeNumber(n) {
  const x = parseInt(String(n), 10);
  return Number.isFinite(x) ? x : null;
}

/** ====== Session ====== */
const KEY_EMAIL = "pf_email";
const KEY_IS_ADMIN = "pf_is_admin";

export function setSessionEmail(email) { localStorage.setItem(KEY_EMAIL, email); }
export function getSessionEmail() { return localStorage.getItem(KEY_EMAIL); }
export function clearSessionEmail() { localStorage.removeItem(KEY_EMAIL); }

export function setAdminMode(on) {
  if (on) localStorage.setItem(KEY_IS_ADMIN, "true");
  else localStorage.removeItem(KEY_IS_ADMIN);
}
export function isAdminMode() { return localStorage.getItem(KEY_IS_ADMIN) === "true"; }

/** ====== Auth-less PIN checks ====== */
export async function checkUserPin(email, pin) {
  const ref = doc(db, "pins", email);
  const snap = await getDoc(ref);
  if (!snap.exists()) return { ok: false, error: "No PIN set for this email." };

  const data = snap.data();
  if (!data.active) return { ok: false, error: "Account is disabled." };

  if (String(data.pin || "") !== String(pin || "")) {
    return { ok: false, error: "Invalid PIN." };
  }
  return { ok: true };
}

export async function checkAdminPin(pin) {
  const snap = await getDoc(doc(db, "config", "admin"));
  if (!snap.exists()) return { ok: false, error: "Missing config/admin doc." };

  const adminPin = String(snap.data().adminPin || "");
  if (String(pin || "") !== adminPin) return { ok: false, error: "Wrong admin PIN." };
  return { ok: true };
}

/** ====== Peer mapping + one-time logic ====== */
export async function getAlreadyRatedSet(raterEmail) {
  const qy = query(collection(db, "feedback_private"), where("raterEmail", "==", raterEmail));
  const snap = await getDocs(qy);
  const set = new Set();
  snap.forEach(d => {
    const rec = normEmail(d.data().recipientEmail);
    if (rec) set.add(rec);
  });
  return set;
}

export async function getPeersForRater(raterEmail) {
  const qy = query(collection(db, "peerMap"), where("raterEmail", "==", raterEmail));
  const snap = await getDocs(qy);
  return snap.docs.map(d => normEmail(d.data().peerEmail)).filter(Boolean);
}

/** ====== Survey schema ====== */
export const SURVEY = {
  communication: [
    { id: "comm_clear", label: "Does this person communicate their ideas and expectations clearly?" },
    { id: "comm_listen", label: "Do they actively listen to others without interrupting?" },
    { id: "comm_updates", label: "Are they effective at keeping the team updated on their progress and potential blockers?" },
    { id: "comm_feedback", label: "Do they provide constructive and respectful feedback?" },
  ],
  collaboration: [
    { id: "collab_help", label: "Is this person approachable and willing to help other team members?" },
    { id: "collab_discuss", label: "Do they contribute positively to team discussions and brainstorming sessions?" },
    { id: "collab_conflict", label: "How well do they handle disagreements or conflicts within the team?" },
    { id: "collab_teamgoals", label: "Do they prioritize team goals over personal accolades?" },
  ],
  reliability: [
    { id: "rely_onTime", label: "Can you rely on this person to deliver high-quality work on time?" },
    { id: "rely_ownership", label: "Do they take ownership of their mistakes rather than shifting blame?" },
    { id: "rely_follow", label: "Do they follow through on commitments made during meetings?" },
  ],
  problemSolving: [
    { id: "ps_quality", label: "Does this person provide thorough and high-quality outputs?" },
    { id: "ps_solution", label: "Do they approach problems with a solution-oriented mindset?" },
    { id: "ps_pressure", label: "Are they able to make sound decisions even when under pressure?" },
  ],
  professionalism: [
    { id: "prof_respect", label: "Does this person treat everyone with equal respect, regardless of their seniority, background, or role?" },
    { id: "prof_tact", label: "When they disagree, do they do so with tact and sensitivity?" },
    { id: "prof_gossip", label: "Does this person avoid office gossip, negativity, or back-channeling (undermining others behind their back)?" },
    { id: "prof_control", label: "Do they maintain a professional demeanor and emotional control during high-pressure situations?" },
    { id: "prof_culture", label: "Is this person mindful of the diverse cultural backgrounds within the team in their communication style?" },
  ],
  strategic: [
    { id: "strat_objectives", label: "Does this person understand how their specific tasks contribute to the wider team and company objectives?" },
    { id: "strat_anticipate", label: "Do they anticipate future risks and opportunities, rather than just reacting to immediate problems?" },
    { id: "strat_roi", label: "Do they consider the cost, ROI, or resource implications of their decisions?" },
    { id: "strat_urgent", label: "Are they able to distinguish between what is urgent and what is important for the long-term success of the project?" },
    { id: "strat_trends", label: "Do they suggest improvements or new ideas that align with market trends or the company's strategic direction?" },
  ],
  qualitative: [
    { id: "q_stop", label: "Stop: What is one thing this person does that hinders the team's progress or morale?" },
    { id: "q_start", label: "Start: What is one thing this person should start doing to be more effective?" },
    { id: "q_continue", label: "Continue: What is this person’s superpower or greatest strength that they should keep utilizing?" },
  ]
};

export const SCALE = [
  { v: 1, label: "1 — Needs Significant Improvement" },
  { v: 2, label: "2 — Competent" },
  { v: 3, label: "3 — Role Model" },
];

export function computeAverages(scores) {
  // scores: { sectionKey: { questionKey: number } }
  const sectionAverages = {};
  const all = [];

  for (const [section, obj] of Object.entries(scores || {})) {
    const vals = Object.values(obj || {}).filter(v => Number.isFinite(v));
    const avg = vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : null;
    sectionAverages[section] = avg;
    all.push(...vals);
  }

  const overall = all.length ? all.reduce((a,b)=>a+b,0)/all.length : null;
  return { sectionAverages, overall };
}

/** ====== Feedback submit/load ====== */
export async function submitSurvey({ raterEmail, recipientEmail, scores, qualitative }) {
  // Mapping check
  const mapId = `${raterEmail}__${recipientEmail}`;
  const mapSnap = await getDoc(doc(db, "peerMap", mapId));
  if (!mapSnap.exists()) throw new Error("Not allowed to rate this peer (mapping missing).");

  // One-time check
  const ratedSet = await getAlreadyRatedSet(raterEmail);
  if (ratedSet.has(recipientEmail)) throw new Error("You already submitted feedback for this person.");

  // Validate scores (1..3)
  const all = [];
  for (const sec of Object.values(scores || {})) {
    for (const v of Object.values(sec || {})) all.push(v);
  }
  if (all.length === 0 || all.some(v => !Number.isFinite(v) || v < 1 || v > 3)) {
    throw new Error("Please answer all rating questions (1–3).");
  }

  const payloadPublic = {
    recipientEmail,
    scores,
    qualitative: qualitative || {},
    createdAt: serverTimestamp()
  };

  const payloadPrivate = {
    raterEmail,
    recipientEmail,
    scores,
    qualitative: qualitative || {},
    createdAt: serverTimestamp()
  };

  await addDoc(collection(db, "feedback_public"), payloadPublic);
  await addDoc(collection(db, "feedback_private"), payloadPrivate);
}

export async function loadMyFeedback(recipientEmail) {
  // recipientEmail + createdAt ordering may require composite index
  const qy = query(
    collection(db, "feedback_public"),
    where("recipientEmail", "==", recipientEmail),
    orderBy("createdAt", "desc"),
    limit(80)
  );
  const snap = await getDocs(qy);
  return snap.docs.map(d => d.data());
}

export async function loadAllPrivate() {
  const qy = query(collection(db, "feedback_private"), orderBy("createdAt", "desc"), limit(400));
  const snap = await getDocs(qy);
  return snap.docs.map(d => d.data());
}


export async function generateAISummary(myEmail, feedbackRows) {
  const payload = {
    input_type: "chat",
    output_type: "chat",
    input_value: JSON.stringify({
      recipientEmail: myEmail,
      scale: "1-5",
      feedback_rows: feedbackRows
    }),
    session_id: crypto.randomUUID()
  };

  const res = await fetch(
    "https://aws-us-east-2.langflow.datastax.com/lf/ddf03f01-5f13-440c-9f76-97f8c9ffe801/api/v1/run/9abec979-6c41-45e0-b98e-4d11b8ecccc4",
    {
      method: "POST",
      headers: {
        "X-DataStax-Current-Org": "983070ce-6805-4c6e-bcbb-62dd08e1fd12",
        "Authorization": "Bearer YOUR_APPLICATION_TOKEN",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }
  );

if (!res.ok) {
  const txt = await res.text().catch(() => "");
  throw new Error(`AI request failed (${res.status}): ${txt.slice(0, 400)}`);
}

  const data = await res.json();

  const text =
    data?.outputs?.[0]?.outputs?.[0]?.results?.message?.text;

  if (!text) throw new Error("No AI output");

  return JSON.parse(text);
}


/** ====== Admin actions ====== */
export async function adminSavePeerMap(raterEmail, peerEmail) {
  const id = `${raterEmail}__${peerEmail}`;
  await setDoc(doc(db, "peerMap", id), { raterEmail, peerEmail });
  return id;
}

export async function adminSaveUserPin(email, pin, active) {
  await setDoc(doc(db, "pins", email), { pin: String(pin), active: !!active });
}


