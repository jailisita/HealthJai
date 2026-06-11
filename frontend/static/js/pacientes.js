/* pacientes.js */

let paginaActual = 1;
let totalPaginas = 1;
let todosLosPacientes = [];

async function cargarPacientes(pagina = 1) {
  paginaActual = pagina;
  const riesgo  = document.getElementById('filtro-riesgo').value;
  const sexo    = document.getElementById('filtro-sexo').value;
  const critico = document.getElementById('filtro-critico').checked;

  let url = `/api/pacientes/?page=${pagina}`;
  if (riesgo)  url += `&riesgo=${riesgo}`;
  if (sexo)    url += `&sexo=${sexo}`;
  if (critico) url += `&critico=true`;

  const tbody = document.getElementById('pacientes-tbody');
  tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4">
    <div class="spinner-border spinner-border-sm me-2" style="color:var(--violet-400)"></div>Cargando...
  </td></tr>`;

  try {
    const res = await authFetch(url);
    if (!res) return;
    const data = await res.json();
    const resultados = data.results ?? data;
    const total = data.count ?? resultados.length;
    totalPaginas = data.next || data.previous ? Math.ceil(total / 50) : 1;
    todosLosPacientes = resultados;
    renderTabla(resultados);
    document.getElementById('badge-total').textContent = total;
    document.getElementById('pagination-info').textContent =
      `Mostrando ${resultados.length} de ${total} pacientes`;
    renderPaginacion();
  } catch(e) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4" style="color:var(--rose-500)">
      Error al cargar datos: ${e.message}</td></tr>`;
  }
}

function renderTabla(pacientes) {
  const tbody = document.getElementById('pacientes-tbody');
  if (!pacientes.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-5" style="color:var(--text-secondary)">Sin pacientes encontrados</td></tr>';
    return;
  }
  tbody.innerHTML = pacientes.map(p => `
    <tr class="${p.es_critico ? 'table-danger' : ''}">
      <td class="fw-semibold" style="color:var(--violet-600)">${p.id_paciente}</td>
      <td class="fw-medium">${p.nombres} ${p.apellidos}</td>
      <td>${p.edad ?? '—'}</td>
      <td>${p.sexo === 'M' ? '♂' : p.sexo === 'F' ? '♀' : '—'}</td>
      <td>${p.imc ? p.imc.toFixed(1) : '—'}
          ${p.clasificacion_imc ? `<br><small style="color:var(--text-secondary)">${p.clasificacion_imc.replace('_',' ')}</small>` : ''}</td>
      <td class="${p.glucosa > 126 ? 'fw-semibold' : ''}" style="${p.glucosa > 126 ? 'color:var(--rose-500)' : ''}">${p.glucosa ?? '—'}</td>
      <td class="${p.presion_sistolica > 140 ? 'fw-semibold' : ''}" style="${p.presion_sistolica > 140 ? 'color:var(--rose-500)' : ''}">${p.presion_sistolica ?? '—'}</td>
      <td style="font-size:0.82rem">${p.diagnostico_preliminar || '—'}</td>
      <td><span class="risk-badge risk-${p.riesgo_enfermedad || 'bajo'}">${p.riesgo_enfermedad || '—'}</span></td>
      <td>${p.es_critico
        ? '<i class="bi bi-exclamation-triangle-fill" style="color:var(--rose-500)" title="Crítico"></i>'
        : '<i class="bi bi-check-circle-fill" style="color:var(--teal-500)"></i>'}</td>
    </tr>
  `).join('');
}

function filtrarLocal() {
  const q = document.getElementById('busqueda').value.toLowerCase();
  if (!q) { renderTabla(todosLosPacientes); return; }
  renderTabla(todosLosPacientes.filter(p =>
    `${p.nombres} ${p.apellidos}`.toLowerCase().includes(q) ||
    (p.diagnostico_preliminar || '').toLowerCase().includes(q) ||
    String(p.id_paciente).includes(q)
  ));
}

function renderPaginacion() {
  const ctrl = document.getElementById('pagination-controls');
  if (totalPaginas <= 1) { ctrl.innerHTML = ''; return; }
  let html = `<button class="btn btn-sm btn-outline-secondary" onclick="cargarPacientes(${paginaActual-1})"
    ${paginaActual === 1 ? 'disabled' : ''}><i class="bi bi-chevron-left"></i></button>`;
  for (let i = Math.max(1, paginaActual-2); i <= Math.min(totalPaginas, paginaActual+2); i++) {
    html += `<button class="btn btn-sm ${i===paginaActual?'btn-primary':'btn-outline-secondary'}"
      onclick="cargarPacientes(${i})">${i}</button>`;
  }
  html += `<button class="btn btn-sm btn-outline-secondary" onclick="cargarPacientes(${paginaActual+1})"
    ${paginaActual === totalPaginas ? 'disabled' : ''}><i class="bi bi-chevron-right"></i></button>`;
  ctrl.innerHTML = html;
}

function descargarConFiltros(baseUrl, filename) {
  const riesgo  = document.getElementById('filtro-riesgo')?.value || '';
  const sexo    = document.getElementById('filtro-sexo')?.value || '';
  const critico = document.getElementById('filtro-critico')?.checked ? 'true' : '';
  const params  = new URLSearchParams();
  if (riesgo)  params.set('riesgo', riesgo);
  if (sexo)    params.set('sexo', sexo);
  if (critico) params.set('critico', 'true');
  const url = params.toString() ? `${baseUrl}?${params}` : baseUrl;
  descargarArchivo(url, filename);
}

document.addEventListener('DOMContentLoaded', () => cargarPacientes(1));
