require('dotenv').config();

const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');

const app = express();

const PORT = Number(process.env.PORT || 3000);
const BACKUPS_DIR = path.join(__dirname, 'backups');
const DB_CONFIG = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'CONTRASEÑA_DE_ROOT',
  database: process.env.DB_NAME || 'inventario_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

const pool = mysql.createPool(DB_CONFIG);

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'cambiar_en_produccion',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  return next();
}

function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  if (!/admin/i.test(String(req.session.user.rol || ''))) {
    return res.status(403).json({ error: 'Acceso restringido a administrador' });
  }

  return next();
}

function hasRole(user, roleName) {
  return String(user?.rol || '')
    .split(',')
    .map((role) => role.trim().toLowerCase())
    .includes(String(roleName || '').trim().toLowerCase());
}

function requireStaff(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }

  const allowed = ['admin', 'vendedor', 'revisor'].some((role) => hasRole(req.session.user, role));

  if (!allowed) {
    return res.status(403).json({ error: 'Acceso restringido para este rol' });
  }

  return next();
}

function normalizeRoleName(role) {
  return String(role || '').trim();
}

function parseRolesInput(roles) {
  if (!Array.isArray(roles)) {
    return [];
  }

  const uniqueRoles = [...new Set(roles.map(normalizeRoleName).filter(Boolean))];
  return uniqueRoles;
}

async function registrarLog(usuario, accion) {
  await pool.query(
    `INSERT INTO logs (usuario, accion)
     VALUES (?, ?)`,
    [usuario, accion]
  );
}

async function registrarMovimientoBitacora(conn, movimiento) {
  await conn.query(
    `
    INSERT INTO movimientos_inventario (
      producto_id,
      tipo_movimiento,
      cantidad,
      stock_anterior,
      stock_nuevo,
      usuario_id,
      usuario_nombre,
      accion,
      referencia
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      movimiento.productoId,
      movimiento.tipoMovimiento,
      movimiento.cantidad,
      movimiento.stockAnterior,
      movimiento.stockNuevo,
      movimiento.usuarioId,
      movimiento.usuarioNombre,
      movimiento.accion,
      movimiento.referencia,
    ]
  );
}

function csvEscape(value) {
  if (value == null) {
    return '""';
  }

  const text = String(value).replace(/"/g, '""');
  return `"${text}"`;
}

function mapProductoDbToUi(row) {
  return {
    id: row.id,
    codigo: row.codigo,
    producto: row.producto,
    descripcion: row.descripcion,
    categoria: row.categoria,
    precio: Number(row.precio),
    stock: Number(row.stock),
    stockMinimo: Number(row.stock_minimo),
    estado: row.estado,
  };
}

function formatTimestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function escapeSqlValue(value) {
  if (value == null) {
    return 'NULL';
  }

  if (value instanceof Date) {
    const iso = value.toISOString().slice(0, 19).replace('T', ' ');
    return `'${iso}'`;
  }

  if (Buffer.isBuffer(value)) {
    return `X'${value.toString('hex')}'`;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'NULL';
  }

  if (typeof value === 'boolean') {
    return value ? '1' : '0';
  }

  const text = String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');

  return `'${text}'`;
}

async function generarRespaldoBaseDeDatos() {
  const conn = await pool.getConnection();

  try {
    await fs.mkdir(BACKUPS_DIR, { recursive: true });

    const filename = `backup_${DB_CONFIG.database}_${formatTimestampForFilename()}.sql`;
    const filePath = path.join(BACKUPS_DIR, filename);

    const lines = [];
    lines.push('-- ============================================');
    lines.push('-- Respaldo automático generado por Serviopción');
    lines.push(`-- Base de datos: ${DB_CONFIG.database}`);
    lines.push(`-- Fecha: ${new Date().toISOString()}`);
    lines.push('-- ============================================');
    lines.push('SET FOREIGN_KEY_CHECKS = 0;');
    lines.push(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database}\`;`);
    lines.push(`USE \`${DB_CONFIG.database}\`;`);
    lines.push('');

    const [tablesRows] = await conn.query('SHOW TABLES');
    const tables = tablesRows.map((row) => Object.values(row)[0]);

    for (const tableName of tables) {
      const [createRows] = await conn.query(`SHOW CREATE TABLE \`${tableName}\``);
      const createRow = createRows[0] || {};
      const createStatement = createRow['Create Table'];

      lines.push(`-- Tabla: ${tableName}`);
      lines.push(`DROP TABLE IF EXISTS \`${tableName}\`;`);
      lines.push(`${createStatement};`);

      const [dataRows] = await conn.query(`SELECT * FROM \`${tableName}\``);

      if (dataRows.length > 0) {
        const columns = Object.keys(dataRows[0]);
        const columnsSql = columns.map((col) => `\`${col}\``).join(', ');
        const valuesSql = dataRows
          .map((row) => `(${columns.map((col) => escapeSqlValue(row[col])).join(', ')})`)
          .join(',\n');

        lines.push(`INSERT INTO \`${tableName}\` (${columnsSql}) VALUES`);
        lines.push(`${valuesSql};`);
      }

      lines.push('');
    }

    lines.push('SET FOREIGN_KEY_CHECKS = 1;');

    await fs.writeFile(filePath, lines.join('\n'), 'utf8');
    return { filename, filePath };
  } finally {
    conn.release();
  }
}

