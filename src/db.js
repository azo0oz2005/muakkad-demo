'use strict';

const { Pool } = require('pg');

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30000
});

pool.on('error', (error) => console.error('Unexpected PostgreSQL pool error', error));

module.exports = { pool, query: (text, params) => pool.query(text, params) };
