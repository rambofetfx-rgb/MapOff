if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.log('SW Error:', err));
}

// 1. Inicialização Otimizada com GPU/Canvas
const map = L.map('map', { 
  zoomControl: true,
  preferCanvas: true // Aumenta a fluidez em celulares
}).setView([-27.5954, -48.5480], 15);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

setTimeout(() => map.invalidateSize(), 300);

// 2. Estado Global
let pontosSalvos = JSON.parse(localStorage.getItem('blocos_mapeados') || '[]');
let alamedasSalvas = JSON.parse(localStorage.getItem('alamedas_condominio') || '[]'); // Malha de vias salvas
let posicaoGPS = null;
let marcadorGPS = null;
let circuloPrecisao = null;
let marcadorBusca = null;
let linhaRota = null;
let coordsTemp = null;
let tipoCadastro = 'ponto';

// Controle de Visibilidade de Pontos e Textos
let exibirPontos = true;
let exibirTextos = true;
let camadaPontosGroup = L.layerGroup().addTo(map);
let camadaTextosGroup = L.layerGroup().addTo(map);
let camadaAlamedasGroup = L.layerGroup().addTo(map);

// Medição A ➔ B
let modoMedicao = false;
let pontoA = null;
let pontoB = null;
let marcadorA = null;
let marcadorB = null;
let linhaMedicao = null;

// Modo Texto
let modoTexto = false;

// Modo Desenhar Alameda/Vias
let modoDesenhoAlameda = false;
let pontosAlamedaAtual = [];
let linhaAlamedaRascunho = null;

