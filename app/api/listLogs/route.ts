import { NextResponse } from 'next/server';
import { pool } from '../../../lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employeeCode } = body;

    if (!employeeCode) {
      return NextResponse.json(
        { success: false, message: 'Sicil no gereklidir.' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `SELECT id, gate_id, log_type, created_at 
       FROM attendance_logs 
       WHERE employee_code = $1 AND created_at::date = CURRENT_DATE
       ORDER BY created_at DESC`,
      [employeeCode]
    );

    if (result.rows.length === 0) {
      return NextResponse.json({
        success: true,
        logList: [],
      });
    }

    const logList = result.rows.map((row) => ({
      id: row.id,
      gate: row.gate_id,
      type: row.log_type,
      time: new Date(row.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));

    return NextResponse.json({
      success: true,
      logList,
    });
  } catch (error) {
    console.error('Log Listeleme Hatası:', error);
    return NextResponse.json(
      { success: false, message: 'Sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}