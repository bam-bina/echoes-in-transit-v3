// sketch.js
// Echoes in Transit — Leaflet + p5 overlay + GeoJSON + Firebase

// ---------- CONFIG ----------
const GEOJSON_URL = 'sydney_train_routes.json'; // rename .geojson -> .json if needed for GitHub Pages
const firebaseConfig = {
  apiKey: "AIzaSyBva3BFLhJhytiHAcIjgIYF6aSepG-a6v8",
  authDomain: "echoes-in-transit-v2.firebaseapp.com",
  projectId: "echoes-in-transit-v2",
  storageBucket: "echoes-in-transit-v2.firebasestorage.app",
  messagingSenderId: "252548572349",
  appId: "1:252548572349:web:2f172fbd17a3b6931c43d4"
};
// ----------------------------

let map;                     // Leaflet map
let geoData = null;          // loaded GeoJSON
let featureIndex = [];       // list of features (for UI)
let routes = [];             // messages currently displaying (mirrors firestore docs)
let currentRide = null;

let oscSend;                 // sound
let firestore;

// DOM
let lineSelect, startSelect, endSelect, nameInput, msgInput, sendBtn, rideBtn, clearBtn;

function preload(){
  // nothing for p5 preload; we'll fetch geojson in setup via fetch()
}

function setup(){
  // Leaflet map
  map = L.map('map', { preferCanvas: true }).setView([-33.8688,151.2093], 11);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; CARTO & OpenStreetMap'
  }).addTo(map);

  // p5 canvas overlay sized to window
  let cnv = createCanvas(windowWidth, windowHeight);
  cnv.position(0,0);
  cnv.style('z-index','2000');
  // pointer-events none so map stays interactive
  canvas.style('pointer-events','none');

  // sound (single simple blip on send)
  oscSend = new p5.Oscillator('sine');
  oscSend.amp(0.0);
  oscSend.freq(880);

  // init UI references
  lineSelect = select('#lineSelect');
  startSelect = select('#startSelect');
  endSelect = select('#endSelect');
  nameInput = select('#nameInput');
  msgInput = select('#msgInput');
  sendBtn = select('#sendBtn');
  rideBtn = select('#rideBtn');
  clearBtn = select('#clearBtn');

  sendBtn.mousePressed(onSendClicked);
  rideBtn.mousePressed(()=>{ if(routes.length>0) currentRide = routes[0]; });
  clearBtn.mousePressed(()=>{ routes = []; });

  // load GeoJSON (local file in repo)
  fetch(GEOJSON_URL).then(r=>{
    if(!r.ok) throw new Error('GeoJSON fetch failed: '+r.status);
    return r.json();
  }).then(j=>{
    geoData = j;
    onGeoLoaded();
  }).catch(err=>{
    console.error('Failed to load geojson:', err);
    // fallback: small embedded sample (keeps UX usable)
    geoData = sampleFallback();
    onGeoLoaded();
  });

  // initialize Firebase
  firebase.initializeApp(FIREBASE_CONFIG);
  firestore = firebase.firestore();

  // listen to messages collection
  firestore.collection('messages').orderBy('timestamp').onSnapshot(snapshot=>{
    routes = []; // clear and re-populate
    snapshot.forEach(doc => {
      let d = doc.data();
      // normalize coords: d.coords expected as array of [lon,lat] pairs
      routes.push({
        id: doc.id,
        coords: d.coords,
        msg: d.msg,
        sender: d.sender || 'Anonymous',
        t: d.t || 0
      });
    });
  });
}

// called when geoData loaded or fallback used
function onGeoLoaded(){
  // populate feature list and add Leaflet layer for visuals
  if(!geoData || !geoData.features) return;
  featureIndex = geoData.features.map((f,i)=>({
    index: i,
    name: (f.properties && (f.properties.name || f.properties.route_short_name || f.properties.route_long_name)) || `Line ${i}`
  }));

  // populate line select
  lineSelect.elt.innerHTML = '';
  featureIndex.forEach(fi => {
    lineSelect.elt.add(new Option(fi.name, fi.index));
  });

  // draw geojson on leaflet as a base layer (thin)
  L.geoJSON(geoData, {
    style: ()=>({ color:'#ff80a0', weight:2, opacity:0.8 })
  }).addTo(map);

  // wire change event to sample points
  lineSelect.changed(updateStationSamples);
  updateStationSamples();
  redraw();
}

function updateStationSamples(){
  startSelect.elt.innerHTML = '';
  endSelect.elt.innerHTML = '';
  let idx = int(lineSelect.value());
  let feature = geoData.features[idx];
  if(!feature) return;
  // extract a sampled list of points along the feature
  let coords = flattenCoords(feature.geometry);
  // sample up to 12 points evenly
  let samples = samplePoints(coords, Math.min(12, coords.length));
  samples.forEach((pt,i)=>{
    let label = `Stop ${i+1}`;
    let val = `${pt[0].toFixed(6)},${pt[1].toFixed(6)}`;
    startSelect.elt.add(new Option(label, val));
    endSelect.elt.add(new Option(label, val));
  });
}

// flatten coordinates for LineString or MultiLineString into one array
function flattenCoords(geometry){
  if(!geometry) return [];
  if(geometry.type === 'LineString') return geometry.coordinates.slice();
  if(geometry.type === 'MultiLineString') return geometry.coordinates.flat();
  return [];
}

