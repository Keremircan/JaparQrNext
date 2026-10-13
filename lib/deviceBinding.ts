// Sunucu tarafı cihaz eşleme: istek imzasının doğrulanması ve personel-cihaz
// bağının kurulması / denetlenmesi. İstemci karşılığı: lib/deviceId.ts

import { NextResponse } from 'next/server';
import { pool } from './db';

export type DeviceErrorCode =
  | 'DEVICE_SIGNATURE_INVALID'
  | 'DEVICE_MISMATCH'
  | 'DEVICE_IN_USE'
  | 'DEVICE_NOT_BOUND';

export type RequestFailure = {
  ok: false;
  status: number;
  code?: DeviceErrorCode;
  message: string;
};

export type EmployeeRow = {
  id: number;
  employee_code: string;
  full_name: string;
  password_hash: string;
  is_active: boolean | null;
  department: string | null;
  job: string | null;
  shift: string | null;
  shift_type: string | null;
  device_public_key: string | null;
  device_bound_at: Date | null;
  device_label: string | null;
};

const EMPLOYEE_COLUMNS = `id, employee_code, full_name, password_hash, is_active, department, job,
       shift, shift_type, device_public_key, device_bound_at, device_label`;

type SignedRequest =
  | { ok: true; body: Record<string, unknown>; deviceKey: string; deviceLabel: string }
  | RequestFailure;

const SIGNATURE_INVALID: RequestFailure = {
  ok: false,
  status: 401,
  code: 'DEVICE_SIGNATURE_INVALID',
  message:
    'Cihaz kimliği doğrulanamadı. Uygulamayı kapatıp yeniden açın ve tekrar deneyin.',
};

const MISMATCH: RequestFailure = {
  ok: false,
  status: 403,
  code: 'DEVICE_MISMATCH',
  message:
    'Yalnızca kayıtlı cihazınızdan işlem yapabilirsiniz. Telefonunuzu değiştirdiyseniz yöneticinize başvurun.',
};

const IN_USE: RequestFailure = {
  ok: false,
  status: 403,
  code: 'DEVICE_IN_USE',
  message:
    'Bu cihaz başka bir personele kayıtlı. Her personel yalnızca kendi telefonundan işlem yapabilir.',
};

const NOT_BOUND: RequestFailure = {
  ok: false,
  status: 403,
  code: 'DEVICE_NOT_BOUND',
  message:
    'Bu cihaz hesabınıza henüz eşlenmemiş. Lütfen yeniden giriş yapın.',
};

// P-256 açık anahtarı (sıkıştırılmamış nokta): 0x04 || X(32) || Y(32)
const RAW_PUBLIC_KEY_LENGTH = 65;
// WebCrypto ECDSA imzası: r(32) || s(32)
const SIGNATURE_LENGTH = 64;
const PG_UNIQUE_VIOLATION = '23505';
// employees.employee_code varchar(50)
const MAX_EMPLOYEE_CODE_LENGTH = 50;
const MAX_BODY_LENGTH = 4096;

/** Başarısız doğrulama sonucunu API yanıtına çevirir. */
export function failureResponse(failure: RequestFailure) {
  return NextResponse.json(
    { success: false, code: failure.code, message: failure.message },
    { status: failure.status }
  );
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const buffer = Buffer.from(value, 'base64url');
  return new Uint8Array(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
}

/**
 * İsteğin gövdesini okur ve X-Device-Key / X-Device-Signature başlıklarıyla
 * `${pathname}\n${body}` imzasını doğrular. Başarılıysa isteğin, başlıktaki
 * açık anahtarın özel anahtarına sahip cihazdan geldiği kanıtlanmış olur.
 */
export async function readSignedRequest(request: Request): Promise<SignedRequest> {
  const deviceKey = request.headers.get('x-device-key') ?? '';
  const signatureHeader = request.headers.get('x-device-signature') ?? '';
  const bodyText = await request.text();

  const keyBytes = fromBase64Url(deviceKey);
  const signature = fromBase64Url(signatureHeader);
  if (
    !keyBytes ||
    !signature ||
    keyBytes.length !== RAW_PUBLIC_KEY_LENGTH ||
    keyBytes[0] !== 0x04 ||
    signature.length !== SIGNATURE_LENGTH ||
    bodyText.length > MAX_BODY_LENGTH
  ) {
    return SIGNATURE_INVALID;
  }

  try {
    const publicKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    const signedText = `${new URL(request.url).pathname}\n${bodyText}`;
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      signature,
      new TextEncoder().encode(signedText)
    );
    if (!valid) return SIGNATURE_INVALID;

    const body: unknown = JSON.parse(bodyText);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return SIGNATURE_INVALID;
    }

    return {
      ok: true,
      body: body as Record<string, unknown>,
      deviceKey,
      deviceLabel: (request.headers.get('user-agent') ?? '').slice(0, 255),
    };
  } catch {
    return SIGNATURE_INVALID;
  }
}

