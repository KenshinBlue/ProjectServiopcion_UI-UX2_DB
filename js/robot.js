(function robotServiopcion() {
    const CLAVE_EJECUCION = 'robot_ejecutando';
    const CLAVE_PASO = 'robot_paso';

    const info = (msg) => console.log(`%c🤖 Robot: ${msg}`, 'color: #2ecc71; font-weight: bold;');
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const esPagina = (nombreArchivo) =>
        window.location.pathname.toLowerCase().includes(nombreArchivo.toLowerCase());

    const escribirLento = async (id, texto) => {
        const el = document.getElementById(id);

        if (!el) {
            info(`No se encontró el campo ${id}`);
            return false;
        }

        el.value = '';

        for (const letra of texto) {
            el.value += letra;
            await sleep(35);
        }

        return true;
    };

    window.ejecutarPasoLogin = function ejecutarPasoLogin() {
        const usuarioInput = document.getElementById('usuario');
        const contraInput = document.getElementById('contrasena');
        const formulario = document.getElementById('formularioLogin');

        if (!usuarioInput || !contraInput || !formulario) {
            return;
        }

        info('Iniciando sesión...');
        localStorage.setItem(CLAVE_EJECUCION, 'true');
        localStorage.setItem(CLAVE_PASO, 'PRODUCTOS');

        usuarioInput.value = 'admin';
        contraInput.value = 'Admin#2026';

        setTimeout(() => {
            formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }, 700);
    };

    window.activarRobot = function activarRobot() {
        localStorage.setItem(CLAVE_EJECUCION, 'true');
        localStorage.setItem(CLAVE_PASO, 'INICIO');
        window.ejecutarPasoLogin();
    };

    const ejecutarPasoProductos = async () => {
        if (typeof abrirModalAgregar !== 'function') {
            info('No se pudo abrir el modal de producto.');
            return;
        }

        info('Preparando creación de producto...');
        abrirModalAgregar();
        await sleep(800);

        await escribirLento('codigo', `AUTO-${Math.floor(Math.random() * 999)}`);
        await escribirLento('producto', 'Producto Automatizado');
        await escribirLento('descripcion', 'Producto generado por automatización de pruebas');
        await escribirLento('categoria', 'Software');
        await escribirLento('precio', '1250000');
        await escribirLento('stock', '20');
        await escribirLento('stockMinimo', '5');

        const estado = document.getElementById('estado');
        if (estado) {
            estado.value = 'Disponible';
        }

        const formulario = document.getElementById('formularioProducto');
        if (!formulario) {
            info('No se encontró el formulario de productos.');
            return;
        }

        info('Guardando información...');
        await sleep(700);
        formulario.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));

        localStorage.removeItem(CLAVE_EJECUCION);
        localStorage.removeItem(CLAVE_PASO);

        await sleep(1500);
        info('Proceso terminado. Cerrando sesión...');
        window.confirm = () => true;

        if (typeof cerrarSesion === 'function') {
            cerrarSesion();
        }
    };

    const continuarFlujo = () => {
        if (localStorage.getItem(CLAVE_EJECUCION) !== 'true') {
            return;
        }

        const paso = localStorage.getItem(CLAVE_PASO) || 'INICIO';

        if (esPagina('index.html') && (paso === 'INICIO' || paso === 'LOGIN')) {
            window.ejecutarPasoLogin();
            return;
        }

        if (esPagina('dashboard.html')) {
            info('Dashboard detectado. Saltando a productos...');
            localStorage.setItem(CLAVE_PASO, 'PRODUCTOS');
            setTimeout(() => {
                window.location.href = 'productos.html';
            }, 1200);
            return;
        }

        if (esPagina('productos.html') && paso === 'PRODUCTOS') {
            setTimeout(() => {
                ejecutarPasoProductos();
            }, 1200);
        }
    };

    const enlazarBoton = () => {
        const boton = document.getElementById('btnAutomatizacionTotal');

        if (!boton || boton.dataset.robotVinculado === 'true') {
            return;
        }

        boton.dataset.robotVinculado = 'true';
        boton.addEventListener('click', () => window.activarRobot());
    };

    enlazarBoton();
    continuarFlujo();
})();
