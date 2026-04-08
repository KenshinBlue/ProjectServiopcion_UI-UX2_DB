/**
 * ============================================================
 *  AUTOMATIZACIÓN SELENIUM – Serviopción Sistema de Inventario
 *  Flujo: Login → Agregar Producto → Editar Producto → Logout
 * ============================================================
 *
 *  Requisitos previos:
 *    npm install selenium-webdriver chromedriver
 *
 *  Ejecución:
 *    node tests/automation.js
 * ============================================================
 */

'use strict';

// ── Importaciones ─────────────────────────────────────────────
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

// ── Configuración global ──────────────────────────────────────
const CONFIG = {
  baseUrl: 'http://localhost:3000',
  timeouts: {
    implicit: 5_000,   // ms – espera implícita
    explicit: 10_000,  // ms – espera explícita por elemento
    page: 15_000,      // ms – carga de página completa
  },
  credentials: {
    usuario: 'admin',
    contrasena: 'Admin#2026', // Ajusta según tu .env / generarHash
  },
  producto: {
    codigo: `AUTO-${Date.now()}`,   // Código único por ejecución
    nombre: 'Producto Automatizado',
    descripcion: 'Creado por script Selenium en prueba automatizada',
    categoria: 'Electrónica',
    precio: '9999',
    stock: '50',
    stockMinimo: '5',
    estado: 'Disponible',
  },
  productoEditado: {
    nombre: 'Producto Automatizado (EDITADO)',
    precio: '12500',
    descripcion: 'Descripción modificada por el script de automatización',
  },
};

// ── Utilidades ────────────────────────────────────────────────

/**
 * Pausa la ejecución el tiempo indicado.
 * @param {number} ms – milisegundos
 */
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Espera hasta que un elemento sea localizable y esté visible.
 * @param {WebDriver} driver
 * @param {By}        locator
 * @param {number}    [timeout]
 * @returns {Promise<WebElement>}
 */
async function waitFor(driver, locator, timeout = CONFIG.timeouts.explicit) {
  return driver.wait(until.elementLocated(locator), timeout).then((el) =>
    driver.wait(until.elementIsVisible(el), timeout)
  );
}

/**
 * Limpia el contenido de un input y escribe el texto dado.
 * @param {WebElement} element
 * @param {string}     text
 */
async function clearAndType(element, text) {
  await element.clear();
  await element.sendKeys(text);
}

// ── Configuración del WebDriver ───────────────────────────────

/**
 * Crea e inicializa el driver de Chrome.
 * @returns {Promise<WebDriver>}
 */
async function buildDriver() {
  const options = new chrome.Options();

  // Descomenta la siguiente línea para ejecutar sin ventana (CI/CD):
  // options.addArguments('--headless');

  options.addArguments('--no-sandbox');
  options.addArguments('--disable-dev-shm-usage');
  options.addArguments('--window-size=1366,768');

  const driver = await new Builder()
    .forBrowser('chrome')
    .setChromeOptions(options)
    .build();

  // Tiempo de espera para carga de página completa
  await driver.manage().setTimeouts({ pageLoad: CONFIG.timeouts.page });

  return driver;
}

// ── FUNCIÓN 1: login() ────────────────────────────────────────

/**
 * Navega a la página de login, ingresa credenciales y
 * valida la redirección exitosa al dashboard.
 *
 * @param {WebDriver} driver
 */