export function isEmployeeCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= MAX_EMPLOYEE_CODE_LENGTH
  );
}

export async function findEmployee(employeeCode: string): Promise<EmployeeRow | null> {
  const result = await pool.query<EmployeeRow>(
    `SELECT ${EMPLOYEE_COLUMNS} FROM employees WHERE employee_code = $1`,
    [employeeCode]
  );
  return result.rows[0] ?? null;
}

type DeviceEvent = 'BOUND' | 'MISMATCH' | 'IN_USE';

async function logDeviceEvent(
  employeeCode: string,
  event: DeviceEvent,
  deviceKey: string,
  deviceLabel: string,
  source: string
) {
  try {
    await pool.query(
      `INSERT INTO device_binding_events (employee_code, event, device_public_key, device_label, source)
       VALUES ($1, $2, $3, $4, $5)`,
      [employeeCode, event, deviceKey, deviceLabel, source]
    );
  } catch (error) {
    // Denetim kaydı yazılamaması asıl işlemi engellememeli
    console.error('Cihaz olayı kaydedilemedi:', error);
  }
}

type AuthenticatedRequest =
  | {
      ok: true;
      employee: EmployeeRow;
      body: Record<string, unknown>;
      deviceKey: string;
    }
  | RequestFailure;

/**
 * Oturum gerektiren uç noktaların kimlik doğrulaması: istek, gövdedeki
 * `employeeCode` personeline BAĞLI cihazın anahtarıyla imzalanmış olmalıdır.
 * Sunucuda ayrı bir oturum tutulmaz; her istek kendi kanıtını taşır.
 *
 * Burada cihaz bağlanmaz. Bağlama yalnızca şifrenin doğrulandığı girişte yapılır
 * (bkz. bindDeviceAtLogin); aksi halde sicil numarasını bilen biri, hiç giriş
 * yapmamış bir personelin hesabını kendi telefonuna bağlayabilirdi.
 */
export async function authenticateRequest(
  request: Request,
  source: string
): Promise<AuthenticatedRequest> {
  const signed = await readSignedRequest(request);
  if (!signed.ok) return signed;

  const { employeeCode } = signed.body;
  if (!isEmployeeCode(employeeCode)) {
    return { ok: false, status: 400, message: 'Sicil no gereklidir.' };
  }

  const employee = await findEmployee(employeeCode);
  if (!employee) {
    return { ok: false, status: 404, message: 'Personel bulunamadı.' };
  }
  if (!employee.is_active) {
    return { ok: false, status: 403, message: 'Personel hesabı pasif durumda.' };
  }
  if (!employee.device_public_key) return NOT_BOUND;

  if (employee.device_public_key !== signed.deviceKey) {
    await logDeviceEvent(
      employee.employee_code,
      'MISMATCH',
      signed.deviceKey,
      signed.deviceLabel,
      source
    );
    return MISMATCH;
  }

  return { ok: true, employee, body: signed.body, deviceKey: signed.deviceKey };
}

/**
 * Giriş sırasında personelin cihaz bağını uygular:
 *  - Bağlı cihaz varsa imzalayan cihaz aynı olmalıdır, değilse 403.
 *  - Bağlı cihaz yoksa imzalayan cihaz personele bağlanır (ilk giriş).
 *
 * Çağıran taraf bundan ÖNCE şifreyi doğrulamış olmalıdır.
 */
export async function bindDeviceAtLogin(
  employee: EmployeeRow,
  device: { deviceKey: string; deviceLabel: string }
): Promise<{ ok: true } | RequestFailure> {
  const { deviceKey, deviceLabel } = device;
  const reject = async (failure: RequestFailure, event: DeviceEvent) => {
    await logDeviceEvent(employee.employee_code, event, deviceKey, deviceLabel, 'login');
    return failure;
  };

  if (employee.device_public_key) {
    return employee.device_public_key === deviceKey
      ? { ok: true }
      : reject(MISMATCH, 'MISMATCH');
  }

  try {
    // "IS NULL" koşulu eşzamanlı iki ilk-bağlama isteğinden yalnızca birini geçirir
    const bound = await pool.query(
      `UPDATE employees
          SET device_public_key = $1,
              device_bound_at = now(),
              device_label = $2
        WHERE id = $3 AND device_public_key IS NULL`,
      [deviceKey, deviceLabel, employee.id]
    );

    if (bound.rowCount === 1) {
      await logDeviceEvent(employee.employee_code, 'BOUND', deviceKey, deviceLabel, 'login');
      console.log(`[Cihaz Bağlandı] ${employee.employee_code}`);
      return { ok: true };
    }
  } catch (error) {
    if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return reject(IN_USE, 'IN_USE');
    }
    throw error;
  }

  // Araya başka bir istek girip bağlamayı yaptı; onun bağladığı cihazla karşılaştır
  const current = await findEmployee(employee.employee_code);
  return current?.device_public_key === deviceKey
    ? { ok: true }
    : reject(MISMATCH, 'MISMATCH');
}
