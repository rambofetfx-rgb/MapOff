if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.log('SW Error:', err));
}

// 1. Inicializa o Mapa
const map = L.map('map').setView([-27.5954, -48.5480], 16);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

setTimeout(() => { map.invalidateSize(); }, 300);

// 2. Adiciona Campo de Busca de Endereços
L.Control.geocoder({
  defaultMarkGeocode: false,
  placeholder: "Buscar endereço..."
})
.on('markgeocode', function(e) {
  const bbox = e.geocode.bbox;
  const poly = L.polygon([
    bbox.getSouthEast(),
    bbox.getNorthEast(),
    bbox.getNorthWest(),
    bbox.getSouthWest()
  ]);
  map.fitBounds(poly.getBounds());
  L.marker(e.geocode.center).addTo(map).bindPopup(e.geocode.name).openPopup();
})
.addTo(map);

// 3. Monitoramento do GPS e Posição Atual
let meuMarcadorGPS = null;
let minhaCirculoPrecisao = null;
let posicaoAtualGPS = null;

if ('geolocation' in navigator) {
  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      posicaoAtualGPS = [latitude, longitude];

      if (meuMarcadorGPS) {
        meuMarcadorGPS.setLatLng(posicaoAtualGPS);
        minhaCirculoPrecisao.setLatLng(posicaoAtualGPS);
        minhaCirculoPrecisao.setRadius(accuracy);
      } else {
        meuMarcadorGPS = L.marker(posicaoAtualGPS, {
          icon: L.divIcon({
            className: 'user-location-icon',
            html: '<div style="background:#007bff; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 8px rgba(0,0,0,0.4);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        }).addTo(map);

        minhaCirculoPrecisao = L.circle(posicaoAtualGPS, {
          radius: accuracy,
          color: '#007bff',
          fillColor: '#007bff',
          fillOpacity: 0.15,
          weight: 1
        }).addTo(map);

        map.setView(posicaoAtualGPS, 18);
      }
      atualizarListaAba();
    },
    (err) => console.warn("GPS sem sinal..."),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

// 4. Mapeamento, Armazenamento e Linhas de Rota
let pontosSalvos = JSON.parse(localStorage.getItem('blocos_mapeados') || '[]');
let linhaRotaAtual = null;

function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Raio da Terra em metros
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return Math.round(R * c); // Retorna em metros
}

function renderizarMarcadores() {
  pontosSalvos.forEach(ponto => {
    const marker = L.marker([ponto.lat, ponto.lng]).addTo(map);
    marker.bindPopup(`
      <b>Bloco ${ponto.bloco}</b><br>
      Apt: ${ponto.apt || 'N/A'}<br>
      <button onclick="tracarRotaAte(${ponto.lat}, ${ponto.lng}, 'Bloco ${ponto.bloco}')" style="margin-top:6px; background:#28a745; color:white; border:none; padding:4px 8px; border-radius:4px;">🗺️ Ir até aqui</button>
    `);
  });
}

function tracarRotaAte(destLat, destLng, nomeDestino) {
  if (!posicaoAtualGPS) {
    alert("Aguardando sinal do GPS para traçar a rota...");
    return;
  }

  if (linhaRotaAtual) map.removeLayer(linhaRotaAtual);

  // Desenha a linha de rota (pode ser substituído por rotas do OSRM se online)
  linhaRotaAtual = L.polyline([posicaoAtualGPS, [destLat, destLng]], {
    color: '#007bff',
    weight: 5,
    opacity: 0.8,
    dashArray: '10, 10'
  }).addTo(map);

  const distMetros = calcularDistanciaMetros(posicaoAtualGPS[0], posicaoAtualGPS[1], destLat, destLng);
  
  document.getElementById('route-info').classList.remove('hidden');
  document.getElementById('route-text').innerText = `Destino: ${nomeDestino}\nDistância: ${distMetros} metros`;

  map.fitBounds(linhaRotaAtual.getBounds(), { padding: [50, 50] });
}

document.getElementById('btn-limpar-rota').addEventListener('click', () => {
  if (linhaRotaAtual) map.removeLayer(linhaRotaAtual);
  document.getElementById('route-info').classList.add('hidden');
});

// 5. Gerenciamento do Painel Lateral / Aba de Pontos
const sidePanel = document.getElementById('side-panel');
document.getElementById('btn-toggle-panel').addEventListener('click', () => sidePanel.classList.remove('panel-hidden'));
document.getElementById('btn-close-panel').addEventListener('click', () => sidePanel.classList.add('panel-hidden'));

function atualizarListaAba() {
  const listaEl = document.getElementById('lista-pontos');
  listaEl.innerHTML = '';

  // Ordena os pontos pelo mais próximo de você
  let pontosComDistancia = pontosSalvos.map(p => {
    let dist = posicaoAtualGPS 
      ? calcularDistanciaMetros(posicaoAtualGPS[0], posicaoAtualGPS[1], p.lat, p.lng)
      : null;
    return { ...p, dist };
  });

  if (posicaoAtualGPS) {
    pontosComDistancia.sort((a, b) => a.dist - b.dist);
  }

  pontosComDistancia.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="ponto-item-title">Bloco ${p.bloco} - Apt ${p.apt || 'N/A'}</span>
      <span class="ponto-item-dist">${p.dist !== null ? `📍 A ${p.dist}m de você` : 'Sem GPS'}</span>
      <div class="ponto-actions">
        <button class="btn-primary btn-sm" onclick="tracarRotaAte(${p.lat}, ${p.lng}, 'Bloco ${p.bloco}')">Ir Até</button>
        <button class="btn-secondary btn-sm" onclick="focarNoPonto(${p.lat}, ${p.lng})">Ver no Mapa</button>
      </div>
    `;
    listaEl.appendChild(li);
  });
}

function focarNoPonto(lat, lng) {
  map.setView([lat, lng], 18);
  sidePanel.classList.add('panel-hidden');
}

// 6. Modal & Cadastro de Blocos
const modal = document.getElementById('modal-container');
let coordsSelecionadas = null;

map.on('click', function(e) {
  coordsSelecionadas = e.latlng;
  document.getElementById('modal-title').innerText = "Cadastrar Novo Bloco";
  document.getElementById('input-bloco').value = '';
  document.getElementById('input-apt').value = '';
  document.getElementById('input-desc').value = '';
  modal.classList.remove('hidden');
});

document.getElementById('btn-salvar').addEventListener('click', () => {
  const bloco = document.getElementById('input-bloco').value.trim();
  if (!bloco) return alert("Informe o Bloco!");

  pontosSalvos.push({
    id: Date.now(),
    lat: coordsSelecionadas.lat,
    lng: coordsSelecionadas.lng,
    bloco,
    apt: document.getElementById('input-apt').value,
    desc: document.getElementById('input-desc').value
  });

  localStorage.setItem('blocos_mapeados', JSON.stringify(pontosSalvos));
  modal.classList.add('hidden');
  location.reload(); // Recarrega para atualizar mapa e lista
});

document.getElementById('btn-cancelar').addEventListener('click', () => modal.classList.add('hidden'));

// 7. Lógica de Download da Área Offline
document.getElementById('btn-download-area').addEventListener('click', async () => {
  const bounds = map.getBounds();
  const currentZoom = map.getZoom();
  const statusText = document.getElementById('download-status');
  statusText.innerText = "Baixando...";

  const minZoom = Math.max(currentZoom - 1, 14);
  const maxZoom = Math.min(currentZoom + 2, 18);
  let urls = [];

  for (let z = minZoom; z <= maxZoom; z++) {
    const minTile = latLngToTile(bounds.getSouth(), bounds.getWest(), z);
    const maxTile = latLngToTile(bounds.getNorth(), bounds.getEast(), z);

    for (let x = Math.min(minTile.x, maxTile.x); x <= Math.max(minTile.x, maxTile.x); x++) {
      for (let y = Math.min(minTile.y, maxTile.y); y <= Math.max(minTile.y, maxTile.y); y++) {
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
      statusText.innerText = `Baixando: ${Math.round((baixados / urls.length) * 100)}%`;
    } catch (e) {}
  }

  statusText.innerText = "Área salva! ✅";
  setTimeout(() => statusText.innerText = "", 3000);
});

function latLngToTile(lat, lng, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2) * n)
  };
}

// Inicializações
renderizarMarcadores();
atualizarListaAba();
