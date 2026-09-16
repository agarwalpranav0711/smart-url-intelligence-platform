const { Client, Pool } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/url_shortener';

async function setupDatabase() {
  console.log('=== STEP 2: DATABASE MIGRATION & VERIFICATION ===\n');

  // 1. Ensure the url_shortener database exists
  const dbName = 'url_shortener';
  const defaultUrl = connectionString.substring(0, connectionString.lastIndexOf('/')) + '/postgres';
  
  const adminClient = new Client({ connectionString: defaultUrl });
  try {
    await adminClient.connect();
    const res = await adminClient.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (res.rowCount === 0) {
      console.log(`Database '${dbName}' does not exist. Creating database...`);
      await adminClient.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Database '${dbName}' created successfully.`);
    } else {
      console.log(`Database '${dbName}' already exists.`);
    }
  } catch (err) {
    console.error('Error checking/creating database:', err.message);
  } finally {
    await adminClient.end();
  }

  // 2. Connect to url_shortener database and run schema.sql DDL
  const pool = new Pool({ connectionString });
  try {
    const schemaPath = path.join(__dirname, '..', 'schema.sql');
    const sql = fs.readFileSync(schemaPath, 'utf8');

    console.log('Executing DDL schema migration from schema.sql...');
    await pool.query(sql);
    console.log('DDL schema executed successfully.\n');

    // 3. Verify tables exist
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Verified Tables in PostgreSQL:');
    tablesRes.rows.forEach(r => console.log(` - Table: ${r.table_name}`));

    // 4. Verify indexes exist
    const indexRes = await pool.query(`
      SELECT tablename, indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public' 
      ORDER BY tablename, indexname;
    `);
    console.log('\nVerified Indexes in PostgreSQL:');
    indexRes.rows.forEach(r => console.log(` - ${r.tablename}.${r.indexname}`));

    // 5. Test Node.js app connection pool
    const nowRes = await pool.query('SELECT NOW() as current_time, version();');
    console.log('\nNode.js DB Pool Connection Verification:');
    console.log(` - Current Server Time: ${nowRes.rows[0].current_time}`);
    console.log(` - PostgreSQL Version: ${nowRes.rows[0].version}`);

  } catch (err) {
    console.error('Database setup/verification failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

setupDatabase();