async function login(driver) {
  console.log('\n🔐 [LOGIN] Iniciando sesión...');

  // 1. Ir a la URL de login
  await driver.get(`${CONFIG.baseUrl}/html/index.html`);
  console.log(`   → Navegando a: ${CONFIG.baseUrl}/html/index.html`);

  // 2. Esperar a que el formulario esté listo
  const inputUsuario = await waitFor(driver, By.css('#usuario'));
  const inputContrasena = await waitFor(driver, By.css('#contrasena'));
  console.log('   → Formulario de login detectado.');

  // 3. Ingresar credenciales
  await clearAndType(inputUsuario, CONFIG.credentials.usuario);
  await clearAndType(inputContrasena, CONFIG.credentials.contrasena);
  console.log(`   → Credenciales ingresadas (usuario: ${CONFIG.credentials.usuario})`);

  // 4. Enviar formulario
  const btnLogin = await waitFor(driver, By.css('#formularioLogin button[type="submit"]'));
  await btnLogin.click();
  console.log('   → Botón "Iniciar Sesión" presionado.');

  // 5. Validar redirección al dashboard
  await driver.wait(
    until.urlContains('/html/dashboard.html'),
    CONFIG.timeouts.explicit,
    'El login no redirigió al dashboard en el tiempo esperado.'
  );

  // Confirmar que el elemento principal del dashboard existe
  await waitFor(driver, By.css('.contenedor-dashboard'));
  console.log('✅ [LOGIN] Sesión iniciada correctamente. Dashboard visible.');
}

// ── FUNCIÓN 2: addProduct() ───────────────────────────────────

/**
 * Navega a la sección de productos, abre el modal de creación,
 * completa el formulario, guarda el producto y valida la creación.
 *
 * @param {WebDriver} driver
 */
async function addProduct(driver) {
  console.log('\n➕ [ADD PRODUCT] Agregando nuevo producto...');

  // 1. Navegar a la sección de productos
  await driver.get(`${CONFIG.baseUrl}/html/productos.html`);
  console.log('   → Navegando a: /html/productos.html');

  // 2. Esperar a que la tabla de productos cargue
  await waitFor(driver, By.css('#tablaProductos'));
  await sleep(1_000); // Pequeña espera para que el JS cargue los datos

  // 3. Hacer clic en "Agregar Producto"
  const btnAgregar = await waitFor(driver, By.css('#btnAgregarProducto'));
  await btnAgregar.click();
  console.log('   → Modal de agregar producto abierto.');

  // 4. Esperar a que el modal esté visible
  await waitFor(driver, By.css('#modalProducto.mostrar'));

  // 5. Completar el formulario del modal
  await clearAndType(await driver.findElement(By.css('#codigo')), CONFIG.producto.codigo);
  await clearAndType(await driver.findElement(By.css('#producto')), CONFIG.producto.nombre);
  await clearAndType(await driver.findElement(By.css('#descripcion')), CONFIG.producto.descripcion);
  await clearAndType(await driver.findElement(By.css('#categoria')), CONFIG.producto.categoria);
  await clearAndType(await driver.findElement(By.css('#precio')), CONFIG.producto.precio);
  await clearAndType(await driver.findElement(By.css('#stock')), CONFIG.producto.stock);
  await clearAndType(await driver.findElement(By.css('#stockMinimo')), CONFIG.producto.stockMinimo);

  // Seleccionar estado
  const selectEstado = await driver.findElement(By.css('#estado'));
  await selectEstado.findElement(By.xpath(`option[@value="${CONFIG.producto.estado}"]`)).click();

  console.log(`   → Formulario completado (código: ${CONFIG.producto.codigo})`);

  // 6. Guardar producto
  const btnGuardar = await waitFor(driver, By.css('#formularioProducto .btn-guardar'));
  await btnGuardar.click();
  console.log('   → Botón "Guardar" presionado.');

  // 7. Manejar el alert de confirmación del navegador
  await driver.wait(until.alertIsPresent(), CONFIG.timeouts.explicit);
  const alert = await driver.switchTo().alert();
  const alertText = await alert.getText();
  console.log(`   → Alert detectado: "${alertText}"`);
  await alert.accept();

  // 8. Validar que el modal se cerró y el producto aparece en la tabla
  await driver.wait(
    until.elementIsNotVisible(await driver.findElement(By.css('#modalProducto'))),
    CONFIG.timeouts.explicit,
    'El modal no se cerró tras guardar el producto.'
  );

  // Esperar a que la tabla se actualice y buscar el producto recién creado
  await sleep(1_000);
  const tablaBody = await driver.findElement(By.css('#cuerpoTablaProductos'));
  const tablaTexto = await tablaBody.getText();

  if (tablaTexto.includes(CONFIG.producto.codigo)) {
    console.log(`✅ [ADD PRODUCT] Producto "${CONFIG.producto.nombre}" creado exitosamente.`);
  } else {
    throw new Error(`El producto con código "${CONFIG.producto.codigo}" no aparece en la tabla.`);
  }
}

