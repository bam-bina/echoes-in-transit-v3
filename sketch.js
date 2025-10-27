<!-- ===========================
 Echoes in Transit (Firebase + GeoJSON + p5.js + Leaflet)
=========================== -->
<!-- Firebase SDKs -->
<script src="https://www.gstatic.com/firebasejs/10.7.2/firebase-app.js"></script>
<script src="https://www.gstatic.com/firebasejs/10.7.2/firebase-firestore.js"></script>

<script>
let map, geoData;
let routes = [];
let currentRide = null;
let blip1, blip2, ding;
const GEOJSON_URL = "sydney_train_routes_named.json"; // your merged dataset

const firebaseConfig = {
  apiKey: "AIzaSyBva3BFLhJhytiHAcIjgIYF6aSepG-a6v8",
  authDomain: "echoes-in-transit-v2.firebaseapp.com",
  projectId: "echoes-in-transit-v2",
  storageBucket: "echoes-in-transit-v2.firebasestorage.app",
  messagingSenderId: "252548572349",
  appId: "1:252548572349:web:2f172fbd17a3b6931c43d4"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- Sound preload ---
function preload() {
  blip1 = new p5.Oscillator('square'); blip1.amp(0.05); blip1.freq(600);
  blip2 = new p5.Oscillator('triangle'); blip2.amp(0.05); blip2.freq(300);
  ding  = new p5.Oscillator('sine'); ding.amp(0.05); ding.freq(800);
}

// --- Setup map and UI ---
function setup() {
  const mymap = L.map('map').setView([-33.87, 151.21], 10);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mymap);
  map = mymap;

  const myCanvas = createCanvas(window.innerWidth, window.innerHeight);
  myCanvas.position(0, 0);
  myCanvas.style('z-index', '1');
  noStroke();

  loadJSON(GEOJSON_URL, data => {
    geoData = data;
    setupUI();
    listenForRoutes();
  });
}

// --- Setup dropdowns and buttons ---
function setupUI() {
  const lineSel = select("#lineSelect");
  const startSel = select("#startSelect");
  const endSel = select("#endSelect");
  const nameInput = select("#nameInput");
  const msgInput = select("#msgInput");

  geoData.features.forEach(f => {
    let id = f.properties.route_id || f.properties.route_short_name || "Unknown";
    let name = f.properties.route_long_name || id;
    lineSel.elt.add(new Option(`${id} — ${name}`, id));
  });

  lineSel.changed(() => { blip2.start(); blip2.stop(0.1); updateStations(); });
  select("#sendBtn").mousePressed(() => {
    ding.start(); ding.stop(0.2);
    saveRoute(nameInput.value(), msgInput.value());
  });
  select("#clearBtn").mousePressed(() => { routes = []; });
  select("#rideBtn").mousePressed(() => { if (routes.length > 0) currentRide = routes[0]; });
}

// --- Populate start/end station menus ---
function updateStations() {
  const lineSel = select("#lineSelect").value();
  const startSel = select("#startSelect");
  const endSel = select("#endSelect");
  startSel.elt.innerHTML = "";
  endSel.elt.innerHTML = "";

  const feature = geoData.features.find(f => {
    const id = f.properties.route_id || f.properties.route_short_name;
    return id === lineSel;
  });

  if (feature && feature.properties.stop_names) {
    feature.properties.stop_names.forEach((stop, i) => {
      startSel.elt.add(new Option(stop, i));
      endSel.elt.add(new Option(stop, i));
    });
  }
}

// --- Save to Firestore ---
function saveRoute(name, msg) {
  const lineSel = select("#lineSelect").value();
  const s = int(select("#startSelect").value());
  const e = int(select("#endSelect").value());
  if (e <= s) return;

  const feature = geoData.features.find(f => {
    const id = f.properties.route_id || f.properties.route_short_name;
    return id === lineSel;
  });
  if (!feature) return;

  const path = feature.geometry.type === "LineString"
    ? feature.geometry.coordinates.slice(s, e + 1)
    : feature.geometry.coordinates.flat().slice(s, e + 1);

  const routeObj = { path, msg, name, line: lineSel, t: 0, timestamp: Date.now() };

  db.collection("routes").add(routeObj)
    .then(() => console.log("✅ Saved route"))
    .catch(err => console.error("❌ Firestore Error:", err));
}

// --- Listen for new Firestore entries (real-time updates) ---
function listenForRoutes() {
  db.collection("routes").orderBy("timestamp").onSnapshot(snapshot => {
    routes = [];
    snapshot.forEach(doc => routes.push(doc.data()));
  });
}

// --- Animation loop ---
function draw() {
  clear();
  for (let r of routes) {
    drawPixelRoute(r);
    r.t += 0.005;
    if (r.t > 1) r.t = 0;
  }
  if (currentRide) rideRoute(currentRide);
}

// --- Draw glowing pixel path ---
function drawPixelRoute(r) {
  push();
  fill('#f8a5c2');
  for (let i = 0; i < r.path.length - 1; i++) {
    const p1 = map.latLngToContainerPoint(L.latLng(r.path[i][1], r.path[i][0]));
    const p2 = map.latLngToContainerPoint(L.latLng(r.path[i + 1][1], r.path[i + 1][0]));
    const steps = int(dist(p1.x, p1.y, p2.x, p2.y) / 8);
    for (let j = 0; j < steps; j++) {
      const x = lerp(p1.x, p2.x, j / steps);
      const y = lerp(p1.y, p2.y, j / steps);
      rect(x, y, 2, 2);
    }
  }
  const tpos = routePointAt(r.path, r.t);
  if (tpos) { fill('#a0f0f0'); rect(tpos.x, tpos.y, 4, 4); }
  pop();
}

function routePointAt(path, t) {
  if (path.length < 2) return null;
  const seg = (path.length - 1) * t;
  let i = floor(seg);
  const local = seg - i;
  if (i >= path.length - 1) i = path.length - 2;
  const p1 = map.latLngToContainerPoint(L.latLng(path[i][1], path[i][0]));
  const p2 = map.latLngToContainerPoint(L.latLng(path[i + 1][1], path[i + 1][0]));
  return { x: lerp(p1.x, p2.x, local), y: lerp(p1.y, p2.y, local) };
}

// --- Floating text animation ---
function rideRoute(r) {
  push();
  fill('#f8a5c2');
  textSize(10);
  textAlign(CENTER);
  const tpos = routePointAt(r.path, r.t);
  if (tpos) {
    const chars = int(frameCount / 5) % (r.msg.length + 1);
    text(`${r.name}: ${r.msg.substring(0, chars)}`, tpos.x, tpos.y - 10);
  }
  pop();
}

function windowResized() { resizeCanvas(window.innerWidth, window.innerHeight); }
</script>
