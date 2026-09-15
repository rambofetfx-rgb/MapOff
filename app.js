// 1. Cria e centraliza o mapa
const map = L.map('map').setView([-27.5954, -48.5480], 15);

// 2. Adiciona os blocos do mapa com OpenStreetMap nativo
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap'
}).addTo(map);

// Força o Leaflet a renderizar as imagens na tela inteira do celular
setTimeout(() => {
  map.invalidateSize();
}, 300);

// 3. Recupera pontos já salvos na memória do celular
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
      <div style="font-family: sans-serif; min-width: 120px;">
        <h3 style="margin: 0 0 4px 0; color: #007bff;">Bloco ${bloco}</h3>
        <b>Apt/Unidade:</b> ${apt || 'N/A'}<br>
        <p style="margin-top: 6px; font-size: 13px;">${desc || ''}</p>
      </div>
    `);
}

// 4. Mapeia um novo Bloco/Apt ao clicar
map.on('click', function(e) {
  const { lat, lng } = e.latlng;

  const bloco = prompt("Digite a letra ou número do Bloco (ex: Bloco A):");
  if (!bloco) return;

  const apt = prompt("Digite o número do Apartamento:");
  const desc = prompt("Descrição/Observação adicional:");

  const novoPonto = { lat, lng, bloco, apt, desc };

  adicionarMarcadorNoMapa(lat, lng, bloco, apt, desc);
  marcadoresSalvos.push(novoPonto);
  localStorage.setItem('blocos_mapeados', JSON.stringify(marcadoresSalvos));
});

// 5. Tenta pegar GPS do celular
if ('geolocation' in navigator) {
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const { latitude, longitude } = pos.coords;
      map.setView([latitude, longitude], 17);
    },
    (err) => console.log("GPS desligado:", err.message),
    { enableHighAccuracy: true }
  );
}

carregarPontosSalvos();
