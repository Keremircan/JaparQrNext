import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';
import { authenticateRequest, failureResponse } from '../../../lib/deviceBinding';
import { describeDevice } from '../../../lib/deviceLabel';

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, 'profile');
    if (!auth.ok) return failureResponse(auth);

    const { employee } = auth;

    // hire_date henüz tabloda olmayabilir: JSON üzerinden okunduğu için kolon
    // yoksa sorgu bozulmaz, eklendiği anda kod değişmeden okunmaya başlar.
    const extra = await pool.query<{ hire_date: string | null }>(
      `SELECT to_jsonb(e) ->> 'hire_date' AS hire_date FROM employees e WHERE id = $1`,
      [employee.id]
    );

    return NextResponse.json({
      success: true,
      profile: {
        employeeCode: employee.employee_code,
        fullName: employee.full_name,
        department: employee.department,
        job: employee.job,
        shift: employee.shift,
        shiftType: employee.shift_type,
        isActive: true,
        hireDate: extra.rows[0]?.hire_date ?? null,
        device: {
          label: describeDevice(employee.device_label),
          boundAt: employee.device_bound_at?.toISOString() ?? null,
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
