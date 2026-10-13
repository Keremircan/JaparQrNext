// Sunucu tarafı cihaz eşleme: istek imzasının doğrulanması ve personel-cihaz
// bağının kurulması / denetlenmesi. İstemci karşılığı: lib/deviceId.ts

import { pool } from './db';

export type DeviceErrorCode =
  | 'DEVICE_SIGNATURE_INVALID'
  | 'DEVICE_MISMATCH'
  | 'DEVICE_IN_USE';

export type DeviceFailure = {
  ok: false;
  status: number;
  code: DeviceErrorCode;
  message: string;
};

type SignedRequest =
  | { ok: true; body: Record<string, unknown>; deviceKey: string; deviceLabel: string }
  | DeviceFailure;

const SIGNATURE_INVALID: DeviceFailure = {
  ok: false,
  status: 401,
  code: 'DEVICE_SIGNATURE_INVALID',
  message:
    'Cihaz kimliği doğrulanamadı. Uygulamayı kapatıp yeniden açın ve tekrar deneyin.',
};

const MISMATCH: DeviceFailure = {
  ok: false,
  status: 403,
  code: 'DEVICE_MISMATCH',
  message:
    'Yalnızca kayıtlı cihazınızdan işlem yapabilirsiniz. Telefonunuzu değiştirdiyseniz yöneticinize başvurun.',
};

const IN_USE: DeviceFailure = {
  ok: false,
  status: 403,
  code: 'DEVICE_IN_USE',
  message:
    'Bu cihaz başka bir personele kayıtlı. Her personel yalnızca kendi telefonundan işlem yapabilir.',
};

// P-256 açık anahtarı (sıkıştırılmamış nokta): 0x04 || X(32) || Y(32)
const RAW_PUBLIC_KEY_LENGTH = 65;
// WebCrypto ECDSA imzası: r(32) || s(32)
const SIGNATURE_LENGTH = 64;
const PG_UNIQUE_VIOLATION = '23505';

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
    signature.length !== SIGNATURE_LENGTH
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

type BindableEmployee = {
  id: number;
  employee_code: string;
  device_public_key: string | null;
  registered_hardware_id: string | null;
};

/**
 * Personelin cihaz bağını uygular:
 *  - Bağlı cihaz varsa imzalayan cihaz aynı olmalıdır, değilse 403.
 *  - Bağlı cihaz yoksa imzalayan cihaz personele bağlanır (ilk kullanım).
 *
 * Çağıran taraf bundan ÖNCE personelin kimliğini doğrulamış olmalıdır
 * (login'de şifre); aksi halde ilk bağlama başkası adına yapılabilir.
 */
export async function enforceDeviceBinding(
  employee: BindableEmployee,
  device: { deviceKey: string; deviceLabel: string; legacyHardwareId?: unknown },
  source: 'login' | 'verify'
): Promise<{ ok: true } | DeviceFailure> {
  const { deviceKey, deviceLabel } = device;
  const reject = async (failure: DeviceFailure, event: DeviceEvent) => {
    await logDeviceEvent(employee.employee_code, event, deviceKey, deviceLabel, source);
    return failure;
  };

  if (employee.device_public_key) {
    return employee.device_public_key === deviceKey
      ? { ok: true }
      : reject(MISMATCH, 'MISMATCH');
  }

  // Eski sistemde (localStorage kimliği) eşlenmiş personel: yeni anahtara yalnızca
  // o eski kimliği taşıyan telefon geçebilir.
  if (
    employee.registered_hardware_id &&
    employee.registered_hardware_id !== device.legacyHardwareId
  ) {
    return reject(MISMATCH, 'MISMATCH');
  }

  try {
    // "IS NULL" koşulu eşzamanlı iki ilk-bağlama isteğinden yalnızca birini geçirir
    const bound = await pool.query(
      `UPDATE employees
          SET device_public_key = $1,
              device_bound_at = now(),
              device_label = $2,
              registered_hardware_id = NULL
        WHERE id = $3 AND device_public_key IS NULL`,
      [deviceKey, deviceLabel, employee.id]
    );

    if (bound.rowCount === 1) {
      await logDeviceEvent(employee.employee_code, 'BOUND', deviceKey, deviceLabel, source);
      console.log(`[Cihaz Bağlandı] ${employee.employee_code} (${source})`);
      return { ok: true };
    }
  } catch (error) {
    if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
      return reject(IN_USE, 'IN_USE');
    }
    throw error;
  }

  // Araya başka bir istek girip bağlamayı yaptı; onun bağladığı cihazla karşılaştır
  const current = await pool.query(
    'SELECT device_public_key FROM employees WHERE id = $1',
    [employee.id]
  );
  return current.rows[0]?.device_public_key === deviceKey
    ? { ok: true }
    : reject(MISMATCH, 'MISMATCH');
}
