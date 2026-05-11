const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

let pool;
let initializationPromise;

async function ensureColumn(connection, tableName, columnName, definition) {
    const [rows] = await connection.query(
        `SELECT 1
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
           AND TABLE_NAME = ?
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [dbConfig.database, tableName, columnName]
    );

    if (rows.length === 0) {
        await connection.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
}

async function upgradeSchema(connection) {
    await connection.query(`USE \`${dbConfig.database}\``);

    await ensureColumn(connection, 'users', 'rt', "VARCHAR(10) NOT NULL DEFAULT ''");
    await ensureColumn(connection, 'users', 'rw', "VARCHAR(10) NOT NULL DEFAULT ''");
    await ensureColumn(connection, 'users', 'role', "ENUM('citizen', 'admin') DEFAULT 'citizen'");
    await ensureColumn(connection, 'users', 'total_points', 'INT DEFAULT 0');
}

async function createPool() {
    if (!pool) {
        pool = mysql.createPool(dbConfig);
    }

    return pool;
}

async function initializeDatabase() {
    if (initializationPromise) {
        return initializationPromise;
    }

    initializationPromise = (async () => {
        const bootstrapConnection = await mysql.createConnection({
            host: dbConfig.host,
            port: dbConfig.port,
            user: dbConfig.user,
            password: dbConfig.password,
            multipleStatements: true
        });

        try {
            const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database.sql'), 'utf8');
            await bootstrapConnection.query(sql);
            await upgradeSchema(bootstrapConnection);
        } finally {
            await bootstrapConnection.end();
        }

        const activePool = await createPool();
        await activePool.query('SELECT 1');
    })().catch((err) => {
        initializationPromise = null;
        throw err;
    });

    return initializationPromise;
}

async function query(sql, params) {
    await initializeDatabase();
    const activePool = await createPool();
    return activePool.query(sql, params);
}

async function getConnection() {
    await initializeDatabase();
    const activePool = await createPool();
    return activePool.getConnection();
}

module.exports = {
    query,
    initializeDatabase,
    getConnection
};
