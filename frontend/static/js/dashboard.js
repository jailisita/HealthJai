/* dashboard.js — KPIs y gráficas — Paleta morada */

const COLORES_RIESGO = {
  bajo:    '#14b8a6',
  medio:   '#fbbf24',
  alto:    '#f97316',
  critico: '#f43f5e',
};

const PALETTE = {
  violet:  ['#7c3aed','#8b5cf6','#a78bfa','#c4b5fd','#ddd6fe'],
  mixed:   ['#7c3aed','#14b8a6','#fbbf24','#f43f5e','#0ea5e9','#f97316','#6366f1','#10b981','#d946ef','#06b6d4'],
  imc:     { bajo_peso:'#0ea5e9', normal:'#14b8a6', sobrepeso:'#fbbf24', obesidad:'#f43f5e' },
};

Chart.defaults.font.family = "'Inter', system-ui, sans-serif";
Chart.defaults.font.size   = 12;
Chart.defaults.color       = '#9893ae';

async function cargarDashboard() {
  try {
    const res = await authFetch('/api/dashboard/kpis/');
    if (!res || !res.ok) return;
    const data = await res.json();

    const k = data.kpis;
    setText('kpi-total',       k.total_pacientes ?? '—');
    setText('kpi-criticos',    `${k.pacientes_criticos ?? '—'} (${k.pct_criticos ?? 0}%)`);
    setText('kpi-hipertensos', `${k.pacientes_hipertensos ?? '—'} (${k.pct_hipertensos ?? 0}%)`);
    setText('kpi-diabeticos',  `${k.pacientes_diabeticos ?? '—'} (${k.pct_diabeticos ?? 0}%)`);
    setText('kpi-fumadores',   k.pacientes_fumadores ?? '—');
    setText('pct-fumadores',   `${k.pct_fumadores ?? 0}% del total`);

    const avg = k.promedios || {};
    setText('kpi-imc',    avg.avg_imc     ? avg.avg_imc.toFixed(1)              : '—');
    setText('kpi-glucosa', avg.avg_glucosa ? avg.avg_glucosa.toFixed(1)+' mg/dL' : '—');

    // ETL status
    const etl = data.ultimo_etl;
    document.getElementById('etl-status').innerHTML = etl?.fecha
      ? `<div class="d-flex gap-3 flex-wrap">
           <div><div class="text-muted small">Última ejecución</div>
                <div class="fw-semibold" style="font-size:0.875rem">${formatFecha(etl.fecha)}</div></div>
           <div><div class="text-muted small">Registros</div>
                <div class="fw-semibold" style="font-size:0.875rem">${etl.registros}</div></div>
           <div><div class="text-muted small">Estado</div>
                <span class="badge ${badgeEstado(etl.estado)}">${etl.estado}</span></div>
         </div>`
      : '<span class="text-muted small">Sin ejecuciones registradas</span>';

    // ML status
    const ml = data?.modelo_activo;
    document.getElementById('ml-status').innerHTML = ml?.nombre
      ? `<div class="d-flex gap-3 flex-wrap">
           <div><div class="text-muted small">Modelo</div>
                <div class="fw-semibold" style="font-size:0.875rem">${ml.nombre}</div></div>
           <div><div class="text-muted small">Accuracy</div>
                <div class="fw-semibold" style="color:var(--teal-500);font-size:0.875rem">${ml.accuracy != null ? (ml.accuracy*100).toFixed(1)+'%' : '—'}</div></div>
         </div>`
      : '<span class="text-muted small">No hay modelos entrenados</span>';

    renderGraficaRiesgo(data.graficas.distribucion_riesgo);
    renderGraficaEdad(data.graficas.segmentacion_edad);
    renderGraficaIMC(data.graficas.distribucion_imc);
    renderGraficaDiagnosticos(data.graficas.top_diagnosticos);

  } catch(e) {
    console.error('Error cargando dashboard:', e);
  }
}

function renderGraficaRiesgo(data) {
  if (!data) return;
  const labels = Object.keys(data);
  const values = Object.values(data);
  new Chart(document.getElementById('chart-riesgo'), {
    type: 'doughnut',
    data: {
      labels: labels.map(l => l.charAt(0).toUpperCase() + l.slice(1)),
      datasets: [{
        data: values,
        backgroundColor: labels.map(l => COLORES_RIESGO[l] || '#9893ae'),
        borderWidth: 3, borderColor: '#ffffff',
        hoverBorderWidth: 4,
      }]
    },
    options: {
      responsive: true, cutout: '68%',
      plugins: {
        legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, pointStyleWidth: 8 } }
      }
    }
  });
}

function renderGraficaEdad(data) {
  if (!data?.length) return;
  new Chart(document.getElementById('chart-edad'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.rango_edad),
      datasets: [{
        label: 'Pacientes',
        data: data.map(d => d.total),
        backgroundColor: 'rgba(124,58,237,0.18)',
        borderColor: '#7c3aed',
        borderWidth: 2,
        borderRadius: 7,
        borderSkipped: false,
        hoverBackgroundColor: 'rgba(124,58,237,0.32)',
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f0eef8' }, ticks: { precision: 0 } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderGraficaIMC(data) {
  if (!data || !Object.keys(data).length) return;
  const labels = { bajo_peso:'Bajo Peso', normal:'Normal', sobrepeso:'Sobrepeso', obesidad:'Obesidad' };
  const keys = Object.keys(data);
  new Chart(document.getElementById('chart-imc'), {
    type: 'pie',
    data: {
      labels: keys.map(k => labels[k] || k),
      datasets: [{
        data: Object.values(data),
        backgroundColor: keys.map(k => PALETTE.imc[k] || '#9893ae'),
        borderWidth: 3, borderColor: '#ffffff',
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { padding: 14, usePointStyle: true, pointStyleWidth: 8 } } }
    }
  });
}

function renderGraficaDiagnosticos(data) {
  if (!data?.length) return;
  new Chart(document.getElementById('chart-diagnosticos'), {
    type: 'bar',
    data: {
      labels: data.map(d => d.diagnostico_preliminar || 'Sin diagnóstico'),
      datasets: [{
        label: 'Casos',
        data: data.map(d => d.total),
        backgroundColor: data.map((_, i) => PALETTE.mixed[i % PALETTE.mixed.length] + '33'),
        borderColor:     data.map((_, i) => PALETTE.mixed[i % PALETTE.mixed.length]),
        borderWidth: 2, borderRadius: 5, borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y', responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, grid: { color: '#f0eef8' }, ticks: { precision: 0 } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
function formatFecha(f) {
  return f ? new Date(f).toLocaleString('es-CO', { dateStyle:'medium', timeStyle:'short' }) : '—';
}
function badgeEstado(e) {
  return { completado:'bg-success', error:'bg-danger', en_proceso:'bg-warning', pendiente:'bg-secondary' }[e] || 'bg-secondary';
}

document.addEventListener('DOMContentLoaded', cargarDashboard);
