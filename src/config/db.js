const { Pool } = require('pg');
require('dotenv').config();

// Initialize PostgreSQL connection pool using DATABASE_URL
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/url_shortener';

const pool = new Pool({
  connectionString,
  max: 20, // Maximum pool connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Event listener for pool connection error handling
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

const { incrementMetric } = require('../utils/metrics');

module.exports = {
  pool,
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (err) {
      incrementMetric('database_errors_total');
      throw err;
    }
  },
};
