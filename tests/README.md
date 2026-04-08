# 🤖 Automatización Selenium – Serviopción

Script de automatización E2E con **Selenium WebDriver** que cubre el flujo completo:
Login → Agregar Producto → Editar Producto → Guardar Cambios → Cerrar Sesión.

---

## 📋 Requisitos previos

| Herramienta | Versión mínima |
|-------------|---------------|
| Node.js     | 18+           |
| Google Chrome | Cualquier versión reciente |
| MySQL       | 8.0+          |

---

## ⚙️ Instalación

```bash
# 1. Instalar todas las dependencias (incluye selenium-webdriver y chromedriver)
npm install

# 2. Copiar y configurar el archivo de entorno
cp .env.example .env
# Edita .env con tus credenciales de base de datos
```

---

## 🚀 Ejecución

```bash
# 1. Asegúrate de que el servidor esté corriendo
npm start

# 2. En otra terminal, ejecutar la automatización
npm run test:automation

# O directamente:
node tests/automation.js
```

---

## 🔧 Configuración del script

Edita el bloque `CONFIG` al inicio de `tests/automation.js`:

```js
const CONFIG = {
  baseUrl: 'http://localhost:3000',   // URL del servidor
  credentials: {
    usuario: 'admin',                  // Usuario administrador
    contrasena: 'admin123',            // Contraseña (según tu BD)
  },
  producto: { /* datos del producto a crear */ },
  productoEditado: { /* campos a modificar */ },
};
```

> ⚠️ **Importante:** El usuario debe tener rol **Admin** para poder crear productos.
> Genera el hash de la contraseña con `npm run hash` y actualiza la BD.

---

## 📁 Estructura del test

```
tests/
└── automation.js    ← Script principal
    ├── buildDriver()     Configura ChromeDriver
    ├── login()           Inicio de sesión
    ├── addProduct()      Agregar nuevo producto
    ├── editProduct()     Editar producto existente
    ├── saveChanges()     Validar persistencia
    └── logout()          Cerrar sesión
```

---

## 🖥️ Modo headless (sin ventana)

Para ejecutar en entornos sin interfaz gráfica (CI/CD), descomenta esta línea en `tests/automation.js`:

```js
// options.addArguments('--headless');
```

---

## 📤 Salida esperada

```
═══════════════════════════════════════════════════════
  Serviopción – Automatización Selenium WebDriver
  URL Base: http://localhost:3000
═══════════════════════════════════════════════════════

🌐 Driver de Chrome inicializado correctamente.

🔐 [LOGIN] Iniciando sesión...
✅ [LOGIN] Sesión iniciada correctamente. Dashboard visible.

➕ [ADD PRODUCT] Agregando nuevo producto...
✅ [ADD PRODUCT] Producto "Producto Automatizado" creado exitosamente.

✏️  [EDIT PRODUCT] Editando producto existente...
✅ [EDIT PRODUCT] Producto actualizado exitosamente.

💾 [SAVE CHANGES] Verificando persistencia de cambios...
✅ [SAVE CHANGES] Los cambios persisten correctamente.

🚪 [LOGOUT] Cerrando sesión...
✅ [LOGOUT] Sesión cerrada. Pantalla de login visible.

═══════════════════════════════════════════════════════
  ✅ FLUJO COMPLETO EJECUTADO EXITOSAMENTE
═══════════════════════════════════════════════════════
```
