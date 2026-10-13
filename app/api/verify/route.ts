import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';
import { verifyQRData } from '../../../lib/qr';
import { authenticateRequest, failureResponse } from '../../../lib/deviceBinding';
import {
  RESCAN_COOLDOWN_SECONDS,
  getLastLog,
  nextLogType,
} from '../../../lib/attendance';

// Şifreli karekod metni ~90 karakterdir
const MAX_QR_LENGTH = 512;

export async function POST(request: Request) {
  try {
    // 1. Kimlik: istek, personele bağlı cihazın anahtarıyla imzalanmış olmalı
    const auth = await authenticateRequest(request, 'verify');
    if (!auth.ok) return failureResponse(auth);

    const { employee, body, deviceKey } = auth;
    const { qrData } = body;

    if (typeof qrData !== 'string' || !qrData || qrData.length > MAX_QR_LENGTH) {
      return NextResponse.json(
        { success: false, message: 'Eksik parametre gönderildi.' },
        { status: 400 }
      );
    }

    // 2. QR Kod Çözme ve TOTP Doğrulama
    const verification = verifyQRData(qrData);
    if (!verification.success) {
      return NextResponse.json(
        { success: false, message: verification.reason },
        { status: 403 }
      );
    }

    const { factoryId, gateId } = verification.data;

    // 3. Sıra kontrolü ve kayıt tek transaction içinde; personel bazlı kilit,
    //    eşzamanlı iki okutmanın çift kayıt üretmesini engeller.
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        employee.employee_code,
      ]);

      const last = await getLastLog(client, employee.employee_code);

      // Çift okutma / aynı karekodun yeniden kullanımı (replay) koruması.
      // Personel bazlıdır: aynı karekodu sıradaki diğer personel okutabilir.
      if (last && last.ageSeconds < RESCAN_COOLDOWN_SECONDS) {
        await client.query('ROLLBACK');
        return NextResponse.json(
          {
            success: false,
            message: `Az önce ${
              last.type === 'IN' ? 'giriş' : 'çıkış'
            } işleminiz kaydedildi. Yeni işlem için lütfen biraz bekleyin.`,
          },
          { status: 429 }
        );
      }

      // İşlem türünü istemci değil sunucu belirler: içerideyse ÇIKIŞ, değilse GİRİŞ
      const type = nextLogType(last);

      const inserted = await client.query<{ id: string; created_at: Date }>(
        `INSERT INTO attendance_logs (employee_code, factory_id, gate_id, hardware_id, log_type)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, created_at`,
        [employee.employee_code, factoryId, gateId, deviceKey, type]
      );
      await client.query('COMMIT');

      const record = inserted.rows[0];
      console.log(
        `[Kayıt Başarılı] ID: ${record.id} | ${type} | ${employee.employee_code} | Kapı: ${gateId}`
      );

      return NextResponse.json({
        success: true,
        type,
        message: `${type === 'IN' ? 'Giriş' : 'Çıkış'} başarıyla onaylandı ve kaydedildi.`,
        gate: gateId,
        createdAt: record.created_at.toISOString(),
      });
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  } catch (dbError) {
    console.error('Veritabanı Hatası:', dbError);
    return NextResponse.json(
      { success: false, message: 'Sunucu veritabanı hatası oluştu.' },
      { status: 500 }
    );
  }
}
