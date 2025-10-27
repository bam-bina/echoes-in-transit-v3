let map, geoData;
let routes = [], currentRide = null;
let blip1, blip2, ding;
const GEOJSON_URL = "sydney_train_routes_named.json"; // your merged file

function preload() {
  blip1 = new p5.Oscillator('square'); blip1.amp(0.05); blip1.freq(600);
  blip2 = new p5.Oscillator('triangle'); blip2.amp(0.05); blip2.freq(300);
  ding  = new p5.Oscillator('sine'); ding.amp(0.05); ding.freq(800);
}

function setup() {
  // Create Leaflet map
  const mymap = L.map('map').setView([-33.87,151.21], 10);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(mymap);
  map = mymap;

  // Create p5 canvas overlay
  const myCanvas = createCanvas(window.innerWidth, window.innerHeight);
  myCanvas.position(0,0);
  myCanvas.style('z-index','1');
  myCanvas.style('pointer-events','none'); // don't block map
  noStroke();

  // Load the full Sydney train routes
  loadJSON(GEOJSON_URL, data => {
    geoData = data;
    setupUI();
  });
}

function setupUI(){
  let lineSel = select('#lineSelect');
  Object.keys(geoData.features).forEach((_, i) => {
    let f = geoData.features[i];
    let id = f.properties.route_id || f.properties.route_short_name || `Line ${i}`;
    let name = f.properties.route_long_name || id;
    lineSel.elt.add(new Option(`${id} — ${name}`, id));
  });

  lineSel.changed(()=>{
    blip2.start(); blip2.stop(0.1);
    updateStations();
  });

  select('#sendBtn').mousePressed(()=>{
    ding.start(); ding.stop(0.2);
    addRoute();
  });
  select('#clearBtn').mousePressed(()=>{ routes = []; });
  select('#rideBtn').mousePressed(()=>{ if(routes.length>0){ currentRide=routes[0]; }});

  updateStations();
}

function updateStations(){
  let lineSel = select('#lineSelect').value();
  let startSel = select('#startSelect');
  let endSel = select('#endSelect');
  startSel.elt.innerHTML='';
  endSel.elt.innerHTML='';

  const feature = geoData.features.find(f =>
    (f.properties.route_id || f.properties.route_short_name) === lineSel
  );
  if (!feature) return;

  const stops = feature.properties.stop_names || [];
  stops.forEach((s,i)=>{
    startSel.elt.add(new Option(s,i));
    endSel.elt.add(new Option(s,i));
  });
}

function addRoute(){
  let lineSel = select('#lineSelect').value();
  let s = int(select('#startSelect').value());
  let e = int(select('#endSelect').value());
  let msg = select('#msgInput').value();
  if (e <= s || !msg) return;

  const feature = geoData.features.find(f =>
    (f.properties.route_id || f.properties.route_short_name) === lineSel
  );
  if (!feature) return;

  let path = feature.geometry.coordinates.slice(s, e + 1);
  routes.push({ path: path, msg: msg, t: 0 });
  select('#msgInput').value('');
}

function draw(){
  clear();
  for (let r of routes) {
    drawPixelRoute(r);
    r.t += 0.005;
    if (r.t > 1) r.t = 0;
  }
  if (currentRide) rideRoute(currentRide);
}

function drawPixelRoute(r){
  push(); fill('#f8a5c2');
  for (let i = 0; i < r.path.length - 1; i++) {
    let p1 = map.latLngToContainerPoint(L.latLng(r.path[i][1], r.path[i][0]));
    let p2 = map.latLngToContainerPoint(L.latLng(r.path[i + 1][1], r.path[i + 1][0]));
    let steps = int(dist(p1.x,p1.y,p2.x,p2.y)/8);
    for (let j = 0; j < steps; j++) {
      let x = lerp(p1.x,p2.x,j/steps);
      let y = lerp(p1.y,p2.y,j/steps);
      rect(x,y,2,2);
    }
  }
  let tpos = routePointAt(r.path, r.t);
  if (tpos) { fill('#a0f0f0'); rect(tpos.x,tpos.y,4,4); }
  pop();
}

function routePointAt(path, t){
  if (path.length < 2) return null;
  let seg = (path.length - 1) * t;
  let i = floor(seg);
  let local = seg - i;
  if (i >= path.length - 1) i = path.length - 2;
  let p1 = map.latLngToContainerPoint(L.latLng(path[i][1], path[i][0]));
  let p2 = map.latLngToContainerPoint(L.latLng(path[i + 1][1], path[i + 1][0]));
  return { x: lerp(p1.x,p2.x,local), y: lerp(p1.y,p2.y,local) };
}

function rideRoute(r){
  push(); fill('#f8a5c2'); textSize(10); textAlign(CENTER);
  let tpos = routePointAt(r.path, r.t);
  if (tpos) {
    let chars = int(frameCount / 5) % (r.msg.length + 1);
    text(r.msg.substring(0, chars), tpos.x, tpos.y - 10);
  }
  pop();
}

function windowResized(){ resizeCanvas(window.innerWidth, window.innerHeight); }