// sample n evenly spaced points from coords
function samplePoints(coords, n){
  if(coords.length <= n) return coords.slice();
  let out = [];
  for(let i=0;i<n;i++){
    let idx = floor(map(i,0,n-1,0,coords.length-1));
    out.push(coords[idx]);
  }
  return out;
}

// send clicked: build path and store to Firestore
function onSendClicked(){
  let idx = int(lineSelect.value());
  let feature = geoData.features[idx];
  if(!feature) return;
  // parse start & end picks
  let sVal = startSelect.value().split(',').map(Number);
  let eVal = endSelect.value().split(',').map(Number);

  // find nearest indices in feature coords
  let coords = flattenCoords(feature.geometry);
  let sIdx = nearestIndex(coords, sVal);
  let eIdx = nearestIndex(coords, eVal);
  if(sIdx === null || eIdx === null || eIdx <= sIdx) {
    alert('Please choose valid start and end (end after start).');
    return;
  }
  let path = coords.slice(sIdx, eIdx+1);

  let payload = {
    coords: path,                 // array of [lon,lat]
    msg: msgInput.value().slice(0,240),
    sender: nameInput.value() || 'Anonymous',
    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
    t: 0
  };

  // add to Firestore
  firestore.collection('messages').add(payload).then(()=>{
    // one single short blip
    oscOneShot(0.06, 880, 0.08);
    msgInput.value('');
    nameInput.value('');
  }).catch(e=>{
    console.error('send failed', e);
    alert('Failed to send (check console).');
  });
}

// helper: find nearest coordinate index in coords to target [lon,lat]
function nearestIndex(coords, target){
  if(!coords || coords.length===0) return null;
  let best = 0, bestD = Infinity;
  for(let i=0;i<coords.length;i++){
    let dx = coords[i][0] - target[0];
    let dy = coords[i][1] - target[1];
    let d = dx*dx + dy*dy;
    if(d < bestD){ bestD = d; best = i; }
  }
  return best;
}

// draw overlay: called every frame by p5
function draw(){
  clear(); // clear canvas but leave map tiles visible below
  if(!geoData) return;

  // for each feature, draw small pixelated line (8-bit style)
  strokeWeight(1);
  for(let f of geoData.features){
    let coords = flattenCoords(f.geometry);
    if(coords.length < 2) continue;
    // draw as many small rects between successive points
    for(let i=0;i<coords.length-1;i++){
      let p1 = map.latLngToContainerPoint( L.latLng(coords[i][1], coords[i][0]) );
      let p2 = map.latLngToContainerPoint( L.latLng(coords[i+1][1], coords[i+1][0]) );
      let steps = max(2, floor(dist(p1.x, p1.y, p2.x, p2.y)/6));
      fill('#f8a5c2');
      noStroke();
      for(let s=0;s<steps;s++){
        let x = lerp(p1.x, p2.x, s/steps);
        let y = lerp(p1.y, p2.y, s/steps);
        rect(x, y, 3, 3);
      }
    }
  }

  // draw animated messages (from routes array)
  for(let r of routes){
    if(!r.coords || r.coords.length < 2) continue;
    // ensure t exists
    if(r.t === undefined) r.t = 0;
    // compute segment index
    let seg = (r.coords.length - 1) * r.t;
    let i = floor(seg); let f = seg - i;
    if(i >= r.coords.length - 1) i = r.coords.length - 2;
    let pA = map.latLngToContainerPoint( L.latLng(r.coords[i][1], r.coords[i][0]) );
    let pB = map.latLngToContainerPoint( L.latLng(r.coords[i+1][1], r.coords[i+1][0]) );
    let x = lerp(pA.x, pB.x, f);
    let y = lerp(pA.y, pB.y, f);

    // moving blip
    fill('#a0f0f0'); noStroke();
    rect(x-3, y-3, 6, 6);

    // advance time
    r.t += 0.0025;
    if(r.t > 1) r.t = 0;

    // hover tooltip (only when mouse over canvas area)
    if(dist(mouseX, mouseY, x, y) < 10){
      push();
      fill(255);
      textSize(11);
      textAlign(CENTER);
      text(`${r.sender}: ${r.msg}`, x, y-12);
      pop();
    }
  }
}

// one-shot oscillator blip (duration in seconds)
function oscOneShot(volume, freq, duration){
  oscSend.freq(freq);
  oscSend.amp(volume, 0.01);
  oscSend.start();
  setTimeout(()=>{ oscSend.amp(0, 0.04); setTimeout(()=>oscSend.stop(), 60); }, duration*1000);
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
}

// --- small embedded fallback dataset (if GeoJSON fails to load) ---
function sampleFallback(){
  return {
    "type":"FeatureCollection",
    "features":[
      {"type":"Feature","properties":{ "name":"T1 sample" },"geometry":{"type":"LineString","coordinates":[[151.18,-33.70],[151.21,-33.87],[151.25,-33.81]]}},
      {"type":"Feature","properties":{ "name":"T2 sample" },"geometry":{"type":"LineString","coordinates":[[151.24,-33.89],[151.02,-33.92],[150.88,-33.95]]}}
    ]
  };
}
