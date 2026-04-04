/* ============================================
   CLIENTE DE API
   ============================================ */

const BaseDatos = {
    async request(url, options = {}) {
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            },
            ...options
        });

        const contentType = response.headers.get('content-type') || '';
        const body = contentType.includes('application/json')
            ? await response.json()
            : null;

        if (!response.ok) {
            const mensaje = body?.detalle
                ? `${body?.error || 'Error en la solicitud'} (${body.detalle})`
                : (body?.error || `Error HTTP ${response.status}: ${response.statusText || 'sin detalle'}`);
            const error = new Error(mensaje);
            error.status = response.status;
            throw error;
        }

        return body;
    },

    async login(usuario, contrasena) {
        return this.request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ usuario, contrasena })
        });
    },

    async crearUsuarioVendedor(usuario, contrasena) {
        return this.request('/api/admin/usuarios/vendedor', {
            method: 'POST',
            body: JSON.stringify({ usuario, contrasena })
        });
    },

    async logout() {
        return this.request('/api/auth/logout', { method: 'POST' });
    },

    async tieneSesion() {
        const data = await this.request('/api/auth/me');
        return data.authenticated === true;
    },

    async obtenerSesion() {
        const data = await this.request('/api/auth/me');
        return data.authenticated ? data.user : null;
    },

    async obtenerCategorias() {
        return this.request('/api/categorias');
    },

    async obtenerProductos() {
        return this.request('/api/productos');
    },

    async obtenerProductoPorId(id) {
        const productos = await this.obtenerProductos();
        return productos.find((p) => Number(p.id) === Number(id)) || null;
    },

    async agregarProducto(producto) {
        return this.request('/api/productos', {
            method: 'POST',
            body: JSON.stringify(producto)
        });
    },

    async actualizarProducto(id, datosNuevos) {
        return this.request(`/api/productos/${id}`, {
            method: 'PUT',
            body: JSON.stringify(datosNuevos)
        });
    },

    async eliminarProducto(id) {
        return this.request(`/api/productos/${id}`, {
            method: 'DELETE'
        });
    },

    async solicitarEliminacionProducto(id) {
        return this.request(`/api/productos/${id}/solicitar-eliminacion`, {
            method: 'POST'
        });
    },

    async obtenerProductosStockBajo() {
        return this.request('/api/dashboard/stock-bajo');
    },

    async obtenerResumenDashboard() {
        return this.request('/api/dashboard/resumen');
    },

    async obtenerUltimosMovimientosDashboard() {
        return this.request('/api/dashboard/ultimos-movimientos');
    },

    async obtenerProveedores() {
        return this.request('/api/proveedores');
    },

    async crearProveedor(datos) {
        return this.request('/api/proveedores', {
            method: 'POST',
            body: JSON.stringify(datos)
        });
    },

    async actualizarProveedor(id, datos) {
        return this.request(`/api/proveedores/${id}`, {
            method: 'PUT',
            body: JSON.stringify(datos)
        });
    },

    async eliminarProveedor(id) {
        return this.request(`/api/proveedores/${id}`, {
            method: 'DELETE'
        });
    },

    async obtenerProductosProveedor(proveedorId) {
        return this.request(`/api/proveedores/${proveedorId}/productos`);
    },

    async guardarProductosProveedor(proveedorId, productoIds) {
        return this.request(`/api/proveedores/${proveedorId}/productos`, {
            method: 'PUT',
            body: JSON.stringify({ productoIds })
        });
    },

    async obtenerUsuariosAdmin() {
        return this.request('/api/admin/usuarios');
    },

    async crearUsuarioAdmin(datos) {
        return this.request('/api/admin/usuarios', {
            method: 'POST',
            body: JSON.stringify(datos)
        });
    },

    async actualizarUsuarioAdmin(id, datos) {
        return this.request(`/api/admin/usuarios/${id}`, {
            method: 'PUT',
            body: JSON.stringify(datos)
        });
    },

    async obtenerAuditoria(filtros = {}) {
        const query = new URLSearchParams();

        if (filtros.desde) query.set('desde', filtros.desde);
        if (filtros.hasta) query.set('hasta', filtros.hasta);
        if (filtros.texto) query.set('texto', filtros.texto);
        if (filtros.limite) query.set('limite', String(filtros.limite));

        const suffix = query.toString() ? `?${query.toString()}` : '';
        return this.request(`/api/admin/auditoria${suffix}`);
    },

    async generarRespaldoBaseDeDatos() {
        return this.request('/api/admin/backups', {
            method: 'POST'
        });
    },

    async obtenerMovimientos(filtros = {}) {
        const query = new URLSearchParams();

        if (filtros.desde) query.set('desde', filtros.desde);
        if (filtros.hasta) query.set('hasta', filtros.hasta);
        if (filtros.producto) query.set('producto', filtros.producto);
        if (filtros.tipo) query.set('tipo', filtros.tipo);

        const suffix = query.toString() ? `?${query.toString()}` : '';
        return this.request(`/api/movimientos${suffix}`);
    },

    descargarMovimientosCsv(filtros = {}) {
        const query = new URLSearchParams();

        if (filtros.desde) query.set('desde', filtros.desde);
        if (filtros.hasta) query.set('hasta', filtros.hasta);
        if (filtros.producto) query.set('producto', filtros.producto);
        if (filtros.tipo) query.set('tipo', filtros.tipo);

        const suffix = query.toString() ? `?${query.toString()}` : '';
        window.location.href = `/api/reportes/movimientos.csv${suffix}`;
    }
};

console.log('datos.js cargado correctamente');
