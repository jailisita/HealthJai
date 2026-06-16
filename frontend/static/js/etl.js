/* etl.js — Ejecución ETL, subida de archivo, historial */

async function ejecutarETL() {
  const btn = document.getElementById('btn-run-etl');
  const progress = document.getElementById('etl-progress');
  const resultado = document.getElementById('etl-resultado');

  btn.disabled = true;
  progress.classList.remove('d-none');
  resultado.classList.add('d-none');

  try {
    const res = await authFetch('/api/etl/run/', { method: 'POST' });
    if (!res) return;
    const data = await res.json();

    if (res.ok) {
      mostrarResultado(data);
      cargarHistorial();
    } else {
      alert('Error: ' + (data.error || 'No se pudo ejecutar el ETL'));
    }
  } catch(e) {
    alert('Error de conexión: ' + e.message);
  } finally {
    btn.disabled = false;
    progress.classList.add('d-none');
  }
}

async function subirDataset() {
  const input    = document.getElementById('archivo-dataset');
  const btnSub   = document.querySelector('button[onclick="subirDataset()"]');
  const progress = document.getElementById('etl-progress');

  if (!input.files.length) { showToast('Selecciona un archivo CSV o Excel primero.', 'warning'); return; }
  const ext = input.files[0].name.split('.').pop().toLowerCase();
  if (!['csv','xlsx','xls'].includes(ext)) { showToast('Formato no soportado. Usa .csv, .xlsx o .xls', 'danger'); return; }

  const formData = new FormData();
  formData.append('archivo', input.files[0]);

  btnSub.disabled = true;
  btnSub.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Subiendo...';
  progress.classList.remove('d-none');
  document.getElementById('etl-resultado').classList.add('d-none');

  try {
    const res = await authFetch('/api/etl/upload/', { method: 'POST', body: formData });
    if (!res) return;

    if (res.status === 202) {
      showToast('Archivo subido. Procesando ETL en segundo plano...', 'info');
      input.value = '';
      let esperando = true;
      while (esperando) {
        await new Promise(r => setTimeout(r, 2000));
        const histRes = await authFetch('/api/etl/historial/');
        if (!histRes) continue;
        const histData = await histRes.json();
        if (histData.length && histData[0].estado !== 'pendiente' && histData[0].estado !== 'en_proceso') {
          esperando = false;
          cargarHistorial();
          const ultimo = histData[0];
          if (ultimo.estado === 'completado') {
            showToast(`ETL completado: ${ultimo.registros_limpios ?? 0} registros procesados.`, 'success');
          } else {
            showToast('Error en el procesamiento ETL', 'danger');
          }
        }
      }
      return;
    }

    const ct   = res.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await res.json().catch(() => ({})) : { error: await res.text() };

    if (res.ok) {
      mostrarResultado(data);
      cargarHistorial();
      input.value = '';
      showToast(`ETL completado: ${data.registros_limpios ?? 0} registros procesados.`, 'success');
    } else {
      const msg = data.detalle || data.error || JSON.stringify(data);
      showToast('Error: ' + msg, 'danger');
      if (data.log_detalle) {
        document.getElementById('etl-resultado').classList.remove('d-none');
        document.getElementById('etl-log').textContent = data.log_detalle;
      }
    }
  } catch(e) {
    showToast('Error de conexión: ' + e.message, 'danger');
  } finally {
    progress.classList.add('d-none');
    btnSub.disabled = false;
    btnSub.innerHTML = '<i class="bi bi-upload me-2"></i>Subir y Procesar';
  }
}

function showToast(msg, type='info') {
  const prev = document.getElementById('etl-toast');
  if (prev) prev.remove();
  const C = { success:'#14b8a6', danger:'#f43f5e', warning:'#fbbf24', info:'#7c3aed' };
  const t = document.createElement('div');
  t.id = 'etl-toast';
  t.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;background:#fff;
    border-left:4px solid ${C[type]||C.info};border-radius:10px;padding:.75rem 1.1rem;
    box-shadow:0 6px 24px rgba(76,29,149,.15);font-size:.875rem;color:#1e1b29;max-width:360px`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 5000);
}

function mostrarResultado(data) {
  const sec = document.getElementById('etl-resultado');
  sec.classList.remove('d-none');

  const estadoBadge = data.estado === 'completado'
    ? '<span class="badge bg-success fs-6">✓ Completado</span>'
    : '<span class="badge bg-danger fs-6">✗ Error</span>';

  document.getElementById('etl-metricas').innerHTML = `
    <div class="col-6 col-md-3">
      <div class="border rounded p-3 text-center">
        <div class="text-muted small">Registros Entrada</div>
        <div class="fw-bold fs-4 text-primary">${data.registros_entrada ?? 0}</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="border rounded p-3 text-center">
        <div class="text-muted small">Registros Limpios</div>
        <div class="fw-bold fs-4 text-success">${data.registros_limpios ?? 0}</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="border rounded p-3 text-center">
        <div class="text-muted small">Duplicados</div>
        <div class="fw-bold fs-4 text-warning">${data.duplicados_eliminados ?? 0}</div>
      </div>
    </div>
    <div class="col-6 col-md-3">
      <div class="border rounded p-3 text-center">
        <div class="text-muted small">Tiempo (seg)</div>
        <div class="fw-bold fs-4 text-info">${data.tiempo_ejecucion_seg ?? 0}s</div>
      </div>
    </div>
    <div class="col-12 mt-2 text-center">${estadoBadge}</div>
  `;

  document.getElementById('etl-log').textContent = data.log_detalle || 'Sin log disponible';
}

async function cargarHistorial() {
  try {
    const res = await authFetch('/api/etl/historial/');
    if (!res) return;
    const data = await res.json();

    const tbody = document.getElementById('historial-tbody');
    if (!data.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4">Sin registros ETL</td></tr>';
      return;
    }

    tbody.innerHTML = data.map(r => `
      <tr>
        <td class="small">${formatFecha(r.fecha_ejecucion)}</td>
        <td class="small">${r.usuario_nombre || '—'}</td>
        <td><span class="badge bg-secondary">${r.registros_entrada}</span></td>
        <td><span class="badge bg-success">${r.registros_limpios}</span></td>
        <td><span class="badge bg-warning text-dark">${r.duplicados_eliminados}</span></td>
        <td class="small">${r.tiempo_ejecucion_seg}s</td>
        <td><span class="badge ${badgeEstado(r.estado)}">${r.estado}</span></td>
      </tr>
    `).join('');
  } catch(e) {
    console.error('Error historial:', e);
  }
}

function formatFecha(f) {
  return f ? new Date(f).toLocaleString('es-CO', { dateStyle:'short', timeStyle:'short' }) : '—';
}
function badgeEstado(e) {
  return { completado:'bg-success', error:'bg-danger',
           en_proceso:'bg-warning text-dark', pendiente:'bg-secondary' }[e] || 'bg-secondary';
}

function getCsrfToken() {
  // Django: leer cookie csrftoken (estándar)
  const name = 'csrftoken';
  const cookies = document.cookie ? document.cookie.split(';') : [];
  for (const c of cookies) {
    const cookie = c.trim();
    if (cookie.startsWith(name + '=')) {
      return decodeURIComponent(cookie.substring(name.length + 1));
    }
  }
  return '';
}

document.addEventListener('DOMContentLoaded', cargarHistorial);

