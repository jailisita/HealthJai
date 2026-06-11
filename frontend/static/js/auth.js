/* auth.js — Tokens JWT + control de acceso por rol */

const API = '/api';

// Permisos por rol
const ROL_PERMISOS = {
  admin:    ['dashboard', 'pacientes', 'etl', 'ml', 'reportes'],
  doctor:   ['dashboard', 'pacientes', 'reportes'],
  analista: ['dashboard', 'etl', 'ml', 'reportes'],
};

// Rutas protegidas y qué permiso requieren
const RUTA_PERMISO = {
  '/':          'dashboard',
  '/pacientes/':'pacientes',
  '/etl/':      'etl',
  '/ml/':       'ml',
};

function getToken()   { return localStorage.getItem('access'); }
function getRefresh() { return localStorage.getItem('refresh'); }
function getRol()     { return (localStorage.getItem('rol') || 'doctor').toLowerCase(); }

function tieneAcceso(permiso) {
  const permisos = ROL_PERMISOS[getRol()] || ROL_PERMISOS['doctor'];
  return permisos.includes(permiso);
}

async function authFetch(url, options = {}) {
  options.headers = options.headers || {};
  options.headers['Authorization'] = `Bearer ${getToken()}`;
  if (!(options.body instanceof FormData)) {
    options.headers['Content-Type'] = options.headers['Content-Type'] || 'application/json';
  }
  let res = await fetch(url, options);
  if (res.status === 401) {
    const refreshRes = await fetch(`${API}/auth/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh: getRefresh() })
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      localStorage.setItem('access', data.access);
      options.headers['Authorization'] = `Bearer ${data.access}`;
      res = await fetch(url, options);
    } else {
      cerrarSesion(); return null;
    }
  }
  return res;
}

function cerrarSesion() {
  localStorage.clear();
  window.location.href = '/login/';
}

async function descargarArchivo(url, filename) {
  try {
    const res = await authFetch(url);
    if (!res || !res.ok) { alert('Error al descargar el archivo'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = window.URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
  } catch(e) { console.error('Error descargando:', e); }
}

// ── Protección de ruta + setup de sidebar ─────────────────────
(function init() {
  const rutasPublicas = ['/login/'];
  const path = window.location.pathname;

  if (rutasPublicas.includes(path)) return;

  if (!getToken()) { window.location.href = '/login/'; return; }

  // Redirigir si el rol no tiene acceso a esta ruta
  const permiso = RUTA_PERMISO[path];
  if (permiso && !tieneAcceso(permiso)) {
    window.location.href = '/';
    return;
  }

  // Mostrar nombre y rol en sidebar
  const elNombre = document.getElementById('usuario-nombre');
  if (elNombre) {
    const username = localStorage.getItem('username') || '—';
    elNombre.textContent = username;
  }
  const elRol = document.getElementById('usuario-rol');
  if (elRol) {
    const rol = getRol();
    const ROL_LABEL = { admin:'Administrador', doctor:'Doctor', analista:'Analista' };
    elRol.textContent = ROL_LABEL[rol] || rol;
    elRol.className = `rol-badge rol-${rol}`;
  }

  // Ocultar elementos del sidebar según rol
  document.addEventListener('DOMContentLoaded', () => {
    // Ocultar nav-items sin acceso
    document.querySelectorAll('.nav-item[data-permiso]').forEach(el => {
      if (!tieneAcceso(el.getAttribute('data-permiso'))) el.style.display = 'none';
    });
    // Ocultar secciones de reportes si no tiene acceso
    document.querySelectorAll('.sidebar-section[data-permiso]').forEach(el => {
      if (!tieneAcceso(el.getAttribute('data-permiso'))) el.style.display = 'none';
    });
    // Ocultar secciones cuya lista queda vacía
    document.querySelectorAll('.sidebar-section').forEach(section => {
      const visibles = [...section.querySelectorAll('.nav-item')].filter(
        li => li.style.display !== 'none'
      );
      if (!visibles.length) section.style.display = 'none';
    });
  });
})();