app.post('/api/auth/login', async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;

    if (!usuario || !contrasena) {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }

    const [rows] = await pool.query(
      `
      SELECT
        u.id,
        u.nombre_usuario,
        u.contrasena,
        COALESCE(GROUP_CONCAT(r.nombre ORDER BY r.nombre SEPARATOR ', '), 'Sin rol') AS roles
      FROM usuarios u
      LEFT JOIN usuario_rol ur ON ur.usuario_id = u.id
      LEFT JOIN roles r ON r.id = ur.rol_id
      WHERE u.nombre_usuario = ?
      GROUP BY u.id, u.nombre_usuario, u.contrasena
      LIMIT 1
      `,
      [usuario]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = rows[0];
    const isValid = await bcrypt.compare(contrasena, user.contrasena);

    if (!isValid) {
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    req.session.user = {
      id: user.id,
      usuario: user.nombre_usuario,
      nombre: user.nombre_usuario,
      rol: user.roles,
    };

    await registrarLog(user.nombre_usuario, 'Inicio de sesión');

    return res.json({ ok: true, user: req.session.user });
  } catch (error) {
    return res.status(500).json({ error: 'Error al iniciar sesión', detalle: error.message });
  }
});

app.post('/api/admin/usuarios', requireAuth, requireAdmin, async (req, res) => {
  const { usuario, contrasena, roles } = req.body;

  if (!usuario || !contrasena) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  const rolesFinales = parseRolesInput(roles);

  if (rolesFinales.length === 0) {
    return res.status(400).json({ error: 'Debe asignar al menos un rol' });
  }

  const usuarioLimpio = String(usuario).trim();

  if (usuarioLimpio.length < 4 || usuarioLimpio.length > 100) {
    return res.status(400).json({ error: 'El usuario debe tener entre 4 y 100 caracteres' });
  }

  if (String(contrasena).length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [existingUser] = await conn.query(
      'SELECT id FROM usuarios WHERE nombre_usuario = ? LIMIT 1',
      [usuarioLimpio]
    );

    if (existingUser.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }

    const hash = await bcrypt.hash(String(contrasena), 12);

    const [insertUser] = await conn.query(
      'INSERT INTO usuarios (nombre_usuario, contrasena) VALUES (?, ?)',
      [usuarioLimpio, hash]
    );

    for (const rol of rolesFinales) {
      await conn.query(
        'INSERT INTO roles (nombre) VALUES (?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)',
        [rol]
      );

      const [roleRow] = await conn.query(
        'SELECT id FROM roles WHERE nombre = ? LIMIT 1',
        [rol]
      );

      if (roleRow.length === 0) {
        await conn.rollback();
        return res.status(500).json({ error: `No se pudo obtener el rol ${rol}` });
      }

      await conn.query(
        'INSERT INTO usuario_rol (usuario_id, rol_id) VALUES (?, ?)',
        [insertUser.insertId, roleRow[0].id]
      );
    }

    await conn.commit();

    await registrarLog(req.session.user.usuario, `Creó usuario ${usuarioLimpio} con roles: ${rolesFinales.join(', ')}`);

    return res.status(201).json({
      ok: true,
      message: 'Usuario creado correctamente',
      user: {
        id: insertUser.insertId,
        usuario: usuarioLimpio,
        roles: rolesFinales,
      },
    });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ error: 'Error creando usuario', detalle: error.message });
  } finally {
    conn.release();
  }
});

