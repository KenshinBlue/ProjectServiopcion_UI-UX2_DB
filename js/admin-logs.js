let sesionActual = null;

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

function formatearFecha(fechaIso) {
    const fecha = new Date(fechaIso);
    return fecha.toLocaleString('es-CO');
}

function construirFiltros() {
    return {
        desde: document.getElementById('filtroDesdeLog').value || '',
        hasta: document.getElementById('filtroHastaLog').value || '',
        texto: document.getElementById('filtroTextoLog').value.trim() || '',
        limite: Number(document.getElementById('filtroLimiteLog').value || 200)
    };
}

async function cargarAuditoria() {
    const tbody = document.getElementById('cuerpoTablaLogs');
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#666;">Cargando...</td></tr>';

    try {
        const logs = await BaseDatos.obtenerAuditoria(construirFiltros());
        tbody.innerHTML = '';

        if (!logs.length) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px; color:#666;">No hay registros para mostrar</td></tr>';
            return;
        }

        logs.forEach((log) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${formatearFecha(log.fecha_hora)}</td>
                <td>${log.origen}</td>
                <td>${log.usuario || '-'}</td>
                <td>${log.accion}</td>
            `;
            tbody.appendChild(tr);
        });
    } catch (error) {
        tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color:#c0392b;">Error cargando auditoría: ${error.message}</td></tr>`;
    }
}

document.getElementById('btnFiltrarLogs').addEventListener('click', async () => {
    await cargarAuditoria();
});

document.getElementById('btnRespaldoBd').addEventListener('click', async () => {
    const mensaje = document.getElementById('mensajeRespaldoBd');
    const boton = document.getElementById('btnRespaldoBd');

    try {
        boton.disabled = true;
        mensaje.textContent = 'Generando respaldo de base de datos...';
        mensaje.style.color = '#2c3e50';

        const data = await BaseDatos.generarRespaldoBaseDeDatos();

        mensaje.textContent = `Respaldo generado: ${data.filename}`;
        mensaje.style.color = '#1d8348';

        if (data.downloadUrl) {
            window.location.href = data.downloadUrl;
        }
    } catch (error) {
        mensaje.textContent = `Error generando respaldo: ${error.message}`;
        mensaje.style.color = '#c0392b';
    } finally {
        boton.disabled = false;
    }
});

async function iniciarPantallaAdminLogs() {
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

        await cargarAuditoria();
    } catch (error) {
        alert(`No se pudo cargar logs: ${error.message}`);
        window.location.href = '/html/dashboard.html';
    }
}

iniciarPantallaAdminLogs();
