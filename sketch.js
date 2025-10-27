let map;
let trainData;
let messages = [];
let ding;

function preload() {
  trainData = loadJSON('sydney_train_routes_named.json');
  ding = new p5.Oscillator('sine');
}

function setup() {
  noCanvas();

  ding.start();
  ding.amp(0);

  map = L.map('map').setView([-33.87, 151.21], 10);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  setupUI();
}

function setupUI() {
  const ui = select('#ui');
  const lineSel = select('#lineSelect');
  const startSel = select('#startSelect');
  const endSel = select('#endSelect');

  getLineNames().forEach(line => lineSel.elt.add(new Option(line, line)));

  lineSel.changed(() => updateStations(lineSel.value(), startSel, endSel));
  updateStations(lineSel.value(), startSel, endSel);

  select('#sendBtn').mousePressed(() => {
    const msg = select('#msgInput').value().trim();
    const line = lineSel.value();
    const start = startSel.value();
    const end = endSel.value();

    if (msg && start && end) {
      playSound();
      addMessage(line, start, end, msg);
      select('#msgInput').value('');
    }
  });

  select('#clearBtn').mousePressed(() => {
    messages = [];
    map.eachLayer(layer => {
      if (layer instanceof L.Marker || layer instanceof L.Polyline) map.removeLayer(layer);
    });
  });
}

// ---------- Flexible JSON Handlers ----------
function getLineNames() {
  if (Array.isArray(trainData)) {
    return trainData.map(l => l.line || l.name || 'Unnamed Line');
  } else if (trainData.routes) {
    return Object.keys(trainData.routes);
  } else {
    return Object.keys(trainData);
  }
}

function updateStations(line, startSel, endSel) {
  startSel.elt.innerHTML = '';
  endSel.elt.innerHTML = '';

  let stations = [];

  if (Array.isArray(trainData)) {
    const lineObj = trainData.find(l => l.line === line || l.name === line);
    stations = lineObj ? lineObj.stations || lineObj.stops || [] : [];
  } else if (trainData.routes && trainData.routes[line]) {
    stations = trainData.routes[line].stations || trainData.routes[line].stops || [];
  } else {
    stations = trainData[line] || [];
  }

  stations.forEach(station => {
    const name = station.name || station[0] || 'Unknown';
    startSel.elt.add(new Option(name, name));
    endSel.elt.add(new Option(name, name));
  });
}

function addMessage(line, startName, endName, text) {
  let stations = [];

  if (Array.isArray(trainData)) {
    const lineObj = trainData.find(l => l.line === line || l.name === line);
    stations = lineObj ? lineObj.stations || [] : [];
  } else if (trainData.routes && trainData.routes[line]) {
    stations = trainData.routes[line].stations || [];
  } else {
    stations = trainData[line] || [];
  }

  const startIdx = stations.findIndex(s => s.name === startName);
  const endIdx = stations.findIndex(s => s.name === endName);
  if (startIdx < 0 || endIdx < 0 || startIdx >= endIdx) return;

  const segment = stations.slice(startIdx, endIdx + 1);
  const coords = segment.map(s => [s.lat || s.latitude, s.lng || s.longitude]);

  const routeLine = L.polyline(coords, { color: '#f8a5c2', weight: 3 }).addTo(map);
  const mid = coords[Math.floor(coords.length / 2)];
  const marker = L.marker(mid).addTo(map);
  marker.bindPopup(`<div style="font-family:'Press Start 2P';font-size:10px;">${text}</div>`);

  messages.push({ line, startName, endName, text });
}

function playSound() {
  ding.amp(0.3, 0.05);
  ding.freq(880);
  setTimeout(() => ding.amp(0, 0.5), 150);
}