// ── FUNCIÓN 3: editProduct() ──────────────────────────────────

/**
 * Busca el producto recién creado en la tabla, abre el modal de edición,
 * modifica campos clave, guarda los cambios y valida la actualización.
 *
 * @param {WebDriver} driver
 */
async function editProduct(driver) {
  console.log('\n✏️  [EDIT PRODUCT] Editando producto existente...');

  // 1. Asegurarse de estar en la página de productos
  const currentUrl = await driver.getCurrentUrl();
  if (!currentUrl.includes('productos.html')) {
    await driver.get(`${CONFIG.baseUrl}/html/productos.html`);
    await waitFor(driver, By.css('#tablaProductos'));
    await sleep(1_000);
  }

  // 2. Buscar el producto usando el campo de búsqueda
  const inputBusqueda = await waitFor(driver, By.css('#buscarProducto'));
  await clearAndType(inputBusqueda, CONFIG.producto.codigo);
  console.log(`   → Buscando producto con código: ${CONFIG.producto.codigo}`);
  await sleep(500);

  // 3. Encontrar el botón "Editar" de la fila que coincide con el código
  const filasVisibles = await driver.findElements(
    By.xpath(`//tbody[@id="cuerpoTablaProductos"]//tr[not(@style="display: none;")]`)
  );

  if (filasVisibles.length === 0) {
    throw new Error('No se encontró ninguna fila visible después de buscar el producto.');
  }

  // Clic en el botón editar de la primera fila visible
  const btnEditar = await filasVisibles[0].findElement(By.css('.btn-editar'));
  await btnEditar.click();
  console.log('   → Botón "Editar" presionado.');

  // 4. Esperar a que el modal de edición se abra
  await waitFor(driver, By.css('#modalProducto.mostrar'));
  const tituloModal = await driver.findElement(By.css('#tituloModal')).getText();
  console.log(`   → Modal abierto: "${tituloModal}"`);

  // 5. Modificar campos
  await clearAndType(
    await driver.findElement(By.css('#producto')),
    CONFIG.productoEditado.nombre
  );
  await clearAndType(
    await driver.findElement(By.css('#precio')),
    CONFIG.productoEditado.precio
  );
  await clearAndType(
    await driver.findElement(By.css('#descripcion')),
    CONFIG.productoEditado.descripcion
  );
  console.log('   → Campos modificados: nombre, precio, descripción.');

  // 6. Guardar cambios
  const btnGuardar = await waitFor(driver, By.css('#formularioProducto .btn-guardar'));
  await btnGuardar.click();
  console.log('   → Botón "Guardar" presionado.');

  // 7. Aceptar el alert de confirmación
  await driver.wait(until.alertIsPresent(), CONFIG.timeouts.explicit);
  const alert = await driver.switchTo().alert();
  const alertText = await alert.getText();
  console.log(`   → Alert detectado: "${alertText}"`);
  await alert.accept();

  // 8. Validar que el modal se cerró
  await driver.wait(
    until.elementIsNotVisible(await driver.findElement(By.css('#modalProducto'))),
    CONFIG.timeouts.explicit,
    'El modal no se cerró tras editar el producto.'
  );

  // 9. Verificar que el nombre actualizado aparece en la tabla
  await sleep(1_000);

  // Limpiar búsqueda para ver todos los productos
  await clearAndType(inputBusqueda, '');
  await sleep(500);

  const tablaBody = await driver.findElement(By.css('#cuerpoTablaProductos'));
  const tablaTexto = await tablaBody.getText();

  if (tablaTexto.includes(CONFIG.productoEditado.nombre)) {
    console.log(`✅ [EDIT PRODUCT] Producto actualizado a "${CONFIG.productoEditado.nombre}" exitosamente.`);
  } else {
    throw new Error(`El nombre editado "${CONFIG.productoEditado.nombre}" no aparece en la tabla.`);
  }
}

