import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import {
  bindDeviceAtLogin,
  failureResponse,
  findEmployee,
  isEmployeeCode,
  readSignedRequest,
} from '../../../lib/deviceBinding';
import {
  clearAttempts,
  clientIp,
  isRateLimited,
  recordAttempt,
} from '../../../lib/rateLimit';

// Kaba kuvvet koruması: 10 dakikada sicil başına 8, IP başına 40 hatalı deneme
const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES_PER_ACCOUNT = 8;
const MAX_FAILURES_PER_IP = 40;
const MAX_PASSWORD_LENGTH = 200;

// Var olmayan sicil için de bcrypt çalıştırılır ki yanıt süresi sicilin
// kayıtlı olup olmadığını ele vermesin.
const DUMMY_HASH = bcrypt.hashSync('japar-dummy-password', 10);

export async function POST(request: Request) {
  try {
    const signed = await readSignedRequest(request);
    if (!signed.ok) return failureResponse(signed);

    const { employeeCode, password, legacyHardwareId } = signed.body;

    if (
      !isEmployeeCode(employeeCode) ||
      typeof password !== 'string' ||
      !password ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
      return NextResponse.json(
        { success: false, message: 'Sicil no ve şifre gereklidir.' },
        { status: 400 }
      );
    }

    const ipKey = `login:ip:${clientIp(request)}`;
    const accountKey = `login:acc:${employeeCode}`;
    if (
      isRateLimited(ipKey, MAX_FAILURES_PER_IP, WINDOW_MS) ||
      isRateLimited(accountKey, MAX_FAILURES_PER_ACCOUNT, WINDOW_MS)
    ) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Çok fazla hatalı deneme yapıldı. Lütfen 10 dakika sonra tekrar deneyin.',
        },
        { status: 429 }
      );
    }

    const employee = await findEmployee(employeeCode);
    const isPasswordValid = await bcrypt.compare(
      password,
      employee?.password_hash ?? DUMMY_HASH
    );

    // Sicil yok / şifre yanlış ayrımı bilerek yapılmaz (hesap keşfini önler)
    if (!employee || !isPasswordValid) {
      recordAttempt(ipKey, WINDOW_MS);
      recordAttempt(accountKey, WINDOW_MS);
      return NextResponse.json(
        { success: false, message: 'Sicil numarası veya şifre hatalı.' },
        { status: 401 }
      );
    }

    if (!employee.is_active) {
      return NextResponse.json(
        { success: false, message: 'Hesabınız pasif durumdadır.' },
        { status: 403 }
      );
    }

    // Cihaz eşleme: şifre doğrulandıktan SONRA yapılır ki sicil numarasını bilen
    // biri başkasının hesabını kendi telefonuna bağlayamasın.
    const binding = await bindDeviceAtLogin(employee, {
      deviceKey: signed.deviceKey,
      deviceLabel: signed.deviceLabel,
      legacyHardwareId,
    });
    if (!binding.ok) return failureResponse(binding);

    clearAttempts(accountKey);

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
