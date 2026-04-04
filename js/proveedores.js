let sesionActual = null;
let proveedoresCache = [];
let productosCache = [];
let proveedorEditandoId = null;

function esRolAdmin(rol) {
    return /admin/i.test(String(rol || ''));
}

function aplicarVisibilidadMenuAdmin(esAdmin) {
    const linkUsuarios = document.getElementById('linkAdminUsuarios');
    const linkLogs = document.getElementById('linkAdminLogs');

    if (linkUsuarios) linkUsuarios.style.display = esAdmin ? 'block' : 'none';
    if (linkLogs) linkLogs.style.display = esAdmin ? 'block' : 'none';
}

function cerrarSesion() {
    if (confirm('¿Estás seguro que deseas cerrar sesión?')) {
        BaseDatos.logout()
            .finally(() => {
                window.location.href = '/html/index.html';
            });
    }
}

async function cargarProductos() {
    productosCache = await BaseDatos.obtenerProductos();
    const select = document.getElementById('selectProductosRelacion');
    select.innerHTML = '';

    productosCache.forEach((p) => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.codigo} - ${p.producto}`;
        select.appendChild(option);
    });
}

async function cargarProveedores() {
    proveedoresCache = await BaseDatos.obtenerProveedores();

    const tbody = document.getElementById('cuerpoTablaProveedores');
    const selectProveedor = document.getElementById('selectProveedorRelacion');
    const esAdmin = esRolAdmin(sesionActual.rol);

    tbody.innerHTML = '';
    selectProveedor.innerHTML = '<option value="">Seleccione un proveedor</option>';

    if (!proveedoresCache.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#666;">No hay proveedores registrados</td></tr>';
        return;
    }

    proveedoresCache.forEach((proveedor) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${proveedor.nombre}</td>
            <td>${proveedor.contacto || '-'}</td>
            <td>${proveedor.direccion || '-'}</td>
            <td>${proveedor.totalProductos}</td>
            <td>
                ${esAdmin ? `<button class="btn-editar" onclick="editarProveedor(${proveedor.id})">Editar</button>` : ''}
                ${esAdmin ? `<button class="btn-eliminar" onclick="eliminarProveedor(${proveedor.id})">Eliminar</button>` : ''}
            </td>
        `;
        tbody.appendChild(tr);

        const option = document.createElement('option');
        option.value = proveedor.id;
        option.textContent = proveedor.nombre;
        selectProveedor.appendChild(option);
    });
}

function editarProveedor(id) {
    const proveedor = proveedoresCache.find((p) => Number(p.id) === Number(id));
    if (!proveedor) return;

    proveedorEditandoId = proveedor.id;
    document.getElementById('nombreProveedor').value = proveedor.nombre;
    document.getElementById('contactoProveedor').value = proveedor.contacto || '';
    document.getElementById('direccionProveedor').value = proveedor.direccion || '';
}

async function eliminarProveedor(id) {
    const proveedor = proveedoresCache.find((p) => Number(p.id) === Number(id));
    if (!proveedor) return;

    if (!confirm(`¿Eliminar proveedor ${proveedor.nombre}?`)) return;

    try {
        await BaseDatos.eliminarProveedor(id);
        await cargarProveedores();
        document.getElementById('mensajeProveedor').textContent = 'Proveedor eliminado correctamente';
        document.getElementById('mensajeProveedor').style.color = '#1d8348';
    } catch (error) {
        document.getElementById('mensajeProveedor').textContent = `Error: ${error.message}`;
        document.getElementById('mensajeProveedor').style.color = '#c0392b';
    }
}

async function cargarRelacionProveedor(proveedorId) {
    const select = document.getElementById('selectProductosRelacion');
    Array.from(select.options).forEach((opt) => {
        opt.selected = false;
    });

    if (!proveedorId) return;

    const relacionados = await BaseDatos.obtenerProductosProveedor(proveedorId);
    const ids = new Set(relacionados.map((r) => Number(r.id)));

    Array.from(select.options).forEach((opt) => {
        if (ids.has(Number(opt.value))) {
            opt.selected = true;
        }
    });
}

document.getElementById('formularioProveedor').addEventListener('submit', async (event) => {
    event.preventDefault();

    const nombre = document.getElementById('nombreProveedor').value.trim();
    const contacto = document.getElementById('contactoProveedor').value.trim();
    const direccion = document.getElementById('direccionProveedor').value.trim();
    const mensaje = document.getElementById('mensajeProveedor');

    try {
        if (proveedorEditandoId) {
            await BaseDatos.actualizarProveedor(proveedorEditandoId, { nombre, contacto, direccion });
            mensaje.textContent = 'Proveedor actualizado correctamente';
        } else {
            await BaseDatos.crearProveedor({ nombre, contacto, direccion });
            mensaje.textContent = 'Proveedor creado correctamente';
        }

        mensaje.style.color = '#1d8348';
        proveedorEditandoId = null;
        event.target.reset();
        await cargarProveedores();
    } catch (error) {
        mensaje.textContent = `Error: ${error.message}`;
        mensaje.style.color = '#c0392b';
    }
});

document.getElementById('btnCancelarEdicionProveedor').addEventListener('click', () => {
    proveedorEditandoId = null;
    document.getElementById('formularioProveedor').reset();
});

document.getElementById('selectProveedorRelacion').addEventListener('change', async (event) => {
    try {
        await cargarRelacionProveedor(event.target.value);
    } catch (error) {
        const mensaje = document.getElementById('mensajeRelacionProveedor');
        mensaje.textContent = `Error cargando relación: ${error.message}`;
        mensaje.style.color = '#c0392b';
    }
});

document.getElementById('formularioRelacionProveedor').addEventListener('submit', async (event) => {
    event.preventDefault();

    const proveedorId = Number(document.getElementById('selectProveedorRelacion').value);
    const seleccionados = Array.from(document.getElementById('selectProductosRelacion').selectedOptions)
        .map((opt) => Number(opt.value));

    const mensaje = document.getElementById('mensajeRelacionProveedor');

    try {
        await BaseDatos.guardarProductosProveedor(proveedorId, seleccionados);
        mensaje.textContent = 'Relación proveedor-productos guardada correctamente';
        mensaje.style.color = '#1d8348';
        await cargarProveedores();
    } catch (error) {
        mensaje.textContent = `Error: ${error.message}`;
        mensaje.style.color = '#c0392b';
    }
});

async function iniciarPantallaProveedores() {
    try {
        if (!(await BaseDatos.tieneSesion())) {
            window.location.href = '/html/index.html';
            return;
        }

        sesionActual = await BaseDatos.obtenerSesion();
        const esAdmin = esRolAdmin(sesionActual.rol);

        document.getElementById('nombreUsuario').textContent = sesionActual.nombre;
        document.getElementById('rolUsuario').textContent = sesionActual.rol;
        aplicarVisibilidadMenuAdmin(esAdmin);

        document.getElementById('seccionFormularioProveedor').style.display = esAdmin ? 'block' : 'none';
        document.getElementById('seccionRelacionProveedor').style.display = esAdmin ? 'block' : 'none';

        await cargarProductos();
        await cargarProveedores();
    } catch (error) {
        alert(`No se pudo cargar proveedores: ${error.message}`);
        window.location.href = '/html/index.html';
    }
}

iniciarPantallaProveedores();
