import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';
import { readSignedRequest } from '../../../lib/deviceBinding';
import { describeDevice } from '../../../lib/deviceLabel';

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

export async function POST(request: Request) {
  try {
    const signed = await readSignedRequest(request);
    if (!signed.ok) {
      return NextResponse.json(
        { success: false, code: signed.code, message: signed.message },
        { status: signed.status }
      );
    }

    const { employeeCode } = signed.body;
    if (typeof employeeCode !== 'string' || !employeeCode) {
      return NextResponse.json(
        { success: false, message: 'Sicil no gereklidir.' },
        { status: 400 }
      );
    }

    // Satır JSON olarak alınır: hire_date gibi henüz tabloda olmayan kolonlar
    // sorguyu bozmaz, kolon eklendiği anda kod değişmeden okunmaya başlar.
    const result = await pool.query(
      'SELECT to_jsonb(e) AS data FROM employees e WHERE employee_code = $1',
      [employeeCode]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Personel bulunamadı.' },
        { status: 404 }
      );
    }

    const employee = result.rows[0].data as Record<string, unknown>;
    const boundKey = text(employee.device_public_key);

    // Profil yalnızca hesaba bağlı cihazdan görüntülenebilir
    if (boundKey && boundKey !== signed.deviceKey) {
      return NextResponse.json(
        {
          success: false,
          code: 'DEVICE_MISMATCH',
          message: 'Yalnızca kayıtlı cihazınızdan işlem yapabilirsiniz.',
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: {
        employeeCode: employee.employee_code,
        fullName: employee.full_name,
        department: text(employee.department),
        job: text(employee.job),
        shift: text(employee.shift),
        shiftType: text(employee.shift_type),
        isActive: employee.is_active !== false,
        hireDate: text(employee.hire_date),
        device: {
          bound: Boolean(boundKey),
          label: boundKey ? describeDevice(text(employee.device_label)) : null,
          boundAt: text(employee.device_bound_at),
        },
      },
    });
  } catch (error) {
    console.error('Profil Hatası:', error);
    return NextResponse.json(
      { success: false, message: 'Sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
