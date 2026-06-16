/* usuarios.js — SADA IPS */

const ROL_BADGE = {
  administrador: 'background:rgba(251,191,36,.18);color:#d97706;border:1px solid rgba(251,191,36,.3)',
  medico:        'background:rgba(14,165,233,.18);color:#0284c7;border:1px solid rgba(14,165,233,.3)',
  analista:      'background:rgba(124,58,237,.18);color:#6520b0;border:1px solid rgba(124,58,237,.3)',
};

function toastU(msg, type = 'success') {
  const prev = document.getElementById('u-toast');
  if (prev) prev.remove();
  const C = { success:'#14b8a6', danger:'#f43f5e', warning:'#fbbf24' };
  const t = document.createElement('div');
  t.id = 'u-toast';
  t.style.cssText = `position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;background:#fff;
    border-left:4px solid ${C[type]||C.success};border-radius:10px;padding:.75rem 1.1rem;
    box-shadow:0 6px 24px rgba(76,29,149,.15);font-size:.875rem;color:#1e1b29;max-width:360px`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 4000);
}

async function cargarUsuarios() {
  const tbody = document.getElementById('usuarios-tbody');
  tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5" style="color:var(--text-secondary)">
    <div class="spinner-border spinner-border-sm me-2" style="color:var(--violet-400)"></div>Cargando...</td></tr>`;

  const res = await authFetch('/api/auth/usuarios/');
  if (!res) return;
  const usuarios = await res.json();

  const badge = document.getElementById('badge-total');
  if (badge) badge.textContent = usuarios.length;

  tbody.innerHTML = usuarios.length
    ? usuarios.map(u => `
      <tr>
        <td class="fw-semibold" style="color:var(--violet-600)">${u.username}</td>
        <td style="font-size:.85rem">${u.email || '—'}</td>
        <td>${u.first_name || '—'}</td>
        <td>${u.last_name  || '—'}</td>
        <td>
          <span class="risk-badge" style="${ROL_BADGE[u.rol] || ''}">
            ${u.rol || '—'}
          </span>
        </td>
        <td>
          <button class="btn btn-sm btn-outline-primary editar-usuario me-1"
            data-id="${u.id}" data-username="${u.username}" data-email="${u.email||''}"
            data-first="${u.first_name||''}" data-last="${u.last_name||''}" data-rol="${u.rol||''}"
            title="Editar"><i class="bi bi-pencil"></i></button>
          <button class="btn btn-sm btn-outline-danger eliminar-usuario"
            data-id="${u.id}" data-username="${u.username}" title="Eliminar">
            <i class="bi bi-trash"></i></button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="text-center py-5" style="color:var(--text-secondary)">No hay usuarios registrados</td></tr>';

  document.querySelectorAll('.editar-usuario').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('edit-user-id').value    = btn.dataset.id;
      document.getElementById('edit-username').value   = btn.dataset.username;
      document.getElementById('edit-email').value      = btn.dataset.email;
      document.getElementById('edit-first-name').value = btn.dataset.first;
      document.getElementById('edit-last-name').value  = btn.dataset.last;
      document.getElementById('edit-rol').value        = btn.dataset.rol;
      document.getElementById('edit-password').value   = '';
      document.getElementById('msg-edit').textContent  = '';
      new bootstrap.Modal(document.getElementById('modal-editar-usuario')).show();
    });
  });

  document.querySelectorAll('.eliminar-usuario').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar al usuario "${btn.dataset.username}"? Esta acción no se puede deshacer.`)) return;
      const res = await authFetch(`/api/auth/usuarios/${btn.dataset.id}/`, { method: 'DELETE' });
      if (res && res.ok) { toastU('Usuario eliminado correctamente.'); cargarUsuarios(); }
      else toastU('Error al eliminar el usuario.', 'danger');
    });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  cargarUsuarios();

  // Mostrar/ocultar formulario
  document.getElementById('btn-mostrar-form-usuario')?.addEventListener('click', () => {
    const c = document.getElementById('contenedor-form-usuario');
    c.style.display = c.style.display === 'none' ? 'block' : 'none';
    document.getElementById('msg-form').textContent = '';
  });

  // Crear usuario
  document.getElementById('form-usuario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('msg-form');
    msg.textContent = 'Creando...'; msg.style.color = 'var(--text-secondary)';

    const payload = {
      username:   document.getElementById('input-username').value.trim(),
      email:      document.getElementById('input-email').value.trim(),
      password:   document.getElementById('input-password').value,
      first_name: document.getElementById('input-first-name').value.trim(),
      last_name:  document.getElementById('input-last-name').value.trim(),
      rol:        document.getElementById('input-rol').value,
    };

    const res = await authFetch('/api/auth/usuarios/', { method: 'POST', body: JSON.stringify(payload) });
    if (res && res.ok) {
      msg.textContent = '✓ Usuario creado correctamente'; msg.style.color = '#14b8a6';
      document.getElementById('form-usuario').reset();
      cargarUsuarios();
      toastU('Usuario creado correctamente.');
    } else {
      const err = res ? await res.json() : { detail: 'Error de conexión' };
      msg.textContent = Object.values(err).flat().join(', '); msg.style.color = '#f43f5e';
    }
  });

  // Editar usuario
  document.getElementById('form-editar-usuario')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msgEdit = document.getElementById('msg-edit');
    msgEdit.textContent = 'Guardando...'; msgEdit.style.color = 'var(--text-secondary)';

    const id      = document.getElementById('edit-user-id').value;
    const payload = {
      username:   document.getElementById('edit-username').value.trim(),
      email:      document.getElementById('edit-email').value.trim(),
      first_name: document.getElementById('edit-first-name').value.trim(),
      last_name:  document.getElementById('edit-last-name').value.trim(),
      rol:        document.getElementById('edit-rol').value,
    };
    const pwd = document.getElementById('edit-password').value;
    if (pwd) payload.password = pwd;

    const res = await authFetch(`/api/auth/usuarios/${id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
    if (res && res.ok) {
      bootstrap.Modal.getInstance(document.getElementById('modal-editar-usuario')).hide();
      cargarUsuarios();
      toastU('Usuario actualizado correctamente.');
    } else {
      const err = res ? await res.json() : { detail: 'Error de conexión' };
      msgEdit.textContent = Object.values(err).flat().join(', '); msgEdit.style.color = '#f43f5e';
    }
  });
});