app.get('/api/admin/usuarios', requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        u.id,
        u.nombre_usuario AS usuario,
        COALESCE(GROUP_CONCAT(r.nombre ORDER BY r.nombre SEPARATOR ', '), 'Sin rol') AS roles
      FROM usuarios u
      LEFT JOIN usuario_rol ur ON ur.usuario_id = u.id
      LEFT JOIN roles r ON r.id = ur.rol_id
      GROUP BY u.id, u.nombre_usuario
      ORDER BY u.nombre_usuario ASC
      `
    );

    const users = rows.map((row) => ({
      id: Number(row.id),
      usuario: row.usuario,
      rolesTexto: row.roles,
      roles: String(row.roles || '')
        .split(',')
        .map((r) => r.trim())
        .filter((r) => r && r !== 'Sin rol'),
    }));

    return res.json(users);
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando usuarios', detalle: error.message });
  }
});

app.put('/api/admin/usuarios/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = Number(req.params.id);
  const { usuario, contrasenaNueva, roles } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'ID de usuario inválido' });
  }

  const rolesFinales = parseRolesInput(roles);

  if (rolesFinales.length === 0) {
    return res.status(400).json({ error: 'Debe asignar al menos un rol' });
  }

  const usuarioLimpio = String(usuario || '').trim();

  if (!usuarioLimpio || usuarioLimpio.length < 4 || usuarioLimpio.length > 100) {
    return res.status(400).json({ error: 'Usuario inválido' });
  }

  if (contrasenaNueva && String(contrasenaNueva).length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [exists] = await conn.query('SELECT id FROM usuarios WHERE id = ? LIMIT 1', [userId]);

    if (exists.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const [duplicado] = await conn.query(
      'SELECT id FROM usuarios WHERE nombre_usuario = ? AND id <> ? LIMIT 1',
      [usuarioLimpio, userId]
    );

    if (duplicado.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
    }

    await conn.query('UPDATE usuarios SET nombre_usuario = ? WHERE id = ?', [usuarioLimpio, userId]);

    if (contrasenaNueva) {
      const hash = await bcrypt.hash(String(contrasenaNueva), 12);
      await conn.query('UPDATE usuarios SET contrasena = ? WHERE id = ?', [hash, userId]);
    }

    await conn.query('DELETE FROM usuario_rol WHERE usuario_id = ?', [userId]);

    for (const rol of rolesFinales) {
      await conn.query(
        'INSERT INTO roles (nombre) VALUES (?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)',
        [rol]
      );

      const [roleRow] = await conn.query('SELECT id FROM roles WHERE nombre = ? LIMIT 1', [rol]);

      if (roleRow.length === 0) {
        await conn.rollback();
        return res.status(500).json({ error: `No se pudo obtener el rol ${rol}` });
      }

      await conn.query('INSERT INTO usuario_rol (usuario_id, rol_id) VALUES (?, ?)', [userId, roleRow[0].id]);
    }

    await conn.commit();

    await registrarLog(
      req.session.user.usuario,
      `Editó usuario ${usuarioLimpio}; roles: ${rolesFinales.join(', ')}${contrasenaNueva ? '; contraseña actualizada' : ''}`
    );

    return res.json({ ok: true, message: 'Usuario actualizado correctamente' });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ error: 'Error actualizando usuario', detalle: error.message });
  } finally {
    conn.release();
  }
});

app.post('/api/admin/usuarios/vendedor', requireAuth, requireAdmin, async (req, res) => {
  const { usuario, contrasena } = req.body;

  if (!usuario || !contrasena) {
    return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
  }

  const usuarioLimpio = String(usuario).trim();

  if (usuarioLimpio.length < 4 || usuarioLimpio.length > 100) {
    return res.status(400).json({ error: 'El usuario debe tener entre 4 y 100 caracteres' });
  }

  if (String(contrasena).length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [existingUser] = await conn.query(
      'SELECT id FROM usuarios WHERE nombre_usuario = ? LIMIT 1',
      [usuarioLimpio]
    );

    if (existingUser.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }

    const hash = await bcrypt.hash(String(contrasena), 12);

    const [insertUser] = await conn.query(
      'INSERT INTO usuarios (nombre_usuario, contrasena) VALUES (?, ?)',
      [usuarioLimpio, hash]
    );

    await conn.query(
      'INSERT INTO roles (nombre) VALUES (?) ON DUPLICATE KEY UPDATE nombre = VALUES(nombre)',
      ['Vendedor']
    );

    const [roleRow] = await conn.query('SELECT id FROM roles WHERE nombre = ? LIMIT 1', ['Vendedor']);

    if (roleRow.length === 0) {
      await conn.rollback();
      return res.status(500).json({ error: 'No se pudo obtener el rol Vendedor' });
    }

    await conn.query('INSERT INTO usuario_rol (usuario_id, rol_id) VALUES (?, ?)', [insertUser.insertId, roleRow[0].id]);

    await conn.commit();
    await registrarLog(req.session.user.usuario, `Creó usuario vendedor ${usuarioLimpio}`);

    return res.status(201).json({
      ok: true,
      message: 'Usuario vendedor creado correctamente',
      user: {
        id: insertUser.insertId,
        usuario: usuarioLimpio,
        rol: 'Vendedor',
      },
    });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ error: 'Error creando usuario vendedor', detalle: error.message });
  } finally {
    conn.release();
  }
});

app.get('/api/admin/auditoria', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { desde, hasta, texto, limite } = req.query;
    const limitValue = Math.min(Math.max(Number(limite) || 200, 1), 1000);

    const [logsRows] = await pool.query(
      `
      SELECT
        id,
        usuario,
        accion,
        fecha_hora,
        'LOG' AS origen
      FROM logs
      WHERE (? IS NULL OR fecha_hora >= ?)
        AND (? IS NULL OR fecha_hora <= ?)
        AND (? IS NULL OR accion LIKE ? OR usuario LIKE ?)
      ORDER BY fecha_hora DESC
      LIMIT ?
      `,
      [
        desde || null,
        desde || null,
        hasta || null,
        hasta || null,
        texto || null,
        texto ? `%${texto}%` : null,
        texto ? `%${texto}%` : null,
        limitValue,
      ]
    );

    const [movRows] = await pool.query(
      `
      SELECT
        m.id,
        m.usuario_nombre AS usuario,
        CONCAT('MOVIMIENTO ', m.tipo_movimiento, ': ', p.codigo, ' - ', p.producto, ' (', m.accion, ')') AS accion,
        m.fecha_movimiento AS fecha_hora,
        'MOVIMIENTO' AS origen
      FROM movimientos_inventario m
      INNER JOIN productos p ON p.id = m.producto_id
      WHERE (? IS NULL OR m.fecha_movimiento >= ?)
        AND (? IS NULL OR m.fecha_movimiento <= ?)
        AND (? IS NULL OR m.accion LIKE ? OR m.usuario_nombre LIKE ? OR p.codigo LIKE ? OR p.producto LIKE ?)
      ORDER BY m.fecha_movimiento DESC
      LIMIT ?
      `,
      [
        desde || null,
        desde || null,
        hasta || null,
        hasta || null,
        texto || null,
        texto ? `%${texto}%` : null,
        texto ? `%${texto}%` : null,
        texto ? `%${texto}%` : null,
        texto ? `%${texto}%` : null,
        limitValue,
      ]
    );

    const combinado = [...logsRows, ...movRows]
      .sort((a, b) => new Date(b.fecha_hora) - new Date(a.fecha_hora))
      .slice(0, limitValue);

    return res.json(combinado);
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando auditoría', detalle: error.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const usuario = req.session?.user?.usuario || 'desconocido';

  req.session.destroy(() => {
    registrarLog(usuario, 'Cierre de sesión').catch(() => null);
    res.clearCookie('connect.sid');
    return res.json({ ok: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session || !req.session.user) {
    return res.json({ authenticated: false });
  }

  return res.json({ authenticated: true, user: req.session.user });
});

app.get('/api/categorias', requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, nombre FROM categorias ORDER BY nombre');
    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando categorías', detalle: error.message });
  }
});

app.get('/api/productos', requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.codigo,
        p.producto,
        p.descripcion,
        c.nombre AS categoria,
        p.precio,
        i.stock,
        i.stock_minimo,
        i.estado
      FROM productos p
      INNER JOIN categorias c ON c.id = p.categoria_id
      INNER JOIN inventario i ON i.producto_id = p.id
      ORDER BY p.id DESC
      `
    );

    return res.json(rows.map(mapProductoDbToUi));
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando productos', detalle: error.message });
  }
});

app.post('/api/productos', requireAuth, requireAdmin, async (req, res) => {
  const { codigo, producto, descripcion, categoria, precio, stock, stockMinimo, estado } = req.body;

  if (!codigo || !producto || !descripcion || !categoria || precio == null || stock == null || stockMinimo == null || !estado) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }

  const numericPrecio = Number(precio);
  const numericStock = Number(stock);
  const numericStockMinimo = Number(stockMinimo);

  if (Number.isNaN(numericPrecio) || numericPrecio < 0) {
    return res.status(400).json({ error: 'Precio inválido' });
  }

  if (Number.isNaN(numericStock) || numericStock < 0) {
    return res.status(400).json({ error: 'Stock inválido' });
  }

  if (Number.isNaN(numericStockMinimo) || numericStockMinimo < 0) {
    return res.status(400).json({ error: 'Stock mínimo inválido' });
  }

  const conn = await pool.getConnection();
  const usuarioSesion = req.session.user;

  try {
    await conn.beginTransaction();

    let categoriaId;
    const [catRows] = await conn.query('SELECT id FROM categorias WHERE nombre = ? LIMIT 1', [categoria]);

    if (catRows.length > 0) {
      categoriaId = catRows[0].id;
    } else {
      const [insertCat] = await conn.query('INSERT INTO categorias (nombre) VALUES (?)', [categoria]);
      categoriaId = insertCat.insertId;
    }

    const [insertProducto] = await conn.query(
      `INSERT INTO productos (codigo, producto, descripcion, categoria_id, precio)
       VALUES (?, ?, ?, ?, ?)`,
      [codigo, producto, descripcion, categoriaId, numericPrecio]
    );

    await conn.query(
      `INSERT INTO inventario (producto_id, stock, stock_minimo, estado)
       VALUES (?, ?, ?, ?)`,
      [insertProducto.insertId, numericStock, numericStockMinimo, estado]
    );

    await registrarMovimientoBitacora(conn, {
      productoId: insertProducto.insertId,
      tipoMovimiento: 'ENTRADA',
      cantidad: numericStock,
      stockAnterior: 0,
      stockNuevo: numericStock,
      usuarioId: usuarioSesion.id,
      usuarioNombre: usuarioSesion.usuario,
      accion: 'Creación de producto',
      referencia: `Alta inicial de producto ${codigo}`,
    });

    await conn.commit();

    await registrarLog(usuarioSesion.usuario, `Creó producto ${codigo}`);

    const [createdRows] = await pool.query(
      `
      SELECT
        p.id,
        p.codigo,
        p.producto,
        p.descripcion,
        c.nombre AS categoria,
        p.precio,
        i.stock,
        i.stock_minimo,
        i.estado
      FROM productos p
      INNER JOIN categorias c ON c.id = p.categoria_id
      INNER JOIN inventario i ON i.producto_id = p.id
      WHERE p.id = ?
      LIMIT 1
      `,
      [insertProducto.insertId]
    );

    return res.status(201).json(mapProductoDbToUi(createdRows[0]));
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ error: 'Error creando producto', detalle: error.message });
  } finally {
    conn.release();
  }
});

