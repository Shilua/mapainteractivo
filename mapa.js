const map = L.map('map', { zoomControl: false }).setView([-34.69, -58.38], 13);
L.control.zoom({ position: 'topright' }).addTo(map);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

// ── Extraer zona y partido del registro ───────────────────────────────────
function extractZona(zonaStr) {
  const m = zonaStr.match(/^(Zona \d+)/i);
  return m ? m[1] : zonaStr.split('·')[0].trim();
}

function extractPartido(area) {
  const m = area.match(/partido de (.+)$/i);
  return m ? m[1].trim() : area.trim();
}

// ── Construir índice: { "Zona 1": { "CAPITAL FEDERAL": centros[] } } ──────
const indice = {};
DB_DATA.centros.forEach(centro => {
  if (!centro.lugares || centro.lugares.length === 0) return;
  const zona    = extractZona(centro.zona);
  const partido = extractPartido(centro.area);
  if (!indice[zona]) indice[zona] = {};
  if (!indice[zona][partido]) indice[zona][partido] = [];
  indice[zona][partido].push(centro);
});

// ── Poblar selects ────────────────────────────────────────────────────────
const selectZona    = document.getElementById('select-zona');
const selectPartido = document.getElementById('select-partido');
const subtitulo     = document.getElementById('subtitulo');
const panelConteo   = document.getElementById('panel-conteo');

// Poblar zonas
Object.keys(indice).sort().forEach(zona => {
  const opt = document.createElement('option');
  opt.value = zona;
  opt.textContent = zona;
  selectZona.appendChild(opt);
});

// Poblar partidos (filtrado por zona o todos)
function poblarPartidos(zonaFiltro) {
  selectPartido.innerHTML = '';
  const zonas = zonaFiltro ? [zonaFiltro] : Object.keys(indice).sort();
  zonas.forEach(zona => {
    const group = document.createElement('optgroup');
    group.label = zona;
    Object.keys(indice[zona]).sort().forEach(partido => {
      const opt = document.createElement('option');
      opt.value = zona + '||' + partido;
      opt.textContent = partido;
      group.appendChild(opt);
    });
    selectPartido.appendChild(group);
  });
}

poblarPartidos(''); // inicio: todos los partidos

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
  const lbl = `<div style="background:rgba(20,20,20,0.75);color:#fff;font-size:10px;font-family:sans-serif;font-weight:600;white-space:normal;max-width:110px;padding:2px 5px;border-radius:3px;letter-spacing:0.02em;border-left:3px solid ${COLOR};line-height:1.3;">${short}</div>`;

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

// ── Calcular lado del label según vecino más cercano ─────────────────────
function calcularSide(lat, lng, todos) {
  let nearestDlng = 0, nearestDlat = 0, nearestDist = Infinity;
  todos.forEach(([plat, plng]) => {
    const dlat = plat - lat;
    const dlng = plng - lng;
    const dist = Math.sqrt(dlat * dlat + dlng * dlng);
    if (dist < 0.0001 || dist >= nearestDist) return;
    nearestDist = dist;
    nearestDlat = dlat;
    nearestDlng = dlng;
  });
  if (nearestDist === Infinity) return 'right';
  if (Math.abs(nearestDlng) >= Math.abs(nearestDlat)) {
    return nearestDlng > 0 ? 'left' : 'right';
  } else {
    return nearestDlat > 0 ? 'bottom' : 'top';
  }
}

// ── Mostrar selección múltiple ────────────────────────────────────────────
function mostrar(valores) {
  markersLayer.clearLayers();
  if (!valores || valores.length === 0) {
    subtitulo.textContent = 'Argentina · 1976–1983';
    panelConteo.textContent = '—';
    return;
  }

  // Primer paso: recolectar todos los puntos
  const items = [];
  const labels = [];
  valores.forEach(valor => {
    const [zona, partido] = valor.split('||');
    const centros = indice[zona]?.[partido];
    if (!centros) return;
    labels.push(partido);
    centros.forEach(centro => {
      centro.lugares.forEach(lugar => {
        if (!lugar.lat || !lugar.lng) return;
        items.push({ lat: lugar.lat, lng: lugar.lng, name: lugar.name });
      });
    });
  });

  const coords = items.map(i => [i.lat, i.lng]);

  // Segundo paso: crear marcadores con lado calculado
  items.forEach(item => {
    const side = calcularSide(item.lat, item.lng, coords);
    markersLayer.addLayer(L.marker([item.lat, item.lng], {
      icon: makeIcon(item.name, side)
    }));
  });

  if (coords.length === 1) {
    map.setView(coords[0], 15);
  } else if (coords.length > 1) {
    map.fitBounds(L.latLngBounds(coords), { padding: [60, 60] });
  }

  const total = coords.length;
  subtitulo.textContent = labels.length === 1 ? labels[0] : `${labels.length} partidos`;
  panelConteo.textContent = `${total} sitio${total !== 1 ? 's' : ''}`;
}

function getSeleccion() {
  return Array.from(selectPartido.selectedOptions).map(o => o.value).filter(v => v);
}

// ── Handlers ──────────────────────────────────────────────────────────────
selectZona.addEventListener('change', () => {
  poblarPartidos(selectZona.value);
  // Seleccionar todos los partidos de la zona elegida y mostrarlos
  if (selectZona.value) {
    Array.from(selectPartido.options).forEach(o => o.selected = true);
    mostrar(getSeleccion());
  } else {
    mostrar([]);
  }
});

selectPartido.addEventListener('change', () => mostrar(getSeleccion()));

// ── Panel toggle ──────────────────────────────────────────────────────────
document.getElementById('panel-close').addEventListener('click', () => {
  document.getElementById('panel').classList.add('oculto');
  document.getElementById('panel-toggle').classList.add('visible');
});
document.getElementById('panel-toggle').addEventListener('click', () => {
  document.getElementById('panel').classList.remove('oculto');
  document.getElementById('panel-toggle').classList.remove('visible');
});
