// 1. Inicializa o mapa
const map = L.map('map').setView([-27.5954, -48.5480], 16);

// 2. Configura a camada offline do Leaflet
const tileLayer = L.tileLayer.offline('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: 'OpenStreetMap'
}).addTo(map);

// 3. Controle para salvar as imagens do mapa atual na memória
const control = L.control.savetiles(tileLayer, {
  zoomlevels: [14, 15, 16, 17, 18],
  confirm: function(layer, success) { success(); },
  confirmText: 'Deseja baixar os blocos desta região para uso offline?'
});

document.getElementById('btn-save').addEventListener('click', () => {
  control._saveTiles();
});

// 4. Carrega os pontos de blocos já salvos
let marcadoresSalvos = JSON.parse(localStorage.getItem('blocos_mapeados') || '[]');

function carregarPontosSalvos() {
  marcadoresSalvos.forEach(ponto => {
    adicionarMarcadorNoMapa(ponto.lat, ponto.lng, ponto.bloco, ponto.apt, ponto.desc);
  });
}

function adicionarMarcadorNoMapa(lat, lng, bloco, apt, desc) {
  L.marker([lat, lng])
    .addTo(map)
    .bindPopup(`
      <div style="font-family: sans-serif;">
        <h3 style="margin-bottom: 4px;">Bloco ${bloco}</h3>
        <b>Apt:</b> ${apt}<br>
        <p style="margin-top: 6px;">${desc}</p>
      </div>
    `);
}

// 5. Clique no mapa para cadastrar Bloco e Apartamento
map.on('click', function(e) {
  const { lat, lng } = e.latlng;

  const bloco = prompt("Digite a letra/nome do Bloco (ex: Bloco A):");
  if (!bloco) return;

  const apt = prompt("Digite o número do Apartamento/Unidade:");
  const desc = prompt("Descrição adicional:");

  const novoPonto = { lat, lng, bloco, apt, desc };

  // Salva no mapa e no armazenamento local do navegador
  adicionarMarcadorNoMapa(lat, lng, bloco, apt, desc);
  marcadoresSalvos.push(novoPonto);
  localStorage.setItem('blocos_mapeados', JSON.stringify(marcadoresSalvos));
});

// Carrega os dados ao abrir o app
carregarPontosSalvos();