app.put('/api/productos/:id', requireAuth, requireStaff, async (req, res) => {
  const id = Number(req.params.id);
  const { codigo, producto, descripcion, categoria, precio, stock, stockMinimo, estado } = req.body;

  if (!id || !codigo || !producto || !descripcion || !categoria || precio == null || stock == null || stockMinimo == null || !estado) {
    return res.status(400).json({ error: 'Datos inválidos para actualizar' });
  }

  const numericPrecio = Number(precio);
  const numericStock = Number(stock);
  const numericStockMinimo = Number(stockMinimo);

  if (Number.isNaN(numericPrecio) || numericPrecio < 0) {
    return res.status(400).json({ error: 'Precio inválido' });
  }

  if (Number.isNaN(numericStock) || numericStock < 0) {
    return res.status(400).json({ error: 'Stock inválido' });
  }

  if (Number.isNaN(numericStockMinimo) || numericStockMinimo < 0) {
    return res.status(400).json({ error: 'Stock mínimo inválido' });
  }

  const conn = await pool.getConnection();
  const usuarioSesion = req.session.user;

  try {
    await conn.beginTransaction();

    const [prevRows] = await conn.query(
      `
      SELECT p.id, p.codigo, i.stock
      FROM productos p
      INNER JOIN inventario i ON i.producto_id = p.id
      WHERE p.id = ?
      LIMIT 1
      `,
      [id]
    );

    if (prevRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const stockAnterior = Number(prevRows[0].stock);

    let categoriaId;
    const [catRows] = await conn.query('SELECT id FROM categorias WHERE nombre = ? LIMIT 1', [categoria]);

    if (catRows.length > 0) {
      categoriaId = catRows[0].id;
    } else {
      const [insertCat] = await conn.query('INSERT INTO categorias (nombre) VALUES (?)', [categoria]);
      categoriaId = insertCat.insertId;
    }

    const [upProducto] = await conn.query(
      `UPDATE productos
       SET codigo = ?, producto = ?, descripcion = ?, categoria_id = ?, precio = ?
       WHERE id = ?`,
      [codigo, producto, descripcion, categoriaId, numericPrecio, id]
    );

    if (upProducto.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    await conn.query(
      `UPDATE inventario
       SET stock = ?, stock_minimo = ?, estado = ?
       WHERE producto_id = ?`,
      [numericStock, numericStockMinimo, estado, id]
    );

    if (numericStock !== stockAnterior) {
      await registrarMovimientoBitacora(conn, {
        productoId: id,
        tipoMovimiento: numericStock > stockAnterior ? 'ENTRADA' : 'SALIDA',
        cantidad: Math.abs(numericStock - stockAnterior),
        stockAnterior,
        stockNuevo: numericStock,
        usuarioId: usuarioSesion.id,
        usuarioNombre: usuarioSesion.usuario,
        accion: 'Ajuste manual de inventario',
        referencia: `Ajuste manual sobre producto ${codigo}`,
      });
    }

    await conn.commit();

    await registrarLog(usuarioSesion.usuario, `Actualizó producto ${codigo}`);

    const [updatedRows] = await pool.query(
      `
      SELECT
        p.id,
        p.codigo,
        p.producto,
        p.descripcion,
        c.nombre AS categoria,
        p.precio,
        i.stock,
        i.stock_minimo,
        i.estado
      FROM productos p
      INNER JOIN categorias c ON c.id = p.categoria_id
      INNER JOIN inventario i ON i.producto_id = p.id
      WHERE p.id = ?
      LIMIT 1
      `,
      [id]
    );

    return res.json(mapProductoDbToUi(updatedRows[0]));
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ error: 'Error actualizando producto', detalle: error.message });
  } finally {
    conn.release();
  }
});

