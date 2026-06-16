/* pacientes.js — Listado, edición y predicción */

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
  tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4">
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
    tbody.innerHTML = `<tr><td colspan="11" class="text-center py-4" style="color:var(--rose-500)">
      Error al cargar datos: ${e.message}</td></tr>`;
  }
}

function renderTabla(pacientes) {
  const tbody = document.getElementById('pacientes-tbody');
  if (!pacientes.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="text-center py-5" style="color:var(--text-secondary)">Sin pacientes encontrados</td></tr>';
    return;
  }
  const esAdmin = getRol() === 'administrador';
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
      <td>
        <div class="d-flex gap-1">
          ${esAdmin
            ? `<button class="btn btn-sm btn-outline-primary" onclick="editarPaciente(${p.id})" title="Editar">
                 <i class="bi bi-pencil"></i>
               </button>`
            : ''}
          <button class="btn btn-sm btn-outline-warning" onclick="predecirPaciente(${p.id_paciente})" title="Predecir riesgo">
            <i class="bi bi-cpu"></i>
          </button>
        </div>
      </td>
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

function abrirModalEditar(p) {
  document.getElementById('edit-paciente-id').value = p.id;
  document.getElementById('edit-id-paciente').value = p.id_paciente;
  document.getElementById('edit-nombres').value = p.nombres || '';
  document.getElementById('edit-apellidos').value = p.apellidos || '';
  document.getElementById('edit-edad').value = p.edad || '';
  document.getElementById('edit-sexo').value = p.sexo || 'M';
  document.getElementById('edit-peso').value = p.peso || '';
  document.getElementById('edit-altura').value = p.altura || '';
  document.getElementById('edit-glucosa').value = p.glucosa || '';
  document.getElementById('edit-colesterol').value = p.colesterol || '';
  document.getElementById('edit-sistolica').value = p.presion_sistolica || '';
  document.getElementById('edit-diastolica').value = p.presion_diastolica || '';
  document.getElementById('edit-frecuencia').value = p.frecuencia_cardiaca || '';
  document.getElementById('edit-saturacion').value = p.saturacion_oxigeno || '';
  document.getElementById('edit-temperatura').value = p.temperatura || '';
  document.getElementById('edit-diagnostico').value = p.diagnostico_preliminar || '';
  document.getElementById('edit-riesgo').value = p.riesgo_enfermedad || 'bajo';
  document.getElementById('msg-edit-paciente').textContent = '';
  new bootstrap.Modal(document.getElementById('modal-editar-paciente')).show();
}

async function editarPaciente(id) {
  try {
    const res = await authFetch(`/api/pacientes/${id}/`);
    if (!res || !res.ok) { alert('Error al obtener datos del paciente'); return; }
    const p = await res.json();
    abrirModalEditar(p);
  } catch(e) {
    alert('Error de conexión: ' + e.message);
  }
}

async function predecirPaciente(id) {
  const modal = new bootstrap.Modal(document.getElementById('modal-prediccion-paciente'));
  const div = document.getElementById('prediccion-paciente-resultado');
  div.innerHTML = '<div class="alert alert-info m-3"><div class="spinner-border spinner-border-sm me-2"></div>Prediciendo riesgo...</div>';
  modal.show();

  try {
    const res = await authFetch('/api/ml/predecir/', {
      method: 'POST',
      body: JSON.stringify({ paciente_id: parseInt(id) })
    });
    if (!res) { modal.hide(); return; }
    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      const BADGE = { bajo: 'risk-bajo', medio: 'risk-medio', alto: 'risk-alto', critico: 'risk-critico' };
      const BS    = { bajo: 'success', medio: 'warning', alto: 'warning', critico: 'danger' };
      const riesgoPredicho = data.riesgo_predicho || '—';
      const pct = (data.probabilidad * 100).toFixed(1);
      const bsColor = BS[riesgoPredicho] || 'secondary';
      const nombre = data.paciente_nombre || `Paciente #${data.paciente_id || id}`;

      const keyFactors = (data.factores_clave || []).map(f => `
        <div class="d-flex justify-content-between align-items-center py-1" style="border-bottom:1px solid var(--border)">
          <div>
            <div class="fw-semibold" style="font-size:.8rem">${f.factor}</div>
            <div style="font-size:.72rem;color:var(--text-secondary)">${f.descripcion || ''}</div>
          </div>
          <div class="d-flex align-items-center gap-2">
            <span class="fw-bold" style="font-size:.85rem">${f.valor ?? ''} ${f.unidad || ''}</span>
            <span class="risk-badge risk-${f.impacto}" style="font-size:9px;text-transform:uppercase">${f.impacto}</span>
          </div>
        </div>`).join('');

      const recommendations = (data.recomendaciones || []).map(r => `
        <li style="font-size:.78rem;color:var(--text-secondary);margin-bottom:4px">${r}</li>`).join('');

      const distHtml = Object.entries(data.distribucion_clases || {})
        .sort(([,a],[,b]) => b - a)
        .map(([k, v]) => `
          <div class="d-flex justify-content-between align-items-center mb-1">
            <span class="risk-badge ${BADGE[k] || ''}" style="font-size:10px">${k}</span>
            <span class="fw-semibold" style="font-size:12px;min-width:40px;text-align:right">${(v*100).toFixed(1)}%</span>
          </div>
          <div class="progress mb-2" style="height:5px;border-radius:999px">
            <div class="progress-bar bg-${BS[k] || 'secondary'}" style="width:${(v*100).toFixed(1)}%;border-radius:999px"></div>
          </div>`)
        .join('');

      div.innerHTML = `
        <div class="p-3">
          <div class="d-flex align-items-center gap-3 mb-3">
            <div style="background:var(--gray-50);border-radius:10px;padding:.6rem .9rem;flex:1">
              <div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:4px">Paciente</div>
              <div class="fw-bold" style="font-size:1rem">${nombre}</div>
            </div>
            <div style="background:var(--gray-50);border-radius:10px;padding:.6rem .9rem;flex:1">
              <div style="font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:4px">Riesgo predicho</div>
              <div class="d-flex align-items-center gap-2">
                <span class="risk-badge ${BADGE[riesgoPredicho] || 'bg-secondary'}" style="font-size:.8rem">${riesgoPredicho.toUpperCase()}</span>
                <span style="font-size:12px;color:var(--text-secondary)">${pct}%</span>
              </div>
              <div class="progress mt-2" style="height:5px;border-radius:999px">
                <div class="progress-bar bg-${bsColor}" style="width:${pct}%;border-radius:999px"></div>
              </div>
            </div>
          </div>

          ${data.nivel_detalle ? `<div class="alert alert-info py-2 px-3 mb-3" style="font-size:.8rem;border-radius:8px">${data.nivel_detalle}</div>` : ''}

          <div class="mb-3">
            <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:6px">Distribución de clases</div>
            ${distHtml}
          </div>

          ${keyFactors ? `
          <div class="mb-3">
            <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:6px">Factores clave</div>
            ${keyFactors}
          </div>` : ''}

          ${recommendations ? `
          <div>
            <div style="font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:6px">Recomendaciones</div>
            <ul style="padding-left:1.2rem;margin:0">${recommendations}</ul>
          </div>` : ''}
        </div>`;
    } else {
      div.innerHTML = `<div class="alert alert-danger m-3">${data.error || 'No se pudo predecir el riesgo'}</div>`;
    }
  } catch(e) {
    div.innerHTML = `<div class="alert alert-danger m-3">Error: ${e.message}</div>`;
  }
}

