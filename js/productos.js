/* ============================================
   LÓGICA DE GESTIÓN DE PRODUCTOS
   ============================================ */

// Cache local de productos para búsquedas y edición
let productosCache = [];

// Variable para saber si estamos editando
let productoEditandoId = null;
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

// Función para mostrar todos los productos en la tabla
async function mostrarProductos() {
    const tbody = document.getElementById('cuerpoTablaProductos');

    try {
        productosCache = await BaseDatos.obtenerProductos();
        tbody.innerHTML = '';
        const esAdmin = esRolAdmin(sesionActual?.rol);

        if (productosCache.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="9" style="text-align: center; padding: 20px; color: #666;">
                        No hay productos registrados. ¡Agrega tu primer producto!
                    </td>
                </tr>
            `;
            return;
        }

        productosCache.forEach((producto) => {
            const fila = document.createElement('tr');
            fila.innerHTML = `
                <td>${producto.codigo}</td>
                <td><strong>${producto.producto}</strong></td>
                <td>${producto.descripcion}</td>
                <td>${producto.categoria}</td>
                <td>${formatearMoneda(producto.precio)}</td>
                <td>${producto.stock}</td>
                <td>${producto.stockMinimo}</td>
                <td>${obtenerBadgeStock(producto.stock, producto.stockMinimo)}</td>
                <td>
                    <button class="btn-editar" onclick="editarProducto(${producto.id})">
                        ✏️ Editar
                    </button>
                    ${esAdmin
                        ? `<button class="btn-eliminar" onclick="eliminarProducto(${producto.id})">🗑️ Eliminar</button>`
                        : `<button class="btn-eliminar" onclick="solicitarEliminacionProducto(${producto.id})">📩 Solicitar eliminación</button>`}
                </td>
            `;
            tbody.appendChild(fila);
        });
    } catch (error) {
        if (error.status === 401) {
            window.location.href = '/html/index.html';
            return;
        }

        tbody.innerHTML = `
            <tr>
                <td colspan="9" style="text-align: center; padding: 20px; color: #666;">
                    Error cargando productos: ${error.message}
                </td>
            </tr>
        `;
    }
}

async function solicitarEliminacionProducto(id) {
    const producto = productosCache.find((p) => Number(p.id) === Number(id));

    if (!producto) {
        alert('Producto no encontrado');
        return;
    }

    if (confirm(`¿Deseas solicitar al administrador la eliminación de "${producto.producto}"?`)) {
        try {
            await BaseDatos.solicitarEliminacionProducto(id);
            alert('Solicitud enviada al administrador');
        } catch (error) {
            alert(`No se pudo enviar la solicitud: ${error.message}`);
        }
    }
}

async function cargarCategorias() {
    const dataList = document.getElementById('listaCategorias');

    if (!dataList) {
        return;
    }

    try {
        const categorias = await BaseDatos.obtenerCategorias();
        dataList.innerHTML = '';
        categorias.forEach((categoria) => {
            const option = document.createElement('option');
            option.value = categoria.nombre;
            dataList.appendChild(option);
        });
    } catch (error) {
        console.error('No se pudieron cargar categorías:', error.message);
    }
}

// Función para abrir el modal para agregar producto
function abrirModalAgregar() {
    productoEditandoId = null;
    document.getElementById('tituloModal').textContent = 'Agregar Producto';
    document.getElementById('formularioProducto').reset();
    document.getElementById('modalProducto').classList.add('mostrar');
}

// Función para cerrar el modal
function cerrarModal() {
    document.getElementById('modalProducto').classList.remove('mostrar');
    productoEditandoId = null;
}

// Función para editar un producto
function editarProducto(id) {
    const producto = productosCache.find((p) => Number(p.id) === Number(id));

    if (!producto) {
        alert('Producto no encontrado');
        return;
    }
    
    // Guardar el ID del producto que estamos editando
    productoEditandoId = id;
    
    // Cambiar título del modal
    document.getElementById('tituloModal').textContent = 'Editar Producto';
    
    // Llenar el formulario con los datos del producto
    document.getElementById('codigo').value = producto.codigo;
    document.getElementById('producto').value = producto.producto;
    document.getElementById('descripcion').value = producto.descripcion;
    document.getElementById('categoria').value = producto.categoria;
    document.getElementById('precio').value = producto.precio;
    document.getElementById('stock').value = producto.stock;
    document.getElementById('stockMinimo').value = producto.stockMinimo;
    document.getElementById('estado').value = producto.estado;
    
    // Mostrar el modal
    document.getElementById('modalProducto').classList.add('mostrar');
}

// Función para eliminar un producto
async function eliminarProducto(id) {
    const producto = productosCache.find((p) => Number(p.id) === Number(id));

    if (!producto) {
        alert('Producto no encontrado');
        return;
    }

    if (confirm(`¿Estás seguro de eliminar "${producto.producto}"?`)) {
        try {
            await BaseDatos.eliminarProducto(id);
            await mostrarProductos();
            alert('Producto eliminado correctamente');
        } catch (error) {
            alert(`No se pudo eliminar el producto: ${error.message}`);
        }
    }
}

// Manejar el envío del formulario
document.getElementById('formularioProducto').addEventListener('submit', async function(evento) {
    evento.preventDefault();

    // Obtener los datos del formulario
    const datosProducto = {
        codigo: document.getElementById('codigo').value,
        producto: document.getElementById('producto').value,
        descripcion: document.getElementById('descripcion').value,
        categoria: document.getElementById('categoria').value,
        precio: parseFloat(document.getElementById('precio').value),
        stock: parseInt(document.getElementById('stock').value),
        stockMinimo: parseInt(document.getElementById('stockMinimo').value),
        estado: document.getElementById('estado').value
    };

    try {
        if (!productoEditandoId && !esRolAdmin(sesionActual?.rol)) {
            alert('El rol Vendedor no puede crear nuevos productos.');
            return;
        }

        if (productoEditandoId) {
            await BaseDatos.actualizarProducto(productoEditandoId, datosProducto);
            alert('Producto actualizado correctamente');
        } else {
            await BaseDatos.agregarProducto(datosProducto);
            alert('Producto agregado correctamente');
        }

        cerrarModal();
        await mostrarProductos();
        await cargarCategorias();
    } catch (error) {
        alert(`No se pudo guardar el producto: ${error.message}`);
    }
});

// Función para buscar productos
document.getElementById('buscarProducto').addEventListener('input', function() {
    const textoBusqueda = this.value.toLowerCase();
    const filas = document.querySelectorAll('#cuerpoTablaProductos tr');
    
    filas.forEach(fila => {
        const texto = fila.textContent.toLowerCase();
        
        if (texto.includes(textoBusqueda)) {
            fila.style.display = '';
        } else {
            fila.style.display = 'none';
        }
    });
});

// Cerrar modal al hacer clic fuera de él
document.getElementById('modalProducto').addEventListener('click', function(evento) {
    if (evento.target === this) {
        cerrarModal();
    }
});

// Inicializar pantalla
async function iniciarPantallaProductos() {
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

        const btnAgregar = document.getElementById('btnAgregarProducto');
        if (btnAgregar) {
            btnAgregar.style.display = esAdmin ? 'inline-block' : 'none';
        }

        await cargarCategorias();
        await mostrarProductos();
    } catch (error) {
        alert(`No se pudo cargar la pantalla: ${error.message}`);
        window.location.href = '/html/index.html';
    }
}

iniciarPantallaProductos();

console.log(' productos.js cargado correctamente');