app.post('/api/productos/:id/solicitar-eliminacion', requireAuth, requireStaff, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  if (/admin/i.test(String(req.session.user.rol || ''))) {
    return res.status(400).json({ error: 'El administrador puede eliminar directamente' });
  }

  try {
    const [rows] = await pool.query('SELECT codigo, producto FROM productos WHERE id = ? LIMIT 1', [id]);

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const target = rows[0];
    await registrarLog(
      req.session.user.usuario,
      `Solicitud eliminación producto ${target.codigo} - ${target.producto}`
    );

    return res.json({ ok: true, message: 'Solicitud enviada al administrador' });
  } catch (error) {
    return res.status(500).json({ error: 'Error solicitando eliminación', detalle: error.message });
  }
});

app.delete('/api/productos/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const conn = await pool.getConnection();
  const usuarioSesion = req.session.user;

  try {
    await conn.beginTransaction();

    const [targetRows] = await conn.query(
      'SELECT id, codigo FROM productos WHERE id = ? LIMIT 1',
      [id]
    );

    if (targetRows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const codigoProducto = targetRows[0].codigo;

    await conn.query('DELETE FROM proveedores_productos WHERE producto_id = ?', [id]);
    await conn.query('DELETE FROM movimientos_inventario WHERE producto_id = ?', [id]);
    await conn.query('DELETE FROM inventario WHERE producto_id = ?', [id]);
    const [deletedProducto] = await conn.query('DELETE FROM productos WHERE id = ?', [id]);

    if (deletedProducto.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    await conn.commit();

    await registrarLog(usuarioSesion.usuario, `Eliminó producto ${codigoProducto}`);
    return res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ error: 'Error eliminando producto', detalle: error.message });
  } finally {
    conn.release();
  }
});

app.get('/api/dashboard/resumen', requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        COUNT(*) AS totalProductos,
        COALESCE(SUM(p.precio * i.stock), 0) AS valorInventario,
        COALESCE(SUM(CASE WHEN i.stock <= i.stock_minimo THEN 1 ELSE 0 END), 0) AS stockBajo,
        COALESCE(SUM(CASE WHEN i.stock = 0 THEN 1 ELSE 0 END), 0) AS sinStock
      FROM productos p
      INNER JOIN inventario i ON i.producto_id = p.id
      `
    );

    const row = rows[0];

    return res.json({
      totalProductos: Number(row.totalProductos),
      valorInventario: Number(row.valorInventario),
      stockBajo: Number(row.stockBajo),
      sinStock: Number(row.sinStock),
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando resumen', detalle: error.message });
  }
});

app.get('/api/dashboard/stock-bajo', requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.codigo,
        p.producto,
        p.descripcion,
        c.nombre AS categoria,
        p.precio,
        i.stock,
        i.stock_minimo,
        i.estado
      FROM productos p
      INNER JOIN categorias c ON c.id = p.categoria_id
      INNER JOIN inventario i ON i.producto_id = p.id
      WHERE i.stock <= i.stock_minimo
      ORDER BY i.stock ASC, p.producto ASC
      `
    );

    return res.json(rows.map(mapProductoDbToUi));
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando stock bajo', detalle: error.message });
  }
});

