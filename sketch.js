// Echoes in Transit (Simplified, Stable Map + Firebase)
let map, geoData;
let routes = [];
let blip, ding;

const GEOJSON_URL = "sydney_train_routes_named.json";

// ---- Firebase (replace with your credentials) ----
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ---- Sound ----
function preload() {
  blip = new p5.Oscillator('square');
  blip.amp(0.05);
  blip.freq(400);
  ding = new p5.Oscillator('triangle');
  ding.amp(0.05);
  ding.freq(700);
}

// ---- Setup ----
function setup() {
  // Create Leaflet map
  map = L.map('map').setView([-33.87, 151.21], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  // Transparent overlay
  const cnv = createCanvas(windowWidth, windowHeight);
  cnv.position(0, 0);
  cnv.style('pointer-events', 'none'); // ensure clicks go through
  noStroke();
  clear();

  // Load routes
  loadJSON(GEOJSON_URL, data => {
    geoData = data;
    setupUI();
    listenForRoutes();
  });
}

// ---- Setup UI ----
function setupUI() {
  const lineSel = select("#lineSelect");
  const startSel = select("#startSelect");
  const endSel = select("#endSelect");

  geoData.features.forEach(f => {
    const id = f.properties.route_id || f.properties.route_short_name;
    const name = f.properties.route_long_name || id;
    lineSel.elt.add(new Option(`${id} — ${name}`, id));
  });

  lineSel.changed(() => updateStations());
  select("#sendBtn").mousePressed(() => sendMessage());
}

// ---- Station Dropdowns ----
function updateStations() {
  const lineSel = select("#lineSelect").value();
  const startSel = select("#startSelect");
  const endSel = select("#endSelect");
  startSel.elt.innerHTML = '';
  endSel.elt.innerHTML = '';

  const feature = geoData.features.find(f =>
    (f.properties.route_id || f.properties.route_short_name) === lineSel
  );
  if (!feature || !feature.properties.stop_names) return;

  feature.properties.stop_names.forEach((s, i) => {
    startSel.elt.add(new Option(s, i));
    endSel.elt.add(new Option(s, i));
  });
}

// ---- Send Message ----
function sendMessage() {
  const name = select("#nameInput").value();
  const msg = select("#msgInput").value();
  const line = select("#lineSelect").value();
  const s = int(select("#startSelect").value());
  const e = int(select("#endSelect").value());
  if (!msg || e <= s) return;

  const feature = geoData.features.find(f =>
    (f.properties.route_id || f.properties.route_short_name) === line
  );
  if (!feature) return;

  const path = feature.geometry.coordinates.slice(s, e + 1);
  const route = { path, name, msg, line, t: 0, time: Date.now() };

  db.collection("routes").add(route);
  ding.start(); ding.stop(0.15);
}

// ---- Firestore Listener ----
function listenForRoutes() {
  db.collection("routes").orderBy("time", "asc").onSnapshot(snap => {
    routes = snap.docs.map(d => d.data());
  });
}

// ---- Draw Overlay ----
function draw() {
  clear();
  for (const r of routes) {
    drawRoute(r);
    r.t = (r.t + 0.002) % 1;
  }
}

// ---- Draw Route ----
function drawRoute(r) {
  push();
  fill('#f8a5c2');
  for (let i = 0; i < r.path.length - 1; i++) {
    const p1 = map.latLngToContainerPoint([r.path[i][1], r.path[i][0]]);
    const p2 = map.latLngToContainerPoint([r.path[i + 1][1], r.path[i + 1][0]]);
    const steps = int(dist(p1.x, p1.y, p2.x, p2.y) / 8);
    for (let j = 0; j < steps; j++) {
      rect(lerp(p1.x, p2.x, j / steps), lerp(p1.y, p2.y, j / steps), 2, 2);
    }
  }
  pop();

  const tpos = pointOnRoute(r.path, r.t);
  if (tpos) {
    fill('#a0f0f0');
    rect(tpos.x, tpos.y, 4, 4);
    textSize(10);
    textAlign(CENTER);
    fill('#fff');
    text(`${r.name}: ${r.msg}`, tpos.x, tpos.y - 10);
  }
}

function pointOnRoute(path, t) {
  if (path.length < 2) return null;
  const seg = (path.length - 1) * t;
  let i = floor(seg);
  const local = seg - i;
  if (i >= path.length - 1) i = path.length - 2;
  const p1 = map.latLngToContainerPoint([path[i][1], path[i][0]]);
  const p2 = map.latLngToContainerPoint([path[i + 1][1], path[i + 1][0]]);
  return { x: lerp(p1.x, p2.x, local), y: lerp(p1.y, p2.y, local) };
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
