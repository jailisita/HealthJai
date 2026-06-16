/* ml.js — Entrenamiento, métricas, predicción */

let confusionChart = null;
let metricasChart = null;

function getEl(id) {
  return document.getElementById(id);
}

function safeSetHTML(el, html) {
  if (!el) {
    console.warn('Elemento no encontrado para setear HTML');
    return false;
  }
  el.innerHTML = html;
  return true;
}

async function entrenarModelo() {
  const selectAlgoritmo = getEl('select-algoritmo');
  const btn = getEl('btn-entrenar');
  const progress = getEl('train-progress');

  if (!selectAlgoritmo || !btn || !progress) {
    console.warn('Faltan elementos del DOM para entrenar:', {
      selectAlgoritmo: !!selectAlgoritmo,
      btn: !!btn,
      progress: !!progress
    });
    return;
  }

  const algoritmo = selectAlgoritmo.value;

  btn.disabled = true;
  progress.classList.remove('d-none');

  try {
    const res = await authFetch('/api/ml/entrenar/', {
      method: 'POST',
      body: JSON.stringify({ algoritmo })
    });
    if (!res) return;

    const data = await res.json().catch(() => ({}));

    if (res.ok) {
      // Backend actual devuelve: { status, metricas, matrix, modelo }
      // Mantener compatibilidad si en algún punto llega envuelto en { result: ... }
      const result = data.result || data || {};

      const metrics = result.metricas || result.metrics || {};
      const matrix = result.matrix || null;


      const unifiedMetricas = {
        accuracy: metrics.accuracy ?? 0,
        precision: metrics.precision ?? 0,
        recall: metrics.recall ?? 0,
        f1_score: metrics.f1_score ?? 0,
        // mostrarMetricas puede construir la confusion a partir de matrix unificado
        confusion_matrix: metrics.confusion_matrix ?? null,
        clases: metrics.clases ?? null,
        matrix: matrix
      };

      mostrarMetricas(unifiedMetricas, data.modelo, matrix);
      await cargarModelos();
    } else {
      alert('Error: ' + (data.error || 'No se pudo entrenar el modelo'));
    }
  } catch (e) {
    alert('Error de conexión: ' + (e?.message || String(e)));
  } finally {
    btn.disabled = false;
    progress.classList.add('d-none');
  }
}

function mostrarMetricas(metricas, modelo, matrix) {
  const panel = getEl('metricas-panel');
  if (!panel) {
    console.warn('Elemento #metricas-panel no existe en el DOM');
    return;
  }
  if (!metricas || !modelo) {
    console.warn('Datos incompletos para mostrar métricas', { metricas, modelo });
    return;
  }

  const acc = ((metricas?.accuracy ?? 0) * 100).toFixed(1);
  const prec = ((metricas?.precision ?? 0) * 100).toFixed(1);
  const rec = ((metricas?.recall ?? 0) * 100).toFixed(1);
  const f1 = ((metricas?.f1_score ?? 0) * 100).toFixed(1);

  safeSetHTML(panel, `
    <div class="row g-3">
      <div class="col-6">
        <div class="border rounded p-3 text-center">
          <div class="text-muted small">Accuracy</div>
          <div class="fw-bold fs-3 text-primary">${acc}%</div>
          <div class="progress mt-2" style="height:6px">
            <div class="progress-bar bg-primary" style="width:${acc}%"></div>
          </div>
        </div>
      </div>
      <div class="col-6">
        <div class="border rounded p-3 text-center">
          <div class="text-muted small">Precision</div>
          <div class="fw-bold fs-3 text-success">${prec}%</div>
          <div class="progress mt-2" style="height:6px">
            <div class="progress-bar bg-success" style="width:${prec}%"></div>
          </div>
        </div>
      </div>
      <div class="col-6">
        <div class="border rounded p-3 text-center">
          <div class="text-muted small">Recall</div>
          <div class="fw-bold fs-3 text-warning">${rec}%</div>
          <div class="progress mt-2" style="height:6px">
            <div class="progress-bar bg-warning" style="width:${rec}%"></div>
          </div>
        </div>
      </div>
      <div class="col-6">
        <div class="border rounded p-3 text-center">
          <div class="text-muted small">F1-Score</div>
          <div class="fw-bold fs-3 text-info">${f1}%</div>
          <div class="progress mt-2" style="height:6px">
            <div class="progress-bar bg-info" style="width:${f1}%"></div>
          </div>
        </div>
      </div>
    </div>
    <div class="mt-3 text-center">
      <small class="text-muted">Modelo: <strong>${modelo.nombre}</strong></small>
    </div>
  `);

  // Mostrar sección de confusion matrix
  const confusionSection = getEl('confusion-section');
  if (confusionSection) {
    confusionSection.style.removeProperty('display');
  } else {
    console.warn('Elemento #confusion-section no existe en el DOM');
  }

  // Gráfica barras métricas
  const chartMetricas = getEl('chart-metricas');
  if (!chartMetricas) {
    console.warn('Elemento #chart-metricas no existe en el DOM');
  } else {
    if (metricasChart) {
      metricasChart.destroy();
      metricasChart = null;
    }

    metricasChart = new Chart(chartMetricas, {
      type: 'bar',
      data: {
        labels: ['Accuracy', 'Precision', 'Recall', 'F1-Score'],
        datasets: [{
          label: 'Valor (%)',
          data: [acc, prec, rec, f1],
          backgroundColor: ['rgba(124,58,237,0.2)', 'rgba(20,184,166,0.2)', 'rgba(251,191,36,0.2)', 'rgba(244,63,94,0.2)'],
          borderColor: ['#7c3aed', '#14b8a6', '#fbbf24', '#f43f5e'],
          borderWidth: 2,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } } }
      }
    });
  }

  // Si el backend unifica en matrix (dict), lo transformamos a cm+clases para reusar renderMatrizConfusion.
  if (matrix && typeof matrix === 'object' && !metricas.confusion_matrix) {
    const clases = Object.keys(matrix);
    // cm por filas en el orden de claves
    const cm = clases.map(k => matrix[k]);
    renderMatrizConfusion(cm, clases);
  } else {
    renderMatrizConfusion(metricas.confusion_matrix, metricas.clases);
  }
}


