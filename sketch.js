// Echoes in Transit — GeoJSON + Firebase + Sounds

const GEOJSON_URL = 'sydney_train_routes_named.json';
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBva3BFLhJhytiHAcIjgIYF6aSepG-a6v8",
  authDomain: "echoes-in-transit-v2.firebaseapp.com",
  projectId: "echoes-in-transit-v2",
  storageBucket: "echoes-in-transit-v2.firebasestorage.app",
  messagingSenderId: "252548572349",
  appId: "1:252548572349:web:2f172fbd17a3b6931c43d4"
};

let map, geoData, firestore, osc;
let routes = [];
let lineSelect, startSelect, endSelect, nameInput, msgInput;

function setup() {
  // Leaflet Map
  map = L.map('map').setView([-33.8688, 151.2093], 11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO & OpenStreetMap'
  }).addTo(map);

  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.position(0, 0);
  cnv.style('z-index', '2000');
  canvas.style('pointer-events', 'none');

  osc = new p5.Oscillator('square');
  osc.amp(0.05);
  osc.freq(600);

  // Firebase init
  firebase.initializeApp(FIREBASE_CONFIG);
  firestore = firebase.firestore();
  firestore.collection("messages").orderBy("timestamp").onSnapshot(snapshot => {
    routes = [];
    snapshot.forEach(doc => routes.push(doc.data()));
  });

  setupUI();

  // Load GeoJSON
  fetch(GEOJSON_URL)
    .then(r => r.json())
    .then(j => { geoData = j; populateLineSelect(); })
    .catch(e => console.error("GeoJSON load failed:", e));
}

function setupUI() {
  lineSelect = select('#lineSelect');
  startSelect = select('#startSelect');
  endSelect = select('#endSelect');
  nameInput = select('#nameInput');
  msgInput = select('#msgInput');

  select('#sendBtn').mousePressed(sendMessage);
  select('#clearBtn').mousePressed(() => routes = []);
}

function populateLineSelect() {
  lineSelect.elt.innerHTML = '';
  geoData.features.forEach((f, i) => {
    const lineName = f.properties.route_long_name || f.properties.route_short_name || `Line ${i + 1}`;
    lineSelect.elt.add(new Option(lineName, i));
  });
  lineSelect.changed(updateStations);
  updateStations();
}

function updateStations() {
  startSelect.elt.innerHTML = '';
  endSelect.elt.innerHTML = '';
  const f = geoData.features[int(lineSelect.value())];
  if (!f) return;

  const coords = flattenCoords(f.geometry);
  const samples = samplePoints(coords, Math.min(15, coords.length));

  samples.forEach((pt, i) => {
    const station = f.properties.stop_names?.[i] || `Station ${i + 1}`;
    const val = `${pt[0]},${pt[1]}`;
    startSelect.elt.add(new Option(station, val));
    endSelect.elt.add(new Option(station, val));
  });
}

function flattenCoords(g) {
  if (g.type === 'LineString') return g.coordinates;
  if (g.type === 'MultiLineString') return g.coordinates.flat();
  return [];
}

function samplePoints(coords, n) {
  if (coords.length <= n) return coords.slice();
  const out = [];
  for (let i = 0; i < n; i++) {
    let idx = floor(map(i, 0, n - 1, 0, coords.length - 1));
    out.push(coords[idx]);
  }
  return out;
}

function sendMessage() {
  const start = startSelect.value().split(',').map(Number);
  const end = endSelect.value().split(',').map(Number);
  const name = nameInput.value() || 'Anonymous';
  const msg = msgInput.value();
  if (!geoData || !msg) return;

  const lineIdx = int(lineSelect.value());
  const f = geoData.features[lineIdx];
  const coords = flattenCoords(f.geometry);
  const sIdx = nearestIndex(coords, start);
  const eIdx = nearestIndex(coords, end);
  if (sIdx >= eIdx) return;

  const path = coords.slice(sIdx, eIdx + 1);
  firestore.collection("messages").add({
    sender: name,
    msg: msg,
    coords: path,
    timestamp: Date.now()
  });

  osc.start();
  setTimeout(() => osc.stop(), 100);
  msgInput.value('');
}

function nearestIndex(coords, t) {
  let best = 0, bestD = 1e9;
  coords.forEach((c, i) => {
    const d = (c[0] - t[0]) ** 2 + (c[1] - t[1]) ** 2;
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}

function draw() {
  clear();
  routes.forEach(r => {
    if (!r.coords) return;
    for (let i = 0; i < r.coords.length - 1; i++) {
      let p1 = map.latLngToContainerPoint(L.latLng(r.coords[i][1], r.coords[i][0]));
      let p2 = map.latLngToContainerPoint(L.latLng(r.coords[i + 1][1], r.coords[i + 1][0]));
      stroke('#f8a5c2');
      strokeWeight(2);
      line(p1.x, p1.y, p2.x, p2.y);
    }
  });
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