app.get('/api/dashboard/ultimos-movimientos', requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        m.id,
        m.tipo_movimiento,
        m.cantidad,
        m.stock_anterior,
        m.stock_nuevo,
        m.usuario_nombre,
        m.accion,
        m.referencia,
        m.fecha_movimiento,
        p.codigo,
        p.producto
      FROM movimientos_inventario m
      INNER JOIN productos p ON p.id = m.producto_id
      ORDER BY m.fecha_movimiento DESC
      LIMIT 5
      `
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando últimos movimientos', detalle: error.message });
  }
});

app.get('/api/movimientos', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { desde, hasta, producto, tipo } = req.query;
    const whereParts = [];
    const params = [];

    if (desde) {
      whereParts.push('m.fecha_movimiento >= ?');
      params.push(desde);
    }

    if (hasta) {
      whereParts.push('m.fecha_movimiento <= ?');
      params.push(hasta);
    }

    if (producto) {
      whereParts.push('(p.codigo LIKE ? OR p.producto LIKE ?)');
      params.push(`%${producto}%`, `%${producto}%`);
    }

    if (tipo) {
      whereParts.push('m.tipo_movimiento = ?');
      params.push(tipo);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `
      SELECT
        m.id,
        p.codigo,
        p.producto,
        m.tipo_movimiento,
        m.cantidad,
        m.stock_anterior,
        m.stock_nuevo,
        m.usuario_nombre,
        m.accion,
        m.referencia,
        m.fecha_movimiento
      FROM movimientos_inventario m
      INNER JOIN productos p ON p.id = m.producto_id
      ${whereClause}
      ORDER BY m.fecha_movimiento DESC
      `,
      params
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando movimientos', detalle: error.message });
  }
});

app.get('/api/reportes/movimientos.csv', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { desde, hasta, producto, tipo } = req.query;
    const whereParts = [];
    const params = [];

    if (desde) {
      whereParts.push('m.fecha_movimiento >= ?');
      params.push(desde);
    }

    if (hasta) {
      whereParts.push('m.fecha_movimiento <= ?');
      params.push(hasta);
    }

    if (producto) {
      whereParts.push('(p.codigo LIKE ? OR p.producto LIKE ?)');
      params.push(`%${producto}%`, `%${producto}%`);
    }

    if (tipo) {
      whereParts.push('m.tipo_movimiento = ?');
      params.push(tipo);
    }

    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' AND ')}` : '';

    const [rows] = await pool.query(
      `
      SELECT
        m.id,
        p.codigo,
        p.producto,
        m.tipo_movimiento,
        m.cantidad,
        m.stock_anterior,
        m.stock_nuevo,
        m.usuario_nombre,
        m.accion,
        m.referencia,
        m.fecha_movimiento
      FROM movimientos_inventario m
      INNER JOIN productos p ON p.id = m.producto_id
      ${whereClause}
      ORDER BY m.fecha_movimiento DESC
      `,
      params
    );

    const headers = [
      'id',
      'codigo_producto',
      'producto',
      'tipo_movimiento',
      'cantidad',
      'stock_anterior',
      'stock_nuevo',
      'usuario',
      'accion',
      'referencia',
      'fecha_movimiento',
    ];

    const lines = [headers.map(csvEscape).join(',')];

    rows.forEach((row) => {
      lines.push([
        row.id,
        row.codigo,
        row.producto,
        row.tipo_movimiento,
        row.cantidad,
        row.stock_anterior,
        row.stock_nuevo,
        row.usuario_nombre,
        row.accion,
        row.referencia,
        row.fecha_movimiento,
      ].map(csvEscape).join(','));
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reporte_movimientos_${Date.now()}.csv"`);
    return res.status(200).send(lines.join('\n'));
  } catch (error) {
    return res.status(500).json({ error: 'Error generando reporte CSV', detalle: error.message });
  }
});

app.get('/api/proveedores', requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `
      SELECT
        p.id,
        p.nombre,
        p.contacto,
        p.direccion,
        COUNT(pp.producto_id) AS totalProductos
      FROM proveedores p
      LEFT JOIN proveedores_productos pp ON pp.proveedor_id = p.id
      GROUP BY p.id, p.nombre, p.contacto, p.direccion
      ORDER BY p.nombre ASC
      `
    );

    return res.json(rows.map((row) => ({
      id: Number(row.id),
      nombre: row.nombre,
      contacto: row.contacto,
      direccion: row.direccion,
      totalProductos: Number(row.totalProductos),
    })));
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando proveedores', detalle: error.message });
  }
});

app.post('/api/proveedores', requireAuth, requireAdmin, async (req, res) => {
  const { nombre, contacto, direccion } = req.body;

  if (!nombre) {
    return res.status(400).json({ error: 'El nombre del proveedor es obligatorio' });
  }

  try {
    const [result] = await pool.query(
      'INSERT INTO proveedores (nombre, contacto, direccion) VALUES (?, ?, ?)',
      [String(nombre).trim(), contacto || null, direccion || null]
    );

    await registrarLog(req.session.user.usuario, `Creó proveedor ${String(nombre).trim()}`);
    return res.status(201).json({ ok: true, id: result.insertId });
  } catch (error) {
    return res.status(500).json({ error: 'Error creando proveedor', detalle: error.message });
  }
});

app.put('/api/proveedores/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { nombre, contacto, direccion } = req.body;

  if (!id || !nombre) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE proveedores SET nombre = ?, contacto = ?, direccion = ? WHERE id = ?',
      [String(nombre).trim(), contacto || null, direccion || null, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    await registrarLog(req.session.user.usuario, `Actualizó proveedor ${String(nombre).trim()}`);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: 'Error actualizando proveedor', detalle: error.message });
  }
});

