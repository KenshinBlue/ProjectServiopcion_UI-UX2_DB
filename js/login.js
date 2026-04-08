/* ============================================
   LÓGICA DE LA PÁGINA DE LOGIN
   ============================================ */

function obtenerRutaPrincipal() {
    return '/html/dashboard.html';
}

// Si ya hay sesión activa, ir al dashboard
(async function verificarSesion() {
    try {
        const sesion = await BaseDatos.obtenerSesion();
        if (sesion) {
            window.location.href = obtenerRutaPrincipal();
        }
    } catch (error) {
        console.error('No se pudo verificar la sesión:', error.message);
    }
})();

// Obtener elementos del formulario
const formulario = document.getElementById('formularioLogin');
const inputUsuario = document.getElementById('usuario');
const inputContrasena = document.getElementById('contrasena');
const mensajeError = document.getElementById('mensajeError');

// Cuando se envía el formulario
formulario.addEventListener('submit', async function(evento) {
    evento.preventDefault(); // Evitar que se recargue la página
    
    // Obtener valores
    const usuario = inputUsuario.value.trim();
    const contrasena = inputContrasena.value;
    
    // Validar que no estén vacíos
    if (usuario === '' || contrasena === '') {
        mostrarError('Por favor completa todos los campos');
        return;
    }
    
    try {
        await BaseDatos.login(usuario, contrasena);
        window.location.href = obtenerRutaPrincipal();
    } catch (error) {
        mostrarError(error.message || 'Usuario o contraseña incorrectos');
        inputContrasena.value = '';
    }
});

// Función para mostrar mensajes de error
function mostrarError(mensaje) {
    mensajeError.textContent = mensaje;
    mensajeError.classList.remove('oculto');
    
    // Ocultar después de 3 segundos
    setTimeout(function() {
        mensajeError.classList.add('oculto');
    }, 3000);
}

console.log(' login.js cargado correctamente');