function renderMatrizConfusion(cm, clases) {
  if (!cm || !clases) return;

  const canvas = getEl('chart-confusion');
  if (!canvas || !canvas.parentElement) {
    console.warn('No existe el contenedor de #chart-confusion en el DOM');
    return;
  }

  if (confusionChart) {
    confusionChart.destroy();
    confusionChart = null;
  }

  // Tabla HTML simplificada
  let html = '<table class="table table-bordered table-sm text-center small">';
  html += '<thead class="table-dark"><tr><th>Real \\ Pred</th>';
  clases.forEach(c => (html += `<th>${c}</th>`));
  html += '</tr></thead><tbody>';

  cm.forEach((row, i) => {
    html += `<tr><th class="table-secondary">${clases[i]}</th>`;
    row.forEach((v, j) => {
      const bg = i === j ? 'bg-success bg-opacity-25' : (v > 0 ? 'bg-danger bg-opacity-10' : '');
      html += `<td class="${bg} fw-semibold">${v}</td>`;
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  canvas.parentElement.innerHTML = '<h6 class="fw-semibold mb-3 small text-muted">MATRIZ DE CONFUSIÓN</h6>' + html;
}

async function predecirPaciente() {
  const inputId = getEl('input-paciente-id');
  const div = getEl('prediccion-resultado');

  if (!inputId || !div) {
    console.warn('Faltan elementos del DOM para predecir:', { inputId: !!inputId, div: !!div });
    return;
  }

  const id = inputId.value;
  if (!id) {
    alert('Ingresa el ID del paciente.');
    return;
  }

  div.innerHTML = '<div class="alert alert-info"><div class="spinner-border spinner-border-sm me-2"></div>Prediciendo riesgo...</div>';

  try {
    const res = await authFetch('/api/ml/predecir/', {
      method: 'POST',
      body: JSON.stringify({ paciente_id: parseInt(id) })
    });

    if (!res) return;

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
        <div class="card border-0 mt-3" style="border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(76,29,149,0.1)">
          <div style="background:linear-gradient(135deg,var(--violet-900),var(--violet-700));padding:1rem 1.25rem">
            <div class="d-flex align-items-center gap-3">
              <div style="width:44px;height:44px;border-radius:12px;background:rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i class="bi bi-person-fill text-white" style="font-size:1.3rem"></i>
              </div>
              <div>
                <div style="font-family:'Space Grotesk',sans-serif;font-weight:700;color:#fff;font-size:1rem">${nombre}</div>
                <div style="font-size:11px;color:var(--violet-300)">ID #${data.paciente_id}</div>
              </div>
            </div>
          </div>
          <div class="card-body p-3">
            <div class="d-flex align-items-center gap-3 mb-3">
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
          </div>
        </div>`;
    } else {
      div.innerHTML = `<div class="alert alert-danger">${data.error || 'No se pudo predecir el riesgo'}</div>`;
    }
  } catch (e) {
    div.innerHTML = `<div class="alert alert-danger">Error: ${(e?.message || String(e))}</div>`;
  }
}

async function cargarModelos() {
  const tbody = getEl('modelos-tbody');
  if (!tbody) {
    console.warn('Elemento #modelos-tbody no existe en el DOM');
    return;
  }

  try {
    const res = await authFetch('/api/ml/modelos/');
    if (!res || !res.ok) return;

    const data = await res.json().catch(() => ([]));

    if (!Array.isArray(data) || !data.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Sin modelos entrenados</td></tr>';
      return;
    }

    tbody.innerHTML = data.filter(m => m && typeof m === 'object').map(m => `
      <tr>
        <td class="fw-semibold small">${m.nombre ?? '—'}</td>
        <td><span class="badge bg-info text-dark">${String(m.algoritmo ?? '').replace('_', ' ')}</span></td>
        <td>${m.accuracy != null ? (m.accuracy * 100).toFixed(1) + '%' : '—'}</td>
        <td>${m.f1_score != null ? (m.f1_score * 100).toFixed(1) + '%' : '—'}</td>
        <td class="small text-muted">${formatFecha(m.fecha_entrenamiento)}</td>
        <td>${m.activo ? '<span class="badge bg-success">Activo</span>' : '<span class="badge bg-secondary">Inactivo</span>'}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

function formatFecha(f) {
  return f ? new Date(f).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' }) : '—';
}

// Exportar a window para los onclick del template
window.entrenarModelo = entrenarModelo;
window.predecirPaciente = predecirPaciente;
window.cargarModelos = cargarModelos;

document.addEventListener('DOMContentLoaded', () => {
  // Si el DOM aún no tiene el contenedor, no crashea
  cargarModelos();
});

