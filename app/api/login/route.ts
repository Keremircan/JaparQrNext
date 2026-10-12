import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { pool } from '../../../lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { employeeCode, password } = body;

    if (!employeeCode || !password) {
      return NextResponse.json(
        { success: false, message: 'Sicil no ve şifre gereklidir.' },
        { status: 400 }
      );
    }

    const result = await pool.query(
      `SELECT id, employee_code, full_name, password_hash, is_active, department, job, shift, shift_type 
       FROM employees 
       WHERE employee_code = $1`,
      [employeeCode]
    );

    if (result.rows.length === 0) {
      return NextResponse.json(
        { success: false, message: 'Kullanıcı bulunamadı.' },
        { status: 404 }
      );
    }

    const employee = result.rows[0];

    if (!employee.is_active) {
      return NextResponse.json(
        { success: false, message: 'Hesabınız pasif durumdadır.' },
        { status: 403 }
      );
    }

    const isPasswordValid = await bcrypt.compare(
      password,
      employee.password_hash
    );

    if (!isPasswordValid) {
      return NextResponse.json(
        { success: false, message: 'Hatalı şifre girdiniz.' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Giriş başarılı.',
      user: {
        id: employee.id,
        employeeCode: employee.employee_code,
        fullName: employee.full_name,
        department: employee.department,
        job: employee.job,
        shift: employee.shift,
        shift_type: employee.shift_type,
      },
    });
  } catch (error) {
    console.error('Login Hatası:', error);
    return NextResponse.json(
      { success: false, message: 'Sunucu hatası oluştu.' },
      { status: 500 }
    );
  }
}