const map = L.map('map', { zoomControl: false }).setView([-34.69, -58.38], 13);
L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// ── Extraer provincia y partido del registro ──────────────────────────────
function extractProvincia(zona) {
  const m = zona.match(/provincia de (.+)$/i);
  if (m) return m[1].trim();
  const m2 = zona.match(/·\s*(.+)$/);
  return m2 ? m2[1].trim() : zona.trim();
}

function extractPartido(area) {
  const m = area.match(/partido de (.+)$/i);
  return m ? m[1].trim() : area.trim();
}

// ── Construir índice: { "BUENOS AIRES": [ {partido, centros[]}, ... ] } ──
const indice = {};
DB_DATA.centros.forEach(centro => {
  if (!centro.lugares || centro.lugares.length === 0) return;
  const provincia = extractProvincia(centro.zona);
  const partido   = extractPartido(centro.area);
  if (!indice[provincia]) indice[provincia] = {};
  if (!indice[provincia][partido]) indice[provincia][partido] = [];
  indice[provincia][partido].push(centro);
});

// ── Poblar el <select> ────────────────────────────────────────────────────
const select = document.getElementById('select-partido');
const subtitulo = document.getElementById('subtitulo');

Object.keys(indice).sort().forEach(prov => {
  const group = document.createElement('optgroup');
  group.label = prov;
  Object.keys(indice[prov]).sort().forEach(partido => {
    const opt = document.createElement('option');
    opt.value = prov + '||' + partido;
    opt.textContent = partido;
    group.appendChild(opt);
  });
  select.appendChild(group);
});

// ── Marcadores ───────────────────────────────────────────────────────────
let markersLayer = L.layerGroup().addTo(map);
const COLOR = '#b22222';

function abreviar(name) {
  return name
    .replace(/COMISARIA\s+/i, 'COM. ')
    .replace(/COMISARIA/i, 'COM.')
    .replace(/BRIGADA DE INVESTIGACIONES DE ([A-ZÁÉÍÓÚ ]+)\s*\/?\s*/i, 'BRIGADA $1 ')
    .replace(/DELEGACION ["""]?([A-ZÁÉÍÓÚ]+)["""]? DE LA POLICIA FEDERAL/i, 'DEL. POLICÍA FEDERAL')
    .replace(/UNIDAD REGIONAL\s+/i, 'U.R. ')
    .replace(/CAMPO DE DETENCIÓN/i, 'CAMPO')
    .trim();
}

function makeIcon(label, side = 'right') {
  const short = abreviar(label);
  const dot = `<div style="width:12px;height:12px;background:${COLOR};border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.6);flex-shrink:0;"></div>`;
  const lbl = `<div style="background:rgba(20,20,20,0.75);color:#fff;font-size:10px;font-family:sans-serif;font-weight:600;white-space:nowrap;padding:2px 5px;border-radius:3px;letter-spacing:0.02em;border-left:3px solid ${COLOR};">${short}</div>`;

  const dirs = {
    right:  { flex: 'row',            align: 'center', gap: '4px' },
    left:   { flex: 'row-reverse',    align: 'center', gap: '4px' },
    bottom: { flex: 'column',         align: 'center', gap: '3px' },
    top:    { flex: 'column-reverse', align: 'center', gap: '3px' },
  };
  const d = dirs[side] || dirs.right;

  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:${d.flex};align-items:${d.align};gap:${d.gap};">${dot}${lbl}</div>`,
    iconSize:    [0, 0],
    iconAnchor:  [6, 6],
    popupAnchor: [0, -20]
  });
}

// ── Mostrar partido seleccionado ──────────────────────────────────────────
function mostrar(valor) {
  markersLayer.clearLayers();
  if (!valor) return;

  const [prov, partido] = valor.split('||');
  const centros = indice[prov]?.[partido];
  if (!centros) return;

  const puntos = [];
  centros.forEach(centro => {
    centro.lugares.forEach(lugar => {
      if (!lugar.lat || !lugar.lng) return;
      const marker = L.marker([lugar.lat, lugar.lng], {
        icon: makeIcon(lugar.name, lugar.side || 'right')
      });
      markersLayer.addLayer(marker);
      puntos.push([lugar.lat, lugar.lng]);
    });
  });

  // Ajustar vista
  if (puntos.length === 1) {
    map.setView(puntos[0], 15);
  } else if (puntos.length > 1) {
    map.fitBounds(L.latLngBounds(puntos), { padding: [60, 60] });
  }

  // Actualizar subtítulo y conteo
  const total = puntos.length;
  subtitulo.textContent = `${partido} · ${prov}`;
  document.getElementById('conteo').textContent = `${total} sitio${total !== 1 ? 's' : ''}`;
}

select.addEventListener('change', () => mostrar(select.value));

// Iniciar con el primero disponible
if (select.options.length > 0) {
  select.selectedIndex = 1;
  mostrar(select.value);
}

// ── Panel toggle ──────────────────────────────────────────────────────────
document.getElementById('panel-close').addEventListener('click', () => {
  document.getElementById('panel').classList.add('oculto');
  document.getElementById('panel-toggle').classList.add('visible');
});
document.getElementById('panel-toggle').addEventListener('click', () => {
  document.getElementById('panel').classList.remove('oculto');
  document.getElementById('panel-toggle').classList.remove('visible');
});
