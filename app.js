// Registra Service Worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Error:', err));
}

// 1. Inicialização do Mapa
const map = L.map('map', { zoomControl: true }).setView([-27.5954, -48.5480], 15);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

setTimeout(() => map.invalidateSize(), 300);

// 2. Variáveis de Estado Global
let pontosSalvos = JSON.parse(localStorage.getItem('blocos_mapeados') || '[]');
let posicaoGPS = null;
let marcadorGPS = null;
let circuloPrecisao = null;
let marcadorBusca = null;
let linhaRota = null;
let pontoEdicaoId = null;
let coordsTemp = null;

// 3. Sistema de Geolocalização Contínua (GPS em Tempo Real)
if ('geolocation' in navigator) {
  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      posicaoGPS = [latitude, longitude];

      if (marcadorGPS) {
        marcadorGPS.setLatLng(posicaoGPS);
        circuloPrecisao.setLatLng(posicaoGPS).setRadius(accuracy);
      } else {
        marcadorGPS = L.marker(posicaoGPS, {
          icon: L.divIcon({
            className: 'user-marker',
            html: '<div style="background:#0066ff; width:18px; height:18px; border-radius:50%; border:3px solid white; box-shadow:0 0 10px rgba(0,0,0,0.3);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        }).addTo(map);

        circuloPrecisao = L.circle(posicaoGPS, {
          radius: accuracy,
          color: '#0066ff',
          fillColor: '#0066ff',
          fillOpacity: 0.12,
          weight: 1
        }).addTo(map);

        map.setView(posicaoGPS, 17);
      }

      atualizarInterface();
      if (linhaRota) atualizarDistanciaRota();
    },
    (err) => console.warn('Aguardando GPS...'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

// 4. Busca Unificada (Online e Offline nos Pontos Salvos)
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', async () => {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return searchResults.classList.add('hidden');

  searchResults.innerHTML = '';

  // 4a. Busca em locais salvos (Offline)
  const locaisLocais = pontosSalvos.filter(p => p.bloco.toLowerCase().includes(query) || (p.apt && p.apt.toLowerCase().includes(query)));
  
  locaisLocais.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `📌 <b>${p.bloco}</b> ${p.apt ? `- Apt ${p.apt}` : ''} <span style="font-size:10px; color:#10b981;">(Salvo)</span>`;
    li.onclick = () => {
      map.setView([p.lat, p.lng], 18);
      searchResults.classList.add('hidden');
    };
    searchResults.appendChild(li);
  });

  // 4b. Busca via Nominatim (Online)
  if (navigator.onLine && query.length > 3) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
      const data = await res.json();

      data.slice(0, 4).forEach(item => {
        const li = document.createElement('li');
        li.innerHTML = `🌐 ${item.display_name}`;
        li.onclick = () => selecionarLocalOnline(item);
        searchResults.appendChild(li);
      });
    } catch (e) {}
  }

  searchResults.classList.remove('hidden');
});

function selecionarLocalOnline(item) {
  const lat = parseFloat(item.lat);
  const lon = parseFloat(item.lon);

  searchResults.classList.add('hidden');
  map.setView([lat, lon], 17);

  if (marcadorBusca) map.removeLayer(marcadorBusca);

  marcadorBusca = L.marker([lat, lon]).addTo(map);
  const popupContent = document.createElement('div');
  popupContent.innerHTML = `
    <div style="font-size:13px; font-weight:bold; margin-bottom:4px;">${item.display_name.split(',')[0]}</div>
    <button id="btn-salvar-busca" style="width:100%; background:#10b981; color:white; border:none; padding:6px; border-radius:6px; font-weight:bold; cursor:pointer;">📌 Salvar Ponto Aqui</button>
  `;

  marcadorBusca.bindPopup(popupContent).openPopup();

  setTimeout(() => {
    const btn = document.getElementById('btn-salvar-busca');
    if (btn) btn.onclick = () => abrirModal(lat, lon, item.display_name.split(',')[0]);
  }, 100);
}

