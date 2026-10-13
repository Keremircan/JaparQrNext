import { NextResponse } from 'next/server';

// Postgres: 42703 = kolon yok, 42P01 = tablo yok, 42883 = fonksiyon yok
const SCHEMA_ERROR_CODES = new Set(['42703', '42P01', '42883']);
const CONNECTION_ERROR_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  '57P01', // admin_shutdown
  '53300', // too_many_connections
]);

/**
 * Beklenmeyen hatayı ayrıntısıyla sunucu günlüğüne yazar ve istemciye sebebi
 * ayırt edilebilir (ama iç ayrıntı sızdırmayan) bir yanıt döndürür.
 */
export function serverErrorResponse(context: string, error: unknown) {
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);

  if (typeof code === 'string' && SCHEMA_ERROR_CODES.has(code)) {
    // Kod ile veritabanı şeması uyuşmuyor (eksik/fazla çalıştırılmış migration)
    console.error(`[${context}] VERİTABANI ŞEMASI UYUMSUZ (${code}): ${message}`, error);
    return NextResponse.json(
      {
        success: false,
        code: 'SCHEMA_MISMATCH',
        message:
          'Sunucu yapılandırma hatası: veritabanı şeması uygulama sürümüyle uyumlu değil. Lütfen yöneticinize bildirin.',
      },
      { status: 500 }
    );
  }

  if (
    (typeof code === 'string' && CONNECTION_ERROR_CODES.has(code)) ||
    /timeout exceeded when trying to connect|Connection terminated/i.test(message)
  ) {
    console.error(`[${context}] Veritabanına bağlanılamadı: ${message}`, error);
    return NextResponse.json(
      {
        success: false,
        code: 'DB_UNAVAILABLE',
        message: 'Veritabanına şu anda ulaşılamıyor. Lütfen biraz sonra tekrar deneyin.',
      },
      { status: 503 }
    );
  }

  console.error(`[${context}] Beklenmeyen hata:`, error);
  return NextResponse.json(
    { success: false, message: 'Sunucu hatası oluştu.' },
    { status: 500 }
  );
}