// 3. Localização GPS
function obterLocalizacaoUsuario(centralizar = false) {
  mostrarToast("Buscando sinal de GPS...");

  if (!('geolocation' in navigator)) {
    mostrarToast("Seu dispositivo não suporta GPS.");
    return;
  }

  const optionsHighAccuracy = { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 };
  const optionsLowAccuracy = { enableHighAccuracy: false, timeout: 10000, maximumAge: 30000 };

  function sucesso(pos) {
    const { latitude, longitude, accuracy } = pos.coords;
    posicaoGPS = [latitude, longitude];

    if (marcadorGPS) {
      marcadorGPS.setLatLng(posicaoGPS);
      circuloPrecisao.setLatLng(posicaoGPS).setRadius(accuracy);
    } else {
      marcadorGPS = L.marker(posicaoGPS, {
        icon: L.divIcon({
          className: 'user-marker',
          html: '<div style="background:#0066ff; width:18px; height:18px; border-radius:50%; border:3px solid white; box-shadow:0 0 8px rgba(0,0,0,0.4);"></div>',
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
    }

    if (centralizar) map.setView(posicaoGPS, 17);
    ocultarToast();
    atualizarInterface();
  }

  function falha(err) {
    if (err.code === err.TIMEOUT || err.code === err.POSITION_UNAVAILABLE) {
      navigator.geolocation.getCurrentPosition(sucesso, erroFinal, optionsLowAccuracy);
    } else {
      erroFinal(err);
    }
  }

  function erroFinal(err) {
    mostrarToast("GPS indisponível. Você pode usar a navegação manual.");
    setTimeout(ocultarToast, 4000);
  }

  navigator.geolocation.getCurrentPosition(sucesso, falha, optionsHighAccuracy);
}

obterLocalizacaoUsuario(true);
document.getElementById('btn-my-location').onclick = () => obterLocalizacaoUsuario(true);

// 4. Alternar Visibilidade de Pontos e Textos
document.getElementById('btn-toggle-pins').onclick = () => {
  exhibirPontos = !exibirPontos;
  if (exibirPontos) {
    map.addLayer(camadaPontosGroup);
    document.getElementById('icon-pins').innerText = '📍';
    document.getElementById('text-pins').innerText = 'Ocultar Pontos';
  } else {
    map.removeLayer(camadaPontosGroup);
    document.getElementById('icon-pins').innerText = '🚫';
    document.getElementById('text-pins').innerText = 'Mostrar Pontos';
  }
};

document.getElementById('btn-toggle-texts').onclick = () => {
  exibirTextos = !exibirTextos;
  if (exibirTextos) {
    map.addLayer(camadaTextosGroup);
    document.getElementById('icon-texts').innerText = '🏷️';
    document.getElementById('text-texts').innerText = 'Ocultar Textos';
  } else {
    map.removeLayer(camadaTextosGroup);
    document.getElementById('icon-texts').innerText = '🚫';
    document.getElementById('text-texts').innerText = 'Mostrar Textos';
  }
};

// 5. Desenho Manual de Alamedas Privadas
const btnDrawPath = document.getElementById('btn-draw-path');
const pathBanner = document.getElementById('path-banner');

btnDrawPath.onclick = () => {
  resetarOutrosModos();
  modoDesenhoAlameda = true;
  pontosAlamedaAtual = [];
  pathBanner.classList.remove('hidden');
};

document.getElementById('btn-cancel-path').onclick = resetarModoDesenhoAlameda;

function resetarModoDesenhoAlameda() {
  modoDesenhoAlameda = false;
  pontosAlamedaAtual = [];
  if (linhaAlamedaRascunho) {
    map.removeLayer(linhaAlamedaRascunho);
    linhaAlamedaRascunho = null;
  }
  pathBanner.classList.add('hidden');
}

document.getElementById('btn-finish-path').onclick = () => {
  if (pontosAlamedaAtual.length < 2) {
    alert("Desenhe pelo menos 2 pontos para criar uma alameda!");
    return;
  }

  alamedasSalvas.push(pontosAlamedaAtual);
  localStorage.setItem('alamedas_condominio', JSON.stringify(alamedasSalvas));
  resetarModoDesenhoAlameda();
  renderizarAlamedas();
  mostrarToast("Alameda salva para rota offline!");
  setTimeout(ocultarToast, 3000);
};

function renderizarAlamedas() {
  camadaAlamedasGroup.clearLayers();
  alamedasSalvas.forEach(caminho => {
    L.polyline(caminho, { color: '#0284c7', weight: 4, opacity: 0.7 }).addTo(camadaAlamedasGroup);
  });
}

document.getElementById('btn-clear-paths').onclick = () => {
  if (confirm("Deseja apagar todas as alamedas salvas do condomínio?")) {
    alamedasSalvas = [];
    localStorage.removeItem('alamedas_condominio');
    renderizarAlamedas();
  }
};

// 6. Medição
const btnMeasure = document.getElementById('btn-measure');
const measureBanner = document.getElementById('measure-banner');
const measureInstruction = document.getElementById('measure-instruction');

btnMeasure.onclick = () => {
  resetarOutrosModos();
  modoMedicao = true;
  limparMedicao();
  measureBanner.classList.remove('hidden');
  measureInstruction.innerHTML = 'Clique no mapa para o <b>Ponto A (Origem)</b>';
};

document.getElementById('btn-cancel-measure').onclick = resetarModoMedicao;

function resetarModoMedicao() {
  modoMedicao = false;
  measureBanner.classList.add('hidden');
  limparMedicao();
}

function limparMedicao() {
  pontoA = null;
  pontoB = null;
  if (marcadorA) map.removeLayer(marcadorA);
  if (marcadorB) map.removeLayer(marcadorB);
  if (linhaMedicao) map.removeLayer(linhaMedicao);
}

// 7. Modo Texto
const btnAddText = document.getElementById('btn-add-text-mode');
const textModeBanner = document.getElementById('text-mode-banner');

btnAddText.onclick = () => {
  resetarOutrosModos();
  modoTexto = true;
  textModeBanner.classList.remove('hidden');
};

document.getElementById('btn-cancel-text-mode').onclick = resetarModoTexto;

function resetarModoTexto() {
  modoTexto = false;
  textModeBanner.classList.add('hidden');
}

function resetarOutrosModos() {
  resetarModoMedicao();
  resetarModoTexto();
  resetarModoDesenhoAlameda();
}

// 8. Evento de Clique no Mapa
map.on('click', (e) => {
  if (modoDesenhoAlameda) {
    pontosAlamedaAtual.push([e.latlng.lat, e.latlng.lng]);
    if (linhaAlamedaRascunho) map.removeLayer(linhaAlamedaRascunho);
    linhaAlamedaRascunho = L.polyline(pontosAlamedaAtual, { color: '#0284c7', weight: 4, dashArray: '6,6' }).addTo(map);
  } else if (modoMedicao) {
    tratarCliqueMedicao(e.latlng);
  } else if (modoTexto) {
    resetarModoTexto();
    abrirModal(e.latlng.lat, e.latlng.lng, '', 'texto');
  } else {
    abrirModal(e.latlng.lat, e.latlng.lng, '', 'ponto');
  }
});

function tratarCliqueMedicao(latlng) {
  if (!pontoA) {
    pontoA = latlng;
    marcadorA = L.marker(pontoA).addTo(map).bindPopup("<b>Ponto A</b>").openPopup();
    measureInstruction.innerHTML = 'Agora clique para o <b>Ponto B (Destino)</b>';
  } else if (!pontoB) {
    pontoB = latlng;
    marcadorB = L.marker(pontoB).addTo(map).bindPopup("<b>Ponto B</b>").openPopup();

    const distM = calcularDistancia(pontoA.lat, pontoA.lng, pontoB.lat, pontoB.lng);
    const distText = distM >= 1000 ? `${(distM / 1000).toFixed(2)} km` : `${distM} metros`;

    linhaMedicao = L.polyline([pontoA, pontoB], { color: '#f59e0b', weight: 5 }).addTo(map);

    document.getElementById('route-info').classList.remove('hidden');
    document.getElementById('route-badge').innerText = 'Medição A ➔ B';
    document.getElementById('route-title').innerText = 'Medição de Distância';
    document.getElementById('route-distance').innerText = `Distância: ${distText}`;

    map.fitBounds(linhaMedicao.getBounds(), { padding: [40, 40] });
    resetarModoMedicao();
  }
}

// 9. Cálculo de Rota Offline via Alamedas (Dijkstra Interno)
async function tracarRota(destLat, destLng, nome) {
  if (!posicaoGPS) {
    alert("Aguardando sinal de GPS...");
    return;
  }

  limparRotasELinhas();

  // 1. Tenta calcular rota online via OSRM se houver internet
  if (navigator.onLine) {
    mostrarToast("Calculando rota pelas vias públicas...");
    try {
      const originStr = `${posicaoGPS[1]},${posicaoGPS[0]}`;
      const destStr = `${destLng},${destLat}`;
      const url = `https://router.project-osrm.org/route/v1/foot/${originStr};${destStr}?overview=full&geometries=geojson`;

      const response = await fetch(url);
      const data = await response.json();

      if (data.routes && data.routes.length > 0) {
        const routeCoords = data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]);
        exibirLinhaRota(routeCoords, Math.round(data.routes[0].distance), `Destino: ${nome}`, 'Rota Online');
        ocultarToast();
        return;
      }
    } catch (e) {}
  }

  // 2. Se estiver offline, calcula rota pelas alamedas desenhadas
  if (alamedasSalvas.length > 0) {
    const rotaAlameda = calcularRotaPorAlamedas(posicaoGPS, [destLat, destLng]);
    if (rotaAlameda) {
      exibirLinhaRota(rotaAlameda.caminho, rotaAlameda.distancia, `Destino: ${nome}`, 'Rota Alameda Offline');
      ocultarToast();
      return;
    }
  }

  // 3. Fallback: Linha Direta
  const distDirect = calcularDistancia(posicaoGPS[0], posicaoGPS[1], destLat, destLng);
  exibirLinhaRota([posicaoGPS, [destLat, destLng]], distDirect, `Destino: ${nome}`, 'Rota Offline (Linha Direta)', true);
  ocultarToast();
}

function exibirLinhaRota(coords, distanciaM, titulo, tipo, tracejada = false) {
  linhaRota = L.polyline(coords, {
    color: '#0066ff',
    weight: 5,
    dashArray: tracejada ? '6,6' : null
  }).addTo(map);

  const distText = distanciaM >= 1000 ? `${(distanciaM / 1000).toFixed(2)} km` : `${distanciaM} metros`;

  document.getElementById('route-info').classList.remove('hidden');
  document.getElementById('route-badge').innerText = tipo;
  document.getElementById('route-title').innerText = titulo;
  document.getElementById('route-distance').innerText = `Distância: ${distText}`;

  map.fitBounds(linhaRota.getBounds(), { padding: [40, 40] });
  fecharPainel();
}

// Algoritmo Dijkstra para Grafo de Alamedas Locais
function calcularRotaPorAlamedas(origem, destino) {
  let nos = [];
  alamedasSalvas.forEach(a => a.forEach(pt => nos.push(pt)));

  if (nos.length === 0) return null;

  // Encontra nó mais próximo da origem e do destino
  let noOrigem = encontrarNoMaisProximo(origem, nos);
  let noDestino = encontrarNoMaisProximo(destino, nos);

  // Constrói mapa de adjacências
  let grafo = {};
  nos.forEach((_, i) => grafo[i] = []);

  alamedasSalvas.forEach(alameda => {
    for (let i = 0; i < alameda.length - 1; i++) {
      let idxA = nos.findIndex(n => n[0] === alameda[i][0] && n[1] === alameda[i][1]);
      let idxB = nos.findIndex(n => n[0] === alameda[i+1][0] && n[1] === alameda[i+1][1]);
      let dist = calcularDistancia(alameda[i][0], alameda[i][1], alameda[i+1][0], alameda[i+1][1]);
      grafo[idxA].push({ no: idxB, dist });
      grafo[idxB].push({ no: idxA, dist });
    }
  });

  let startIdx = nos.findIndex(n => n[0] === noOrigem[0] && n[1] === noOrigem[1]);
  let endIdx = nos.findIndex(n => n[0] === noDestino[0] && n[1] === noDestino[1]);

  let dists = {}, prev = {}, queue = new Set();
  nos.forEach((_, i) => { dists[i] = Infinity; queue.add(i); });
  dists[startIdx] = 0;

  while (queue.size > 0) {
    let u = Array.from(queue).reduce((min, i) => dists[i] < dists[min] ? i : min, Array.from(queue)[0]);
    queue.delete(u);

    if (u === endIdx) break;

    grafo[u].forEach(vizinho => {
      let alt = dists[u] + vizinho.dist;
      if (alt < dists[vizinho.no]) {
        dists[vizinho.no] = alt;
        prev[vizinho.no] = u;
      }
    });
  }

  let curr = endIdx;
  let caminho = [];
  while (curr !== undefined) {
    caminho.unshift(nos[curr]);
    curr = prev[curr];
  }

  if (caminho.length < 2) return null;

  caminho.unshift(origem);
  caminho.push(destino);

  return { caminho, distancia: Math.round(dists[endIdx]) };
}

function encontrarNoMaisProximo(ponto, nos) {
  let minD = Infinity;
  let closest = nos[0];
  nos.forEach(n => {
    let d = calcularDistancia(ponto[0], ponto[1], n[0], n[1]);
    if (d < minD) { minD = d; closest = n; }
  });
  return closest;
}

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

function limparRotasELinhas() {
  if (linhaRota) { map.removeLayer(linhaRota); linhaRota = null; }
  limparMedicao();
  document.getElementById('route-info').classList.add('hidden');
}

document.getElementById('btn-limpar-rota').onclick = limparRotasELinhas;

// 10. Busca
const searchInput = document.getElementById('search-input');
const searchResults = document.getElementById('search-results');

searchInput.addEventListener('input', async () => {
  const query = searchInput.value.trim().toLowerCase();
  if (!query) return searchResults.classList.add('hidden');

  searchResults.innerHTML = '';
  const locaisLocais = pontosSalvos.filter(p => p.bloco.toLowerCase().includes(query) || (p.apt && p.apt.toLowerCase().includes(query)));
  
  locaisLocais.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `${p.tipo === 'texto' ? '✏️' : '📌'} <b>${p.bloco}</b> ${p.apt ? `- Apt ${p.apt}` : ''} <span style="font-size:10px; color:#10b981;">(Salvo)</span>`;
    li.onclick = () => {
      map.setView([p.lat, p.lng], 18);
      searchResults.classList.add('hidden');
    };
    searchResults.appendChild(li);
  });

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
    if (btn) btn.onclick = () => abrirModal(lat, lon, item.display_name.split(',')[0], 'ponto');
  }, 100);
}

