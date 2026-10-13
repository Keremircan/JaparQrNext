import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';
import { verifyQRData, usedTokens } from '../../../lib/qr';
import { SQL_TODAY_START } from '../../../lib/datetime';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { qrData, employeeId, hardwareId, type = 'IN' } = body;

    if (!qrData || !employeeId || !hardwareId) {
      return NextResponse.json(
        { success: false, message: 'Eksik parametre gönderildi.' },
        { status: 400 }
      );
    }

    // 1. QR Kod Çözme ve TOTP Doğrulama
    const verification = verifyQRData(qrData);
    if (!verification.success || !verification.data) {
      return NextResponse.json(
        { success: false, message: verification.reason },
        { status: 403 }
      );
    }

    const { token, factoryId, gateId } = verification.data;

    // 2. Çift Okutma (Replay Attack) Kontrolü
    if (usedTokens.has(token)) {
      return NextResponse.json(
        {
          success: false,
          message: 'Güvenlik Uyarısı: Bu karekod az önce kullanıldı!',
        },
        { status: 409 }
      );
    }
    usedTokens.add(token);
    setTimeout(() => {
      usedTokens.delete(token);
    }, 10000);

    // 3. PostgreSQL Personel Sorgusu
    const empQuery = await pool.query(
      `SELECT id, employee_code, full_name, registered_hardware_id, is_active 
       FROM employees 
       WHERE employee_code = $1`,
      [employeeId]
    );

    if (empQuery.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Personel bulunamadı.' },
        { status: 404 }
      );
    }

    const employee = empQuery.rows[0];

    if (!employee.is_active) {
      return NextResponse.json(
        { success: false, message: 'Personel hesabı pasif durumda.' },
        { status: 403 }
      );
    }

    // 4. Cihaz Kilitleme (Hardware Binding) Kontrolü
    if (!employee.registered_hardware_id) {
      await pool.query(
        'UPDATE employees SET registered_hardware_id = $1 WHERE id = $2',
        [hardwareId, employee.id]
      );
      console.log(`[Cihaz Kilitlendi] ${employee.full_name} -> ${hardwareId}`);
    } else if (employee.registered_hardware_id !== hardwareId) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Yetkisiz Cihaz: Kayıtlı telefonunuz dışındaki bir cihazdan işlem yapılamaz!',
        },
        { status: 403 }
      );
    }

    // 5. Günün Son Hareketi ve Ardışıklık Kontrolü
    const lastLogResult = await pool.query(
      `SELECT log_type 
       FROM attendance_logs 
       WHERE employee_code = $1 
         AND created_at >= ${SQL_TODAY_START}
       ORDER BY created_at DESC 
       LIMIT 1`,
      [employeeId]
    );

    const lastLog = lastLogResult.rows[0];

    if (lastLog) {
      if (lastLog.log_type === 'IN' && type === 'IN') {
        return NextResponse.json(
          {
            success: false,
            message:
              'Zaten içeridesiniz! Tekrar giriş yapmadan önce çıkış yapmalısınız.',
          },
          { status: 400 }
        );
      }

      if (lastLog.log_type === 'OUT' && type === 'OUT') {
        return NextResponse.json(
          {
            success: false,
            message:
              'Zaten çıkış yapmış durumdasınız! Tekrar çıkış yapmadan önce giriş yapmalısınız.',
          },
          { status: 400 }
        );
      }
    } else {
      if (type === 'OUT') {
        return NextResponse.json(
          {
            success: false,
            message:
              'Bugün henüz giriş kaydınız bulunmuyor. Önce giriş yapmalısınız.',
          },
          { status: 400 }
        );
      }
    }

    // 6. attendance_logs Tablosuna Kayıt
    const logQuery = await pool.query(
      `INSERT INTO attendance_logs (employee_code, factory_id, gate_id, hardware_id, log_type) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, created_at`,
      [employee.employee_code, factoryId, gateId, hardwareId, type]
    );

    const logRecord = logQuery.rows[0];
    console.log(
      `[Kayıt Başarılı] ID: ${logRecord.id} | ${type} | ${employee.full_name} | Kapı: ${gateId}`
    );

    return NextResponse.json({
      success: true,
      message: `${type === 'IN' ? 'Giriş' : 'Çıkış'} başarıyla onaylandı ve kaydedildi.`,
      gate: gateId,
    });
  } catch (dbError) {
    console.error('Veritabanı Hatası:', dbError);
    return NextResponse.json(
      { success: false, message: 'Sunucu veritabanı hatası oluştu.' },
      { status: 500 }
    );
  }
}