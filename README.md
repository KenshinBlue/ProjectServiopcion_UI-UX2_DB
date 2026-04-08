# Sistema de Inventario

Aplicación web de inventario conectada a MySQL con backend Node.js/Express, sesiones de servidor y contraseñas hasheadas con bcrypt.

## Alcance

- Gestión de inventario para usuarios internos.
- Roles principales: `Admin` y `Vendedor`.
- Creación y edición de usuarios solo desde la interfaz de administrador.
- Respaldo manual de la base de datos desde la pantalla de logs del admin.

## Estructura principal

- `server.js`: API backend, reglas de negocio y servidor estático.
- `js/datos.js`: cliente central para consumir la API.
- `scripts/generarHash.js`: genera hashes bcrypt para altas seguras.
- `DB/Inventario.sql`: esquema y datos base de MySQL.

## Requisitos

- Node.js 18+
- MySQL 8+

## Paso a paso para crear el primer administrador

El sistema no usa registro público. El primer usuario administrador se crea manualmente con contraseña hasheada.

1. Instala dependencias:

```bash
npm install
```

2. Crea el archivo `.env` a partir de `.env.example`:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=tu_password
DB_NAME=inventario_db
SESSION_SECRET=cambia_esta_clave_super_secreta
```

3. Ejecuta el script `DB/Inventario.sql` en MySQL para crear tablas y datos base.

4. Genera el hash bcrypt de la contraseña del administrador:

```bash
npm run hash -- "TuPasswordSegura"
```

5. Inserta el usuario administrador en MySQL. Ejemplo:

```sql
INSERT INTO usuarios (nombre_usuario, contrasena)
VALUES ('admin', 'PEGA_AQUI_EL_HASH_GENERADO');
```

6. Asegura el rol `Admin` y asígnalo al usuario:

```sql
INSERT INTO roles (nombre)
VALUES ('Admin')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

INSERT INTO usuario_rol (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u
JOIN roles r ON r.nombre = 'Admin'
WHERE u.nombre_usuario = 'admin'
ON DUPLICATE KEY UPDATE rol_id = VALUES(rol_id);
```

7. Inicia el sistema:

```bash
npm start
```

8. Entra a `http://localhost:3000` y accede con ese admin.

Desde la sección de usuarios, el admin puede crear y actualizar vendedores y otros usuarios internos.

## Módulos visibles

- Dashboard de inventario.
- Productos.
- Proveedores.
- Administración de usuarios.
- Auditoría y respaldos.

## API principal

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `GET /api/categorias`
- `GET /api/productos`
- `POST /api/productos`
- `PUT /api/productos/:id`
- `DELETE /api/productos/:id`
- `POST /api/productos/:id/solicitar-eliminacion`
- `GET /api/dashboard/resumen`
- `GET /api/dashboard/stock-bajo`
- `GET /api/proveedores`
- `POST /api/proveedores`
- `PUT /api/proveedores/:id`
- `DELETE /api/proveedores/:id`
- `GET /api/admin/usuarios`
- `POST /api/admin/usuarios`
- `PUT /api/admin/usuarios/:id`
- `GET /api/admin/auditoria`
- `POST /api/admin/backups`

## Notas

- Los respaldos generados se guardan en la carpeta `backups/`.
- `node_modules/`, `.env` y respaldos generados no deben subirse al repositorio.

