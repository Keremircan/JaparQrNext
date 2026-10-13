import { Pool } from 'pg';

// Global nesne üzerinde havuzu saklamak için tip tanımı
const globalForPg = globalThis as unknown as {
  pool?: Pool;
};

export const pool =
  globalForPg.pool ||
  new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
    // Supabase SSL zorunlu tutar. DB_CA_CERT (Supabase panelinden indirilen CA
    // sertifikasının PEM içeriği) tanımlıysa sunucu sertifikası doğrulanır;
    // tanımlı değilse bağlantı şifrelidir ama karşı tarafın kimliği doğrulanmaz.
    ssl: process.env.DB_CA_CERT
      ? { ca: process.env.DB_CA_CERT, rejectUnauthorized: true }
      : { rejectUnauthorized: false },
    // Serverless ortamlar için havuz optimizasyonu
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPg.pool = pool;
}

pool.on('error', (err) => {
  console.error('Veritabanı bağlantı havuzu hatası:', err);
});