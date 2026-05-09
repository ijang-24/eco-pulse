const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env'), override: true });
const mysql = require('mysql2/promise');
const fs = require('fs');

async function migrate() {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        user: process.env.DB_USER,
        password: process.env.DB_PASS,
        multipleStatements: true
    });

    console.log('Connected to MySQL as', process.env.DB_USER);

    try {
        const sql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
        await connection.query(sql);
        console.log('Migration successful! Database and tables created.');
    } catch (err) {
        console.error('Migration failed:', err.message);
    } finally {
        await connection.end();
    }
}

migrate();