// ── FUNCIÓN 4: saveChanges() ──────────────────────────────────

/**
 * Función auxiliar de validación: confirma que los cambios persistieron
 * recargando la página y verificando los datos en la tabla.
 *
 * @param {WebDriver} driver
 */
async function saveChanges(driver) {
  console.log('\n💾 [SAVE CHANGES] Verificando persistencia de cambios...');

  // Recargar la página para forzar una nueva consulta al servidor
  await driver.navigate().refresh();
  await waitFor(driver, By.css('#tablaProductos'));
  await sleep(1_500);

  // Buscar el producto editado para confirmar persistencia
  const inputBusqueda = await waitFor(driver, By.css('#buscarProducto'));
  await clearAndType(inputBusqueda, CONFIG.producto.codigo);
  await sleep(600);

  const tablaBody = await driver.findElement(By.css('#cuerpoTablaProductos'));
  const tablaTexto = await tablaBody.getText();

  if (tablaTexto.includes(CONFIG.productoEditado.nombre)) {
    console.log('✅ [SAVE CHANGES] Los cambios persisten correctamente después de recargar la página.');
  } else {
    throw new Error('Los cambios no persisten tras recargar. El servidor puede no haber guardado la actualización.');
  }
}

// ── FUNCIÓN 5: logout() ───────────────────────────────────────

/**
 * Hace clic en el botón "Cerrar Sesión", acepta el confirm del navegador
 * y valida el retorno a la pantalla de login.
 *
 * @param {WebDriver} driver
 */
async function logout(driver) {
  console.log('\n🚪 [LOGOUT] Cerrando sesión...');

  // 1. Localizar el botón de cerrar sesión en el menú lateral
  const btnLogout = await waitFor(
    driver,
    By.xpath(`//button[contains(text(), 'Cerrar Sesión') or contains(text(), 'Cerrar sesi')]`)
  );
  await btnLogout.click();
  console.log('   → Botón "Cerrar Sesión" presionado.');

  // 2. Aceptar el confirm de "¿Estás seguro?"
  await driver.wait(until.alertIsPresent(), CONFIG.timeouts.explicit);
  const confirm = await driver.switchTo().alert();
  console.log(`   → Confirm detectado: "${await confirm.getText()}"`);
  await confirm.accept();

  // 3. Validar retorno a la página de login
  await driver.wait(
    until.urlContains('/html/index.html'),
    CONFIG.timeouts.explicit,
    'No se redirigió a la pantalla de login después del logout.'
  );

  await waitFor(driver, By.css('#formularioLogin'));
  console.log('✅ [LOGOUT] Sesión cerrada. Pantalla de login visible.');
}

// ── FUNCIÓN PRINCIPAL ─────────────────────────────────────────

/**
 * Orquesta el flujo completo de automatización.
 */
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Serviopción – Automatización Selenium WebDriver');
  console.log('  URL Base:', CONFIG.baseUrl);
  console.log('═══════════════════════════════════════════════════════');

  let driver = null;

  try {
    // Inicializar el driver de Chrome
    driver = await buildDriver();
    console.log('\n🌐 Driver de Chrome inicializado correctamente.');

    // ── Ejecutar flujo completo ──
    await login(driver);
    await addProduct(driver);
    await editProduct(driver);
    await saveChanges(driver);
    await logout(driver);

    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  ✅ FLUJO COMPLETO EJECUTADO EXITOSAMENTE');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ ERROR durante la automatización:');
    console.error('  ', error.message);
    console.error('\n  Stack trace:');
    console.error(error.stack);
    process.exitCode = 1;

  } finally {
    // Cerrar el navegador siempre, haya o no error
    if (driver) {
      await sleep(1_500); // Pequeña pausa visual antes de cerrar
      await driver.quit();
      console.log('\n🔒 Navegador cerrado.');
    }
  }
}

// ── Punto de entrada ──────────────────────────────────────────
main();
