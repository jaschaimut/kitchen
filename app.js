/* ================= KONFIGURASI FIREBASE (sama dengan kode ESP32) ================= */
const firebaseConfig = {
  apiKey: "AIzaSyCghObg_mjMz15ShAjKa5fRNgu1EVi_GUQ",
  authDomain: "kitchen-3172e.firebaseapp.com",
  databaseURL: "https://kitchen-3172e-default-rtdb.firebaseio.com",
  projectId: "kitchen-3172e"
};

const STATES = ["aman", "waspada", "kebakaran"];
const COPY = {
  wait: ["Menunggu data dari perangkat", "Belum ada data masuk. Pastikan ESP32 menyala dan terhubung ke WiFi.", "var(--mut)"],
  aman: ["Kondisi aman", "Semua sensor normal. Sistem terus memantau setiap 2 detik.", "var(--ok)"],
  waspada: ["Waspada: ada tanda tidak normal", "Periksa kompor, area masak, dan ventilasi. Pastikan tidak ada gas bocor.", "var(--wa)"],
  kebakaran: ["Bahaya: terdeteksi kebakaran", "Matikan kompor dan sumber api, jauhkan bahan mudah terbakar, lalu evakuasi jika perlu.", "var(--fi)"]
};
const $ = (s, r = document) => r.querySelector(s);
const arc = $("#arc"), CIRC = 628;
const hist = { t: [], m: [], f: [], s: [] };
let lastState = null, lastAt = 0, sound = false, ac = null, beepTimer = null;

/* ---------- jam ---------- */
setInterval(() => $("#clock").textContent = new Date().toLocaleTimeString("id-ID"), 1000);

/* ---------- animasi angka ---------- */
function tween(el, to, dec = 0, suffix = "") {
  const from = parseFloat(el.dataset.n || 0), t0 = performance.now();
  (function step(t) {
    const p = Math.min((t - t0) / 700, 1), e = 1 - Math.pow(1 - p, 3);
    const v = from + (to - from) * e;
    el.firstChild.nodeValue = v.toFixed(dec) + suffix;
    if (p < 1) requestAnimationFrame(step); else el.dataset.n = to;
  })(t0);
}
document.querySelectorAll("[data-v]").forEach(e => e.textContent = "0");

/* ---------- inti: terima data ---------- */
function softmax(z) {
  const m = Math.max(...z), ex = z.map(v => Math.exp((v - m) / 4)), s = ex.reduce((a, b) => a + b, 0);
  return ex.map(v => v / s);
}
function handle(d) {
  if (!d || d.mq2 === undefined) return;
  const mq2 = +d.mq2, flameRaw = +d.flame, suhu = +d.suhu;
  const flame = 4095 - flameRaw; // sensor api aktif-LOW: ADC tinggi = tidak ada api, jadi dibalik
  const flamePct = flame / 4095 * 100;
  const z = [+d.z0, +d.z1, +d.z2];
  const st = String(d.status || "AMAN").toLowerCase();
  const state = STATES.includes(st) ? st : "aman";
  const p = softmax(z);
  const risk = Math.round((p[1] * 0.5 + p[2]) * 100);
  lastAt = Date.now();

  const wasWait = document.body.dataset.state === "wait";
  document.body.dataset.state = state;
  $("#statusTxt").textContent = state.toUpperCase();
  $("#headline").textContent = COPY[state][0];
  $("#sub").textContent = COPY[state][1];
  $("#last").textContent = new Date().toLocaleTimeString("id-ID");
  arc.style.strokeDashoffset = CIRC * (1 - risk / 100);
  tween($("#risk"), risk, 0, "");

  p.forEach((v, i) => {
    const row = $(`.pr[data-k="${i}"]`);
    $("i", row).style.width = (v * 100).toFixed(0) + "%";
    $("b", row).textContent = (v * 100).toFixed(0) + "%";
    const zb = $("#z" + i);
    $("b", zb).textContent = z[i].toFixed(2);
    zb.classList.toggle("win", STATES[i] === state);
  });

  setSensor("#cMq2", mq2, 4095, 0, "", mq2 > 3000);
  setSensor("#cFlame", flamePct, 100, 0, "%", flame > 3500);
  setSensor("#cTemp", suhu, 100, 1, " °C", suhu > 50);

  hist.t.push(Date.now()); hist.m.push(mq2 / 4095); hist.f.push(flame / 4095); hist.s.push(Math.min(suhu / 100, 1));
  if (hist.t.length > 60) for (const k in hist) hist[k].shift();
  draw();

  if (state !== lastState) { if (lastState) addLog(state, risk); lastState = state; syncAlarm(); } else if (wasWait) syncAlarm();
}
function setSensor(id, v, max, dec, suf, hot) {
  const c = $(id), pct = Math.max(2, Math.min(v / max, 1) * 100);
  tween($("[data-v]", c), v, dec, suf);
  const bar = $(".bar i", c);
  bar.style.width = pct + "%"; bar.style.backgroundSize = (10000 / pct) + "% 100%";
  c.classList.toggle("hot", hot);
}

/* ---------- log ---------- */
function addLog(state, risk) {
  const ul = $("#log"); $(".empty", ul)?.remove();
  const li = document.createElement("li");
  li.innerHTML = `<i style="background:${COPY[state][2]}"></i><span>Status berubah menjadi <b>${state.toUpperCase()}</b> (risiko ${risk}%)</span><time>${new Date().toLocaleTimeString("id-ID")}</time>`;
  ul.prepend(li); while (ul.children.length > 30) ul.lastChild.remove();
}

