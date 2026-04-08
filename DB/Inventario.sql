-- ============================================================
-- BASE DE DATOS: INVENTARIO (MySQL)
-- Compatible con MySQL Workbench
-- ============================================================

CREATE DATABASE IF NOT EXISTS inventario_db
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE inventario_db;

-- ------------------------------------------------------------
-- CATÁLOGO
-- ------------------------------------------------------------

CREATE TABLE categorias (
    id        BIGINT PRIMARY KEY AUTO_INCREMENT,
    nombre    VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE productos (
    id           BIGINT PRIMARY KEY AUTO_INCREMENT,
    codigo       VARCHAR(50)    UNIQUE NOT NULL,
    producto     VARCHAR(255)   NOT NULL,
    descripcion  VARCHAR(500)   NOT NULL,
    categoria_id BIGINT         NOT NULL,
    precio       DECIMAL(10, 2) NOT NULL,
    CONSTRAINT fk_productos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- UNIQUE garantiza atomicidad: un solo registro de inventario por producto
CREATE TABLE inventario (
    id          BIGINT PRIMARY KEY AUTO_INCREMENT,
    producto_id BIGINT       NOT NULL UNIQUE,
    stock       INTEGER      NOT NULL DEFAULT 0 CHECK (stock >= 0),
    stock_minimo INTEGER     NOT NULL DEFAULT 5 CHECK (stock_minimo >= 0),
    estado      VARCHAR(50)  NOT NULL,
    CONSTRAINT fk_inventario_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- precio_unitario guarda el precio histórico al momento de la venta
-- precio_total se elimina como columna almacenada (se calcula con una vista)
CREATE TABLE ventas (
    id              BIGINT PRIMARY KEY AUTO_INCREMENT,
    producto_id     BIGINT         NOT NULL,
    cantidad        INTEGER        NOT NULL CHECK (cantidad > 0),
    precio_unitario DECIMAL(10, 2) NOT NULL,
    fecha_venta     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_ventas_producto FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- Vista para obtener el precio total calculado sin almacenarlo
CREATE VIEW vista_ventas AS
    SELECT
        id,
        producto_id,
        cantidad,
        precio_unitario,
        (cantidad * precio_unitario) AS precio_total,
        fecha_venta
    FROM ventas;

-- ------------------------------------------------------------
-- PROVEEDORES
-- ------------------------------------------------------------

CREATE TABLE proveedores (
    id        BIGINT PRIMARY KEY AUTO_INCREMENT,
    nombre    VARCHAR(255) NOT NULL,
    contacto  VARCHAR(255),
    direccion TEXT
);

-- UNIQUE evita duplicados proveedor-producto
CREATE TABLE proveedores_productos (
    id           BIGINT PRIMARY KEY AUTO_INCREMENT,
    proveedor_id BIGINT NOT NULL,
    producto_id  BIGINT NOT NULL,
    CONSTRAINT fk_pp_proveedor FOREIGN KEY (proveedor_id) REFERENCES proveedores(id),
    CONSTRAINT fk_pp_producto  FOREIGN KEY (producto_id)  REFERENCES productos(id),
    CONSTRAINT uq_proveedor_producto UNIQUE (proveedor_id, producto_id)
);

-- ------------------------------------------------------------
-- ROLES Y PERMISOS (muchos a muchos, igual que el ejemplo Python)
-- ------------------------------------------------------------

CREATE TABLE roles (
    id     BIGINT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE permisos (
    id     BIGINT PRIMARY KEY AUTO_INCREMENT,
    nombre VARCHAR(50) NOT NULL UNIQUE
);

-- Relación muchos a muchos: un rol puede tener varios permisos
CREATE TABLE roles_permisos (
    rol_id     BIGINT NOT NULL,
    permiso_id BIGINT NOT NULL,
    PRIMARY KEY (rol_id, permiso_id),
    CONSTRAINT fk_rp_rol     FOREIGN KEY (rol_id)     REFERENCES roles(id),
    CONSTRAINT fk_rp_permiso FOREIGN KEY (permiso_id) REFERENCES permisos(id)
);

-- ------------------------------------------------------------
-- USUARIOS (con hash de contraseña y múltiples roles)
-- ------------------------------------------------------------

CREATE TABLE usuarios (
    id             BIGINT PRIMARY KEY AUTO_INCREMENT,
    nombre_usuario VARCHAR(100) NOT NULL UNIQUE,
    -- SHA-256 en hex = 64 caracteres. Usar bcrypt desde la aplicación (mínimo 60 chars).
    -- Se reservan 255 para ser compatible con cualquier algoritmo de hash.
    contrasena     VARCHAR(255) NOT NULL
);

-- Relación muchos a muchos: un usuario puede tener varios roles
CREATE TABLE usuario_rol (
    usuario_id BIGINT NOT NULL,
    rol_id     BIGINT NOT NULL,
    PRIMARY KEY (usuario_id, rol_id),
    CONSTRAINT fk_ur_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT fk_ur_rol     FOREIGN KEY (rol_id)     REFERENCES roles(id)
);

-- Bitácora de movimientos operativos para visualización administrativa
CREATE TABLE movimientos_inventario (
    id               BIGINT PRIMARY KEY AUTO_INCREMENT,
    producto_id      BIGINT       NOT NULL,
    tipo_movimiento  VARCHAR(20)  NOT NULL,
    cantidad         INTEGER      NOT NULL CHECK (cantidad > 0),
    stock_anterior   INTEGER      NOT NULL CHECK (stock_anterior >= 0),
    stock_nuevo      INTEGER      NOT NULL CHECK (stock_nuevo >= 0),
    usuario_id       BIGINT       NOT NULL,
    usuario_nombre   VARCHAR(100) NOT NULL,
    accion           VARCHAR(100) NOT NULL,
    referencia       VARCHAR(255) NOT NULL,
    fecha_movimiento DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_mov_producto FOREIGN KEY (producto_id) REFERENCES productos(id),
    CONSTRAINT fk_mov_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    CONSTRAINT chk_mov_tipo CHECK (tipo_movimiento IN ('ENTRADA', 'SALIDA', 'AJUSTE'))
);

CREATE INDEX idx_mov_fecha ON movimientos_inventario(fecha_movimiento);
CREATE INDEX idx_mov_producto ON movimientos_inventario(producto_id);
CREATE INDEX idx_mov_usuario ON movimientos_inventario(usuario_id);

-- ------------------------------------------------------------
-- AUDITORÍA
-- ------------------------------------------------------------

CREATE TABLE logs (
    id           BIGINT PRIMARY KEY AUTO_INCREMENT,
    usuario      VARCHAR(100) NOT NULL,
    accion       TEXT         NOT NULL,
    fecha_hora   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- TRIGGER: descuenta stock automáticamente al registrar una venta
-- ------------------------------------------------------------

DELIMITER $$

CREATE TRIGGER trg_validar_stock_venta
BEFORE INSERT ON ventas
FOR EACH ROW
BEGIN
    DECLARE stock_actual INTEGER;

    SELECT stock INTO stock_actual
    FROM inventario
    WHERE producto_id = NEW.producto_id
    FOR UPDATE;

    IF stock_actual IS NULL THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'No existe inventario para el producto seleccionado';
    END IF;

    IF stock_actual < NEW.cantidad THEN
        SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'Stock insuficiente para registrar la venta';
    END IF;
END$$

CREATE TRIGGER trg_descontar_stock
AFTER INSERT ON ventas
FOR EACH ROW
BEGIN
    UPDATE inventario
    SET stock = stock - NEW.cantidad
    WHERE producto_id = NEW.producto_id;
END$$

DELIMITER ;

-- ------------------------------------------------------------
-- DATOS INICIALES
-- ------------------------------------------------------------

INSERT INTO roles (nombre) VALUES ('Admin'), ('Vendedor'), ('Revisor');

INSERT INTO permisos (nombre) VALUES ('Crear'), ('Leer'), ('Actualizar'), ('Eliminar');

-- Admin → todos los permisos
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.nombre = 'Admin';

-- Vendedor → Crear y Leer
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.nombre = 'Vendedor' AND p.nombre IN ('Crear', 'Leer');

-- Revisor → solo Leer
INSERT INTO roles_permisos (rol_id, permiso_id)
SELECT r.id, p.id
FROM roles r, permisos p
WHERE r.nombre = 'Revisor' AND p.nombre = 'Leer';

-- Usuario admin inicial
-- ⚠️ Reemplaza este hash con uno generado por bcrypt desde tu aplicación
INSERT INTO usuarios (nombre_usuario, contrasena)
VALUES ('admin', 'CONTRASEÑA_HASHEADA_DESDE_NPM_RUN_HASH');

INSERT INTO usuario_rol (usuario_id, rol_id)
SELECT u.id, r.id
FROM usuarios u, roles r
WHERE u.nombre_usuario = 'admin' AND r.nombre = 'Admin';