app.delete('/api/proveedores/:id', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM proveedores_productos WHERE proveedor_id = ?', [id]);
    const [result] = await conn.query('DELETE FROM proveedores WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    await conn.commit();
    await registrarLog(req.session.user.usuario, `Eliminó proveedor ID ${id}`);
    return res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ error: 'Error eliminando proveedor', detalle: error.message });
  } finally {
    conn.release();
  }
});

app.get('/api/proveedores/:id/productos', requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT p.id, p.codigo, p.producto
      FROM proveedores_productos pp
      INNER JOIN productos p ON p.id = pp.producto_id
      WHERE pp.proveedor_id = ?
      ORDER BY p.producto ASC
      `,
      [id]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando productos del proveedor', detalle: error.message });
  }
});

app.put('/api/proveedores/:id/productos', requireAuth, requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { productoIds } = req.body;

  if (!id || !Array.isArray(productoIds)) {
    return res.status(400).json({ error: 'Datos inválidos' });
  }

  const ids = [...new Set(productoIds.map((v) => Number(v)).filter((v) => Number.isInteger(v) && v > 0))];
  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM proveedores_productos WHERE proveedor_id = ?', [id]);

    for (const productoId of ids) {
      await conn.query(
        'INSERT INTO proveedores_productos (proveedor_id, producto_id) VALUES (?, ?)',
        [id, productoId]
      );
    }

    await conn.commit();
    await registrarLog(req.session.user.usuario, `Asignó ${ids.length} productos al proveedor ID ${id}`);
    return res.json({ ok: true });
  } catch (error) {
    await conn.rollback();
    return res.status(500).json({ error: 'Error actualizando relación proveedor-productos', detalle: error.message });
  } finally {
    conn.release();
  }
});

app.get('/api/productos/:id/proveedores', requireAuth, async (req, res) => {
  const id = Number(req.params.id);

  if (!id) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const [rows] = await pool.query(
      `
      SELECT pr.id, pr.nombre, pr.contacto
      FROM proveedores_productos pp
      INNER JOIN proveedores pr ON pr.id = pp.proveedor_id
      WHERE pp.producto_id = ?
      ORDER BY pr.nombre ASC
      `,
      [id]
    );

    return res.json(rows);
  } catch (error) {
    return res.status(500).json({ error: 'Error consultando proveedores del producto', detalle: error.message });
  }
});

app.post('/api/admin/backups', requireAuth, requireAdmin, async (req, res) => {
  try {
    const backup = await generarRespaldoBaseDeDatos();

    await registrarLog(req.session.user.usuario, `Generó respaldo de BD: ${backup.filename}`);

    return res.status(201).json({
      ok: true,
      message: 'Respaldo generado correctamente',
      filename: backup.filename,
      downloadUrl: `/api/admin/backups/${encodeURIComponent(backup.filename)}`,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error generando respaldo de BD', detalle: error.message });
  }
});

app.get('/api/admin/backups/:filename', requireAuth, requireAdmin, async (req, res) => {
  try {
    const filename = String(req.params.filename || '');

    if (!filename || filename !== path.basename(filename) || !filename.endsWith('.sql')) {
      return res.status(400).json({ error: 'Nombre de archivo de respaldo inválido' });
    }

    const filePath = path.join(BACKUPS_DIR, filename);
    await fs.access(filePath);
    return res.download(filePath, filename);
  } catch (error) {
    return res.status(404).json({ error: 'Respaldo no encontrado', detalle: error.message });
  }
});

app.use(express.static(path.join(__dirname)));

app.get('/', (_req, res) => {
  res.redirect('/html/index.html');
});

app.get('/index.html', (_req, res) => {
  res.redirect('/html/index.html');
});

app.get('/dashboard.html', (_req, res) => {
  res.redirect('/html/dashboard.html');
});

app.get('/productos.html', (_req, res) => {
  res.redirect('/html/productos.html');
});

app.get('/proveedores.html', (_req, res) => {
  res.redirect('/html/proveedores.html');
});

app.get('/admin-usuarios.html', (_req, res) => {
  res.redirect('/html/admin-usuarios.html');
});

app.get('/admin-logs.html', (_req, res) => {
  res.redirect('/html/admin-logs.html');
});

app.use((error, _req, res, _next) => {
  return res.status(500).json({ error: 'Error no controlado', detalle: error.message });
});

app.listen(PORT, async () => {
  try {
    await pool.query('SELECT 1');
    console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
    console.log('Conexión a MySQL verificada');
  } catch (error) {
    console.error('Servidor iniciado, pero no se pudo conectar a MySQL:', error.message);
  }
});