// 5. Cálculos de Distância e Rotas
function calcularDistancia(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

let destinoAtual = null;

function tracarRota(destLat, destLng, nome) {
  if (!posicaoGPS) return alert("Aguardando sinal do GPS...");

  destinoAtual = { lat: destLat, lng: destLng, nome };

  if (linhaRota) map.removeLayer(linhaRota);

  linhaRota = L.polyline([posicaoGPS, [destLat, destLng]], {
    color: '#0066ff',
    weight: 5,
    dashArray: '8, 8'
  }).addTo(map);

  document.getElementById('route-info').classList.remove('hidden');
  document.getElementById('route-title').innerText = `Destino: ${nome}`;
  atualizarDistanciaRota();

  map.fitBounds(linhaRota.getBounds(), { padding: [40, 40] });
  fecharPainel();
}

function atualizarDistanciaRota() {
  if (!destinoAtual || !posicaoGPS) return;
  const dist = calcularDistancia(posicaoGPS[0], posicaoGPS[1], destinoAtual.lat, destinoAtual.lng);
  document.getElementById('route-distance').innerText = `Distância aproximada: ${dist} metros`;
}

document.getElementById('btn-limpar-rota').onclick = () => {
  if (linhaRota) map.removeLayer(linhaRota);
  linhaRota = null;
  destinoAtual = null;
  document.getElementById('route-info').classList.add('hidden');
};

// 6. Gerenciamento de Marcadores e UI
function renderizarMarcadores() {
  map.eachLayer(layer => {
    if (layer instanceof L.Marker && layer !== marcadorGPS && layer !== marcadorBusca) {
      map.removeLayer(layer);
    }
  });

  pontosSalvos.forEach(ponto => {
    const marker = L.marker([ponto.lat, ponto.lng]).addTo(map);
    marker.bindPopup(`
      <b style="font-size:14px; color:#0066ff;">${ponto.bloco}</b><br>
      ${ponto.apt ? `Apt: ${ponto.apt}<br>` : ''}
      ${ponto.desc ? `<p style="font-size:11px; color:#666; margin:4px 0;">${ponto.desc}</p>` : ''}
      <button onclick="tracarRota(${ponto.lat}, ${ponto.lng}, '${ponto.bloco}')" style="width:100%; margin-top:6px; background:#0066ff; color:white; border:none; padding:6px; border-radius:6px; font-weight:bold; cursor:pointer;">🗺️ Traçar Rota</button>
    `);
  });

  document.getElementById('ponto-count').innerText = pontosSalvos.length;
}

function atualizarInterface() {
  const listaEl = document.getElementById('lista-pontos');
  listaEl.innerHTML = '';

  let listaComDist = pontosSalvos.map(p => ({
    ...p,
    dist: posicaoGPS ? calcularDistancia(posicaoGPS[0], posicaoGPS[1], p.lat, p.lng) : null
  }));

  if (posicaoGPS) listaComDist.sort((a, b) => a.dist - b.dist);

  listaComDist.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="ponto-title">${p.bloco} ${p.apt ? `- Apt ${p.apt}` : ''}</div>
      <div class="ponto-dist">${p.dist !== null ? `📍 A ${p.dist}m de você` : 'Sem GPS'}</div>
      ${p.desc ? `<div class="ponto-desc">${p.desc}</div>` : ''}
      <div class="item-actions">
        <button class="btn btn-primary" style="padding:6px; font-size:12px;" onclick="tracarRota(${p.lat}, ${p.lng}, '${p.bloco}')">Ir Até</button>
        <button class="btn" style="background:#e2e8f0; padding:6px; font-size:12px;" onclick="focarPonto(${p.lat}, ${p.lng})">Ver</button>
      </div>
    `;
    listaEl.appendChild(li);
  });
}

function focarPonto(lat, lng) {
  map.setView([lat, lng], 18);
  fecharPainel();
}

// 7. Modal de Cadastro / Edição
const modal = document.getElementById('modal-container');

map.on('click', (e) => abrirModal(e.latlng.lat, e.latlng.lng));

function abrirModal(lat, lng, nomeSugestao = '') {
  coordsTemp = { lat, lng };
  pontoEdicaoId = null;

  document.getElementById('modal-title').innerText = "Cadastrar Local";
  document.getElementById('input-bloco').value = nomeSugestao;
  document.getElementById('input-apt').value = '';
  document.getElementById('input-desc').value = '';
  document.getElementById('btn-excluir').classList.add('hidden');

  modal.classList.remove('hidden');
}

document.getElementById('btn-salvar').onclick = () => {
  const bloco = document.getElementById('input-bloco').value.trim();
  if (!bloco) return alert("Informe ao menos o nome ou bloco!");

  pontosSalvos.push({
    id: Date.now(),
    lat: coordsTemp.lat,
    lng: coordsTemp.lng,
    bloco,
    apt: document.getElementById('input-apt').value.trim(),
    desc: document.getElementById('input-desc').value.trim()
  });

  localStorage.setItem('blocos_mapeados', JSON.stringify(pontosSalvos));
  modal.classList.add('hidden');
  if (marcadorBusca) map.removeLayer(marcadorBusca);

  renderizarMarcadores();
  atualizarInterface();
};

document.getElementById('btn-close-modal').onclick = () => modal.classList.add('hidden');

// 8. Drawer Lateral
const panel = document.getElementById('side-panel');
document.getElementById('btn-toggle-panel').onclick = () => panel.classList.remove('panel-hidden');
document.getElementById('btn-close-panel').onclick = fecharPainel;
function fecharPainel() { panel.classList.add('panel-hidden'); }

// 9. Modulo de Download Offline
document.getElementById('btn-download-area').onclick = async () => {
  const bounds = map.getBounds();
  const zoom = map.getZoom();
  const toast = document.getElementById('download-toast');
  const status = document.getElementById('download-status');

  toast.classList.remove('hidden');
  status.innerText = "Iniciando download...";

  let urls = [];
  for (let z = Math.max(zoom - 1, 14); z <= Math.min(zoom + 2, 18); z++) {
    const min = latLngToTile(bounds.getSouth(), bounds.getWest(), z);
    const max = latLngToTile(bounds.getNorth(), bounds.getEast(), z);

    for (let x = Math.min(min.x, max.x); x <= Math.max(min.x, max.x); x++) {
      for (let y = Math.min(min.y, max.y); y <= Math.max(min.y, max.y); y++) {
        urls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
    }
  }

  const cache = await caches.open('mapa-offline-v1');
  let baixados = 0;

  for (const url of urls) {
    try {
      await cache.add(url);
      baixados++;
      status.innerText = `Baixando área: ${Math.round((baixados / urls.length) * 100)}%`;
    } catch (e) {}
  }

  status.innerText = "Área salva offline! ✅";
  setTimeout(() => toast.classList.add('hidden'), 3000);
};

function latLngToTile(lat, lng, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2) * n)
  };
}

// Inicializar Dados
renderizarMarcadores();
atualizarInterface();
