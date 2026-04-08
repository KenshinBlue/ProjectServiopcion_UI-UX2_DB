/* ============================================
   LÓGICA DEL DASHBOARD
   ============================================ */

let sesionActual = null;

function esRolAdmin(rol) {
    return /admin/i.test(String(rol || ''));
}

function aplicarVisibilidadMenuAdmin(esAdmin) {
    const linkUsuarios = document.getElementById('linkAdminUsuarios');
    const linkLogs = document.getElementById('linkAdminLogs');

    if (linkUsuarios) {
        linkUsuarios.style.display = esAdmin ? 'block' : 'none';
    }

    if (linkLogs) {
        linkLogs.style.display = esAdmin ? 'block' : 'none';
    }
}

// Función para cerrar sesión
function cerrarSesion() {
    if (confirm('¿Estás seguro que deseas cerrar sesión?')) {
        BaseDatos.logout()
            .catch((error) => {
                console.error('Error cerrando sesión:', error.message);
            })
            .finally(() => {
                window.location.href = '/html/index.html';
            });
    }
}

// Función para formatear números como moneda
function formatearMoneda(numero) {
    return '$' + numero.toLocaleString('es-CO');
}

// Función para mostrar estadísticas en las tarjetas
async function mostrarEstadisticas() {
    const stats = await BaseDatos.obtenerResumenDashboard();

    document.getElementById('totalProductos').textContent = stats.totalProductos;
    document.getElementById('valorInventario').textContent = formatearMoneda(stats.valorInventario);
    document.getElementById('stockBajo').textContent = stats.stockBajo;
    document.getElementById('sinStock').textContent = stats.sinStock;
}

// Función para obtener el badge de estado de stock
function obtenerBadgeStock(stock, stockMinimo) {
    if (stock === 0) {
        return '<span class="badge badge-rojo">Sin Stock</span>';
    } else if (stock <= stockMinimo) {
        return '<span class="badge badge-amarillo">Stock Bajo</span>';
    } else {
        return '<span class="badge badge-verde">Disponible</span>';
    }
}

// Función para mostrar productos con stock bajo
async function mostrarProductosStockBajo() {
    const productosStockBajo = await BaseDatos.obtenerProductosStockBajo();
    const tbody = document.getElementById('cuerpoTablaAlertas');
    
    // Limpiar tabla
    tbody.innerHTML = '';
    
    if (productosStockBajo.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; padding: 20px; color: #666;">
                     No hay productos con stock bajo
                </td>
            </tr>
        `;
        return;
    }
    
    // Agregar cada producto a la tabla
    productosStockBajo.forEach(producto => {
        const fila = document.createElement('tr');
        fila.innerHTML = `
            <td>${producto.codigo}</td>
            <td><strong>${producto.producto}</strong></td>
            <td>${producto.stock}</td>
            <td>${producto.stockMinimo}</td>
            <td>${obtenerBadgeStock(producto.stock, producto.stockMinimo)}</td>
        `;
        tbody.appendChild(fila);
    });
}

// Inicializar el dashboard al cargar la página
async function iniciarDashboard() {
    try {
        if (!(await BaseDatos.tieneSesion())) {
            window.location.href = '/html/index.html';
            return;
        }

        sesionActual = await BaseDatos.obtenerSesion();
        document.getElementById('nombreUsuario').textContent = sesionActual.nombre;
        document.getElementById('rolUsuario').textContent = sesionActual.rol;
        const esAdmin = esRolAdmin(sesionActual.rol);
        aplicarVisibilidadMenuAdmin(esAdmin);

        const erroresCarga = [];

        try {
            await mostrarEstadisticas();
        } catch (error) {
            erroresCarga.push(`estadísticas: ${error.message}`);
        }

        try {
            await mostrarProductosStockBajo();
        } catch (error) {
            erroresCarga.push(`stock bajo: ${error.message}`);
        }

        if (erroresCarga.length > 0) {
            alert(`El dashboard cargó con advertencias:\n- ${erroresCarga.join('\n- ')}`);
        }
    } catch (error) {
        alert(`No se pudo cargar el dashboard: ${error.message}`);
        window.location.href = '/html/index.html';
    }
}

iniciarDashboard();

console.log('dashboard.js cargado correctamente');
