import { NextResponse } from 'next/server';
import { serverErrorResponse } from '../../../lib/apiError';
import { pool } from '../../../lib/db';
import { authenticateRequest, failureResponse } from '../../../lib/deviceBinding';
import { getLastLog, getTodayLogs } from '../../../lib/attendance';
import { annotateLogs } from '../../../lib/shiftTiming';

export async function POST(request: Request) {
  try {
    const auth = await authenticateRequest(request, 'listLogs');
    if (!auth.ok) return failureResponse(auth);

    const employeeCode = auth.employee.employee_code;
    const [logs, last] = await Promise.all([
      getTodayLogs(pool, employeeCode),
      getLastLog(pool, employeeCode),
    ]);

    return NextResponse.json({
      success: true,
      // Her harekete vardiya etiketi (zamanında / geç / erken) eklenir
      logList: annotateLogs(logs, auth.employee.shift),
      // Vardiya durumu: /api/verify ile aynı kuraldan türetilir
      lastType: last?.type ?? null,
    });
  } catch (error) {
    return serverErrorResponse('listLogs', error);
  }
}
