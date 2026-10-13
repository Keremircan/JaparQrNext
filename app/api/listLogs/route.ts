import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';
import { authenticateRequest, failureResponse } from '../../../lib/deviceBinding';
import { getLastLog, getTodayLogs } from '../../../lib/attendance';

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, 'listLogs');
    if (!auth.ok) return failureResponse(auth);

    const employeeCode = auth.employee.employee_code;
    const [logList, last] = await Promise.all([
      getTodayLogs(pool, employeeCode),
      getLastLog(pool, employeeCode),
    ]);

    return NextResponse.json({
      success: true,
      logList,
      // Vardiya durumu: /api/verify ile aynı kuraldan türetilir
      lastType: last?.type ?? null,
    });
  } catch (error) {
    console.error('Log Listeleme Hatası:', error);
    return NextResponse.json(
      { success: false, message: 'Sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}