/* ---------- grafik canvas ---------- */
const cv = $("#chart"), cx = cv.getContext("2d");
function draw() {
  const dpr = devicePixelRatio || 1, w = cv.clientWidth, h = 240;
  cv.width = w * dpr; cv.height = h * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx.clearRect(0, 0, w, h);
  cx.strokeStyle = "#262d33"; cx.fillStyle = "#8a969d"; cx.font = "11px JetBrains Mono"; cx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = 10 + (h - 30) * i / 4; cx.beginPath(); cx.moveTo(34, y); cx.lineTo(w, y); cx.stroke();
    cx.fillText((100 - i * 25) + "%", 0, y + 4);
  }
  const n = hist.t.length; if (n < 2) { cx.fillText("Menunggu data…", w / 2 - 50, h / 2); return; }
  [[hist.s, "#ff8a5c"], [hist.m, "#5cc8ff"], [hist.f, "#c68cff"]].forEach(([a, col]) => {
    const pts = a.map((v, i) => [34 + (w - 40) * i / 59 + (w - 40) * (60 - n) / 59 * 0 + (w - 40) * (59 - (n - 1)) / 59 * 0, 10 + (h - 30) * (1 - v)]);
    const off = (w - 40) * (60 - n) / 59; pts.forEach(p => p[0] += off);
    const g = cx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, col + "33"); g.addColorStop(1, col + "00");
    cx.beginPath(); pts.forEach((p, i) => i ? cx.lineTo(...p) : cx.moveTo(...p));
    cx.strokeStyle = col; cx.lineWidth = 2.2; cx.lineJoin = "round"; cx.stroke();
    cx.lineTo(pts[n - 1][0], h - 20); cx.lineTo(pts[0][0], h - 20); cx.fillStyle = g; cx.fill();
    cx.beginPath(); cx.arc(...pts[n - 1], 4, 0, 7); cx.fillStyle = col; cx.fill();
  });
}
addEventListener("resize", draw); draw();

/* ---------- suara alarm ---------- */
function syncAlarm(stop) {
  clearInterval(beepTimer);
  if (stop || !sound || !lastState || lastState === "aman" || document.body.dataset.state === "wait") return;
  const f = lastState === "kebakaran" ? 1500 : 800, gap = lastState === "kebakaran" ? 450 : 1200;
  beepTimer = setInterval(() => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = f; o.connect(g); g.connect(ac.destination);
    g.gain.setValueAtTime(.12, ac.currentTime); g.gain.exponentialRampToValueAtTime(.001, ac.currentTime + .25);
    o.start(); o.stop(ac.currentTime + .25);
  }, gap);
}
$("#soundBtn").onclick = e => {
  sound = !sound; ac = ac || new (window.AudioContext || window.webkitAudioContext)();
  e.target.textContent = "Suara: " + (sound ? "aktif" : "mati"); e.target.setAttribute("aria-pressed", sound); syncAlarm();
};

/* ---------- status koneksi ---------- */
function conn(cls, txt) { const c = $("#conn"); c.className = "pill " + cls; $("span", c).textContent = txt; }
function setWait(reason, pill) {
  document.body.dataset.state = "wait";
  $("#statusTxt").textContent = "OFFLINE";
  $("#headline").textContent = COPY.wait[0];
  $("#sub").textContent = reason;
  syncAlarm(true);
  conn("off", pill);
}
setWait(COPY.wait[1], "Menghubungkan…");
$("#conn").className = "pill";

/* data dianggap basi jika tidak ada pembaruan > 20 detik */
setInterval(() => {
  if (lastAt && Date.now() - lastAt > 20000 && document.body.dataset.state !== "wait")
    setWait("Tidak ada data baru lebih dari 20 detik. Periksa ESP32 dan koneksi WiFi-nya.", "Data tidak diperbarui");
}, 2000);

/* ---------- Firebase (satu listener di root: sensor + device selalu sinkron) ---------- */
let baseline = null, live = false;
function startFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
    firebase.auth().signInAnonymously().catch(() => {}).finally(() => {
      const db = firebase.database();
      db.ref("/").on("value", s => {
        const v = s.val() || {}, on = !!(v.device && v.device.online);
        if (!v.sensor) return setWait(COPY.wait[1], "Belum ada data");
        if (!on) return setWait("Perangkat melaporkan offline.", "Perangkat offline");
        /* Firebase menyimpan nilai terakhir: saat refresh, data lama langsung dikirim walau ESP32 mati.
           Data baru dianggap live hanya jika isinya berubah dari data awal yang tersimpan. */
        const snap = JSON.stringify(v.sensor);
        if (baseline === null) baseline = snap;
        if (!live && snap === baseline) return setWait("Menunggu data baru dari ESP32. Nilai yang tersimpan di database tidak ditampilkan sebagai realtime.", "Menunggu data baru");
        live = true;
        handle(v.sensor);
        conn("on", "Terhubung · realtime");
      }, () => setWait("Akses ke database ditolak. Periksa rules Firebase.", "Akses ditolak"));
      db.ref(".info/connected").on("value", s => {
        if (!s.val()) setWait("Browser terputus dari Firebase. Mencoba menyambung ulang…", "Terputus dari Firebase");
      });
    });
  } catch (e) { setWait("Library Firebase gagal dimuat. Periksa koneksi internet.", "Firebase gagal dimuat"); }
}
startFirebase();
