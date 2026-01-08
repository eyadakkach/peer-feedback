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
  const q = query(collection(db, "feedback_private"), where("raterEmail", "==", raterEmail));
  const snap = await getDocs(q);
  const set = new Set();
  snap.forEach(d => {
    const rec = normEmail(d.data().recipientEmail);
    if (rec) set.add(rec);
  });
  return set;
}

export async function getPeersForRater(raterEmail) {
  const q = query(collection(db, "peerMap"), where("raterEmail", "==", raterEmail));
  const snap = await getDocs(q);
  return snap.docs.map(d => normEmail(d.data().peerEmail)).filter(Boolean);
}

/** ====== Feedback submit/load ====== */
export async function submitFeedback({ raterEmail, recipientEmail, q1,q2,q3,q4,q5, comment }) {
  // minimal validation here (UI also validates)
  const allQs = [q1,q2,q3,q4,q5];
  if (allQs.some(v => !Number.isFinite(v) || v < 1 || v > 5)) throw new Error("Invalid score values.");

  // UX mapping check
  const mapId = `${raterEmail}__${recipientEmail}`;
  const mapSnap = await getDoc(doc(db, "peerMap", mapId));
  if (!mapSnap.exists()) throw new Error("Not allowed to rate this peer (mapping missing).");

  // one-time check (UX)
  const ratedSet = await getAlreadyRatedSet(raterEmail);
  if (ratedSet.has(recipientEmail)) throw new Error("You already submitted feedback for this person.");

  const payloadPublic = {
    recipientEmail,
    q1,q2,q3,q4,q5,
    comment: comment || "",
    createdAt: serverTimestamp()
  };

  const payloadPrivate = {
    raterEmail,
    recipientEmail,
    q1,q2,q3,q4,q5,
    comment: comment || "",
    createdAt: serverTimestamp()
  };

  await addDoc(collection(db, "feedback_public"), payloadPublic);
  await addDoc(collection(db, "feedback_private"), payloadPrivate);
}

export async function loadMyFeedback(recipientEmail) {
  // NOTE: this where + orderBy requires a composite index (Firebase will give you the link)
  const q = query(
    collection(db, "feedback_public"),
    where("recipientEmail", "==", recipientEmail),
    orderBy("createdAt", "desc"),
    limit(50)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
}

export async function loadAllPrivate() {
  const q = query(collection(db, "feedback_private"), orderBy("createdAt", "desc"), limit(300));
  const snap = await getDocs(q);
  return snap.docs.map(d => d.data());
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
