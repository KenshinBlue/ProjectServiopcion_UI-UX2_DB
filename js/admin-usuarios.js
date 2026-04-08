let sesionActual = null;
let usuariosCache = [];

function esRolAdmin(rol) {
    return /admin/i.test(String(rol || ''));
}

function cerrarSesion() {
    if (confirm('¿Estás seguro que deseas cerrar sesión?')) {
        BaseDatos.logout().finally(() => {
            window.location.href = '/html/index.html';
        });
    }
}

function obtenerRolesMarcados(nombreCampo) {
    return Array.from(document.querySelectorAll(`input[name="${nombreCampo}"]:checked`)).map((e) => e.value);
}

function marcarRoles(nombreCampo, roles = []) {
    document.querySelectorAll(`input[name="${nombreCampo}"]`).forEach((input) => {
        input.checked = roles.includes(input.value);
    });
}

function renderUsuarios() {
    const tbody = document.getElementById('cuerpoTablaUsuarios');
    const select = document.getElementById('selectUsuarioEditar');

    tbody.innerHTML = '';
    select.innerHTML = '<option value="">Seleccione usuario</option>';

    if (!usuariosCache.length) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; padding:20px; color:#666;">No hay usuarios</td></tr>';
        return;
    }

    usuariosCache.forEach((user) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${user.id}</td>
            <td>${user.usuario}</td>
            <td>${user.rolesTexto || user.roles.join(', ')}</td>
        `;
        tbody.appendChild(tr);

        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.usuario} (${user.roles.join(', ') || 'Sin rol'})`;
        select.appendChild(option);
    });
}

async function cargarUsuarios() {
    usuariosCache = await BaseDatos.obtenerUsuariosAdmin();
    renderUsuarios();
}

document.getElementById('formCrearUsuario').addEventListener('submit', async (event) => {
    event.preventDefault();

    const usuario = document.getElementById('usuarioNuevo').value.trim();
    const contrasena = document.getElementById('contrasenaNueva').value;
    const roles = obtenerRolesMarcados('rolNuevo');
    const mensaje = document.getElementById('mensajeCrearUsuario');

    try {
        await BaseDatos.crearUsuarioAdmin({ usuario, contrasena, roles });
        event.target.reset();
        mensaje.textContent = 'Usuario creado correctamente';
        mensaje.style.color = '#1d8348';
        await cargarUsuarios();
    } catch (error) {
        mensaje.textContent = `Error: ${error.message}`;
        mensaje.style.color = '#c0392b';
    }
});

document.getElementById('selectUsuarioEditar').addEventListener('change', (event) => {
    const id = Number(event.target.value);
    const user = usuariosCache.find((u) => Number(u.id) === id);

    if (!user) {
        document.getElementById('usuarioEditar').value = '';
        document.getElementById('contrasenaEditar').value = '';
        marcarRoles('rolEditar', []);
        return;
    }

    document.getElementById('usuarioEditar').value = user.usuario;
    document.getElementById('contrasenaEditar').value = '';
    marcarRoles('rolEditar', user.roles || []);
});

document.getElementById('formEditarUsuario').addEventListener('submit', async (event) => {
    event.preventDefault();

    const id = Number(document.getElementById('selectUsuarioEditar').value);
    const usuario = document.getElementById('usuarioEditar').value.trim();
    const contrasenaNueva = document.getElementById('contrasenaEditar').value;
    const roles = obtenerRolesMarcados('rolEditar');
    const mensaje = document.getElementById('mensajeEditarUsuario');

    if (!id) {
        mensaje.textContent = 'Seleccione un usuario';
        mensaje.style.color = '#c0392b';
        return;
    }

    try {
        await BaseDatos.actualizarUsuarioAdmin(id, { usuario, contrasenaNueva, roles });
        document.getElementById('contrasenaEditar').value = '';
        mensaje.textContent = 'Usuario actualizado correctamente';
        mensaje.style.color = '#1d8348';
        await cargarUsuarios();
    } catch (error) {
        mensaje.textContent = `Error: ${error.message}`;
        mensaje.style.color = '#c0392b';
    }
});

async function iniciarPantallaAdminUsuarios() {
    try {
        if (!(await BaseDatos.tieneSesion())) {
            window.location.href = '/html/index.html';
            return;
        }

        sesionActual = await BaseDatos.obtenerSesion();

        if (!esRolAdmin(sesionActual.rol)) {
            alert('Acceso restringido a administrador');
            window.location.href = '/html/dashboard.html';
            return;
        }

        document.getElementById('nombreUsuario').textContent = sesionActual.nombre;
        document.getElementById('rolUsuario').textContent = sesionActual.rol;

        await cargarUsuarios();
    } catch (error) {
        alert(`No se pudo cargar la administración de usuarios: ${error.message}`);
        window.location.href = '/html/dashboard.html';
    }
}

iniciarPantallaAdminUsuarios();