// 11. Renderização de Marcadores e Rótulos Separados por Camada
function renderizarMarcadores() {
  camadaPontosGroup.clearLayers();
  camadaTextosGroup.clearLayers();

  pontosSalvos.forEach(ponto => {
    let layer;

    if (ponto.tipo === 'texto') {
      layer = L.marker([ponto.lat, ponto.lng], {
        icon: L.divIcon({
          className: 'custom-map-label',
          html: `<div class="map-text-badge">✏️ ${ponto.bloco}</div>`,
          iconAnchor: [30, 15]
        })
      }).addTo(camadaTextosGroup);

      layer.bindPopup(`
        <b style="font-size:14px; color:#8b5cf6;">Rótulo: ${ponto.bloco}</b><br>
        <button onclick="excluirPonto(${ponto.id})" style="width:100%; margin-top:6px; background:#ef4444; color:white; border:none; padding:6px; border-radius:6px; font-weight:bold; cursor:pointer;">🗑️ Excluir Texto</button>
      `);
    } else {
      layer = L.marker([ponto.lat, ponto.lng]).addTo(camadaPontosGroup);
      layer.bindPopup(`
        <b style="font-size:14px; color:#0066ff;">${ponto.bloco}</b><br>
        ${ponto.apt ? `Apt: ${ponto.apt}<br>` : ''}
        ${ponto.desc ? `<p style="font-size:11px; color:#666; margin:4px 0;">${ponto.desc}</p>` : ''}
        <button onclick="tracarRota(${ponto.lat}, ${ponto.lng}, '${ponto.bloco}')" style="width:100%; margin-top:6px; background:#0066ff; color:white; border:none; padding:6px; border-radius:6px; font-weight:bold; cursor:pointer;">🗺️ Traçar Rota</button>
        <button onclick="excluirPonto(${ponto.id})" style="width:100%; margin-top:4px; background:#ef4444; color:white; border:none; padding:6px; border-radius:6px; font-weight:bold; cursor:pointer;">🗑️ Excluir Ponto</button>
      `);
    }

    layer.on('click', (e) => L.DomEvent.stopPropagation(e));
  });

  document.getElementById('ponto-count').innerText = pontosSalvos.length;
}