// Inicializar eventos del modal
document.addEventListener('DOMContentLoaded', () => {
  cargarPacientes(1);

  document.getElementById('form-editar-paciente')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg-edit-paciente');
    msg.textContent = 'Guardando...';
    msg.style.color = 'var(--text-secondary)';

    const id = document.getElementById('edit-paciente-id').value;
    const _ = id => parseFloat(document.getElementById(id).value.replace(',', '.')) || null;
    const payload = {
      nombres: document.getElementById('edit-nombres').value.trim(),
      apellidos: document.getElementById('edit-apellidos').value.trim(),
      edad: _('edit-edad'),
      sexo: document.getElementById('edit-sexo').value,
      peso: _('edit-peso'),
      altura: _('edit-altura'),
      glucosa: _('edit-glucosa'),
      colesterol: _('edit-colesterol'),
      presion_sistolica: _('edit-sistolica'),
      presion_diastolica: _('edit-diastolica'),
      frecuencia_cardiaca: _('edit-frecuencia'),
      saturacion_oxigeno: _('edit-saturacion'),
      temperatura: _('edit-temperatura'),
      diagnostico_preliminar: document.getElementById('edit-diagnostico').value.trim(),
      riesgo_enfermedad: document.getElementById('edit-riesgo').value,
    };

    const res = await authFetch(`/api/pacientes/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });

    if (res && res.ok) {
      bootstrap.Modal.getInstance(document.getElementById('modal-editar-paciente')).hide();
      cargarPacientes(paginaActual);
      const toast = document.createElement('div');
      toast.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;background:#fff;border-left:4px solid #14b8a6;border-radius:10px;padding:.75rem 1.1rem;box-shadow:0 6px 24px rgba(76,29,149,.15);font-size:.875rem;color:#1e1b29';
      toast.textContent = '✓ Paciente actualizado correctamente';
      document.body.appendChild(toast);
      setTimeout(() => toast.remove(), 4000);
    } else {
      const err = res ? await res.json() : { detail: 'Error de conexión' };
      msg.textContent = Object.values(err).flat().join(', ');
      msg.style.color = '#f43f5e';
    }
  });
});
