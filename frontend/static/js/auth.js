/* auth.js — Tokens JWT, roles y protección de rutas — SADA IPS */

const API = '/api';

function getToken()   { return localStorage.getItem('access'); }
function getRefresh() { return localStorage.getItem('refresh'); }

function decodificarToken(token) {
  try { return JSON.parse(atob(token.split('.')[1])); } catch { return {}; }
}

function getRol() {
  const payload = decodificarToken(getToken());
  return (payload.rol || localStorage.getItem('rol') || '').toLowerCase();
}

const ROLES = {
  pages: {
    '/':           ['administrador', 'medico', 'analista'],
    '/pacientes/': ['administrador', 'medico'],
    '/etl/':       ['administrador', 'analista'],
    '/ml/':        ['administrador', 'analista'],
    '/usuarios/':  ['administrador'],
  },
  nav: {
    'nav-pacientes':      ['administrador', 'medico'],
    'nav-etl':            ['administrador', 'analista'],
    'nav-ml':             ['administrador', 'analista'],
    'nav-usuarios':       ['administrador'],
    'nav-reportes':       ['administrador', 'medico', 'analista'],
    'nav-reportes-links': ['administrador', 'medico', 'analista'],
  }
};

async function authFetch(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  options.headers = options.headers || {};
  options.headers['Authorization'] = `Bearer ${getToken()}`;
  if (!isFormData) {
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
      if (isFormData) { cerrarSesion(); return null; } // FormData no re-enviable
      options.headers['Authorization'] = `Bearer ${data.access}`;
      res = await fetch(url, options);
    } else { cerrarSesion(); return null; }
  }
  return res;
}

function cerrarSesion() {
  localStorage.clear();
  window.location.href = '/login/';
}

function aplicarPermisos() {
  const rol = getRol();
  Object.entries(ROLES.nav).forEach(([id, roles]) => {
    const el = document.getElementById(id);
    if (el && !roles.includes(rol)) el.style.display = 'none';
  });
  const path    = window.location.pathname;
  const allowed = Object.entries(ROLES.pages).find(([p]) => path === p);
  if (allowed && !allowed[1].includes(rol)) window.location.href = '/';
}

function mostrarUsuario() {
  const el = document.getElementById('usuario-nombre');
  if (!el) return;
  const payload  = decodificarToken(getToken());
  const username = payload.username || localStorage.getItem('username') || '—';
  const rol      = getRol();
  el.textContent = username;

  // Badge de rol
  const elRol = document.getElementById('usuario-rol');
  if (elRol) {
    const labels = { administrador: 'Admin', medico: 'Médico', analista: 'Analista' };
    elRol.textContent = labels[rol] || rol;
    elRol.className   = `rol-badge rol-${rol}`;
  }
}

(function protegerRuta() {
  const rutasPublicas = ['/login/'];
  if (!rutasPublicas.includes(window.location.pathname) && !getToken()) {
    window.location.href = '/login/'; return;
  }
  aplicarPermisos();
  mostrarUsuario();
})();

async function descargarArchivo(url, filename) {
  try {
    const res = await authFetch(url);
    if (!res || !res.ok) { alert('Error al descargar el archivo'); return; }
    const blob = window.URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = blob; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(blob);
  } catch(e) { console.error('Error descargando:', e); }
}
