// Registra o Service Worker para modo Offline
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js')
    .then(() => console.log('Service Worker ativo!'))
    .catch((err) => console.log('Erro no Service Worker:', err));
}

// 1. Inicializa o Mapa
const map = L.map('map').setView([-27.5954, -48.5480], 16);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

setTimeout(() => { map.invalidateSize(); }, 300);

// 2. Lógica de Download da Área Offline
const btnDownload = document.getElementById('btn-download-area');
const statusText = document.getElementById('download-status');

btnDownload.addEventListener('click', async () => {
  const bounds = map.getBounds();
  const currentZoom = map.getZoom();
  
  statusText.innerText = "Baixando mapa...";
  btnDownload.disabled = true;

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
    } catch (e) {
      console.warn("Falha ao salvar tile:", url);
    }
  }

  statusText.innerText = "Área salva offline! ✅";
  btnDownload.disabled = false;
  setTimeout(() => { statusText.innerText = ""; }, 4000);
});

function latLngToTile(lat, lng, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lng + 180) / 360) * n);
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2) * n);
  return { x, y };
}

// 3. Monitoramento do GPS em Tempo Real (Funciona sem chip)
let meuMarcadorGPS = null;
let minhaCirculoPrecisao = null;

if ('geolocation' in navigator) {
  navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      const novaPosicao = [latitude, longitude];

      if (meuMarcadorGPS) {
        meuMarcadorGPS.setLatLng(novaPosicao);
        minhaCirculoPrecisao.setLatLng(novaPosicao);
        minhaCirculoPrecisao.setRadius(accuracy);
      } else {
        // Bolinha azul representando a localização do usuário
        meuMarcadorGPS = L.marker(novaPosicao, {
          icon: L.divIcon({
            className: 'user-location-icon',
            html: '<div style="background:#007bff; width:16px; height:16px; border-radius:50%; border:3px solid white; box-shadow:0 0 8px rgba(0,0,0,0.4);"></div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
          })
        }).addTo(map);

        minhaCirculoPrecisao = L.circle(novaPosicao, {
          radius: accuracy,
          color: '#007bff',
          fillColor: '#007bff',
          fillOpacity: 0.15,
          weight: 1
        }).addTo(map);

        map.setView(novaPosicao, 18);
      }
    },
    (err) => console.warn("Aguardando sinal do GPS..."),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
  );
}

// 4. Mapeamento dos Blocos / Apartamentos
const modal = document.getElementById('modal-container');
const modalTitle = document.getElementById('modal-title');
const inputBloco = document.getElementById('input-bloco');
const inputApt = document.getElementById('input-apt');
const inputDesc = document.getElementById('input-desc');
const btnSalvar = document.getElementById('btn-salvar');
const btnExcluir = document.getElementById('btn-excluir');
const btnCancelar = document.getElementById('btn-cancelar');

let pontosSalvos = JSON.parse(localStorage.getItem('blocos_mapeados') || '[]');
let coordsSelecionadas = null;
let pontoEditandoId = null;

function carregarMarcadores() {
  pontosSalvos.forEach(ponto => renderizarMarcador(ponto));
}

function renderizarMarcador(ponto) {
  const marker = L.marker([ponto.lat, ponto.lng]).addTo(map);

  const popupContent = document.createElement('div');
  popupContent.style.minWidth = '140px';
  popupContent.innerHTML = `
    <h3 style="margin:0 0 4px 0; color:#007bff;">Bloco ${ponto.bloco}</h3>
    <b>Apt:</b> ${ponto.apt || 'N/A'}<br>
    <p style="margin-top:6px; font-size:12px;">${ponto.desc || ''}</p>
    <button id="btn-edit-${ponto.id}" style="margin-top:8px; width:100%; background:#007bff; color:white; border:none; padding:4px; border-radius:4px;">✏️ Editar / Ver</button>
  `;

  marker.bindPopup(popupContent);

  marker.on('popupopen', () => {
    const btnEdit = document.getElementById(`btn-edit-${ponto.id}`);
    if (btnEdit) {
      btnEdit.onclick = () => abrirModalParaEditar(ponto);
    }
  });
}

map.on('click', function(e) {
  coordsSelecionadas = e.latlng;
  pontoEditandoId = null;

  modalTitle.innerText = "Cadastrar Novo Bloco";
  inputBloco.value = '';
  inputApt.value = '';
  inputDesc.value = '';

  btnExcluir.classList.add('hidden');
  modal.classList.remove('hidden');
});

function abrirModalParaEditar(ponto) {
  pontoEditandoId = ponto.id;
  coordsSelecionadas = { lat: ponto.lat, lng: ponto.lng };

  modalTitle.innerText = "Editar Bloco";
  inputBloco.value = ponto.bloco;
  inputApt.value = ponto.apt;
  inputDesc.value = ponto.desc;

  btnExcluir.classList.remove('hidden');
  modal.classList.remove('hidden');
}

btnSalvar.addEventListener('click', () => {
  const bloco = inputBloco.value.trim();
  if (!bloco) {
    alert("Informe a letra ou número do bloco!");
    return;
  }

  if (pontoEditandoId) {
    pontosSalvos = pontosSalvos.map(p => {
      if (p.id === pontoEditandoId) {
        return { ...p, bloco, apt: inputApt.value, desc: inputDesc.value };
      }
      return p;
    });
  } else {
    const novoPonto = {
      id: Date.now(),
      lat: coordsSelecionadas.lat,
      lng: coordsSelecionadas.lng,
      bloco,
      apt: inputApt.value,
      desc: inputDesc.value
    };
    pontosSalvos.push(novoPonto);
  }

  salvarERecalcular();
  modal.classList.add('hidden');
});

btnExcluir.addEventListener('click', () => {
  if (confirm("Deseja realmente excluir este bloco cadastrado?")) {
    pontosSalvos = pontosSalvos.filter(p => p.id !== pontoEditandoId);
    salvarERecalcular();
    modal.classList.add('hidden');
  }
});

btnCancelar.addEventListener('click', () => {
  modal.classList.add('hidden');
});

function salvarERecalcular() {
  localStorage.setItem('blocos_mapeados', JSON.stringify(pontosSalvos));
  
  // Limpa apenas os marcadores de blocos cadastrados
  map.eachLayer(layer => {
    if (layer instanceof L.Marker && layer !== meuMarcadorGPS) {
      map.removeLayer(layer);
    }
  });
  carregarMarcadores();
}

carregarMarcadores();