function excluirPonto(id) {
  pontosSalvos = pontosSalvos.filter(p => p.id !== id);
  localStorage.setItem('blocos_mapeados', JSON.stringify(pontosSalvos));
  renderizarMarcadores();
  atualizarInterface();
}

function atualizarInterface() {
  const listaEl = document.getElementById('lista-pontos');
  listaEl.innerHTML = '';

  let listaComDist = pontosSalvos.map(p => ({
    ...p,
    dist: posicaoGPS ? calcularDistancia(posicaoGPS[0], posicaoGPS[1], p.lat, p.lng) : null
  }));

  if (posicaoGPS) listaComDist.sort((a, b) => (a.dist ?? 999999) - (b.dist ?? 999999));

  listaComDist.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="ponto-title">${p.tipo === 'texto' ? '✏️ [Texto]' : '📌'} ${p.bloco} ${p.apt ? `- Apt ${p.apt}` : ''}</div>
      <div class="ponto-dist">${p.dist !== null ? `📍 A ${p.dist}m de você` : 'Sem GPS'}</div>
      ${p.desc ? `<div class="ponto-desc">${p.desc}</div>` : ''}
      <div class="item-actions">
        ${p.tipo !== 'texto' ? `<button class="btn btn-primary" style="padding:6px; font-size:12px;" onclick="tracarRota(${p.lat}, ${p.lng}, '${p.bloco}')">Ir Até</button>` : ''}
        <button class="btn" style="background:#e2e8f0; padding:6px; font-size:12px;" onclick="focarPonto(${p.lat}, ${p.lng})">Ver</button>
        <button class="btn btn-danger" style="padding:6px; font-size:12px;" onclick="excluirPonto(${p.id})">Excluir</button>
      </div>
    `;
    listaEl.appendChild(li);
  });
}

function focarPonto(lat, lng) {
  map.setView([lat, lng], 18);
  fecharPainel();
}

// 12. Modal
const modal = document.getElementById('modal-container');

function abrirModal(lat, lng, nomeSugestao = '', tipo = 'ponto') {
  coordsTemp = { lat, lng };
  tipoCadastro = tipo;

  const groupApt = document.getElementById('group-apt');
  const groupDesc = document.getElementById('group-desc');
  const labelBloco = document.getElementById('label-bloco');

  if (tipo === 'texto') {
    document.getElementById('modal-title').innerText = "Escrever Texto no Mapa";
    labelBloco.innerText = "Texto / Nome do Bloco *";
    document.getElementById('input-bloco').placeholder = "Ex: Bloco A, Quadra 04, Salão de Festas";
    groupApt.classList.add('hidden');
    groupDesc.classList.add('hidden');
  } else {
    document.getElementById('modal-title').innerText = "Cadastrar Ponto";
    labelBloco.innerText = "Identificação / Bloco *";
    document.getElementById('input-bloco').placeholder = "Ex: Bloco B ou Entrada Principal";
    groupApt.classList.remove('hidden');
    groupDesc.classList.remove('hidden');
  }

  document.getElementById('input-bloco').value = nomeSugestao;
  document.getElementById('input-apt').value = '';
  document.getElementById('input-desc').value = '';
  modal.classList.remove('hidden');
}

document.getElementById('btn-salvar').onclick = () => {
  const bloco = document.getElementById('input-bloco').value.trim();
  if (!bloco) return alert("Informe a identificação!");

  pontosSalvos.push({
    id: Date.now(),
    lat: coordsTemp.lat,
    lng: coordsTemp.lng,
    tipo: tipoCadastro,
    bloco,
    apt: tipoCadastro === 'ponto' ? document.getElementById('input-apt').value.trim() : '',
    desc: tipoCadastro === 'ponto' ? document.getElementById('input-desc').value.trim() : ''
  });

  localStorage.setItem('blocos_mapeados', JSON.stringify(pontosSalvos));
  modal.classList.add('hidden');
  if (marcadorBusca) map.removeLayer(marcadorBusca);

  renderizarMarcadores();
  atualizarInterface();
};

document.getElementById('btn-close-modal').onclick = () => modal.classList.add('hidden');

// Drawer Lateral
const panel = document.getElementById('side-panel');
document.getElementById('btn-toggle-panel').onclick = () => panel.classList.remove('panel-hidden');
document.getElementById('btn-close-panel').onclick = fecharPainel;
function fecharPainel() { panel.classList.add('panel-hidden'); }

// Download Offline
document.getElementById('btn-download-area').onclick = async () => {
  const bounds = map.getBounds();
  const zoom = map.getZoom();

  mostrarToast("Iniciando download offline...");

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
      mostrarToast(`Baixando mapa: ${Math.round((baixados / urls.length) * 100)}%`);
    } catch (e) {}
  }

  mostrarToast("Área baixada com sucesso! ✅");
  setTimeout(ocultarToast, 3000);
};

function latLngToTile(lat, lng, zoom) {
  const latRad = (lat * Math.PI) / 180;
  const n = Math.pow(2, zoom);
  return {
    x: Math.floor(((lng + 180) / 360) * n),
    y: Math.floor(((1 - Math.log(Math.tan(latRad) + (1 / Math.cos(latRad))) / Math.PI) / 2) * n)
  };
}

function mostrarToast(msg) {
  const toast = document.getElementById('download-toast');
  document.getElementById('toast-status').innerText = msg;
  toast.classList.remove('hidden');
}

function ocultarToast() {
  document.getElementById('download-toast').classList.add('hidden');
}

// Inicialização
renderizarMarcadores();
renderizarAlamedas();
atualizarInterface();
