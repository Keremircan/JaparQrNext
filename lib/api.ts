// İstemci tarafı API çağrısı: isteği cihaz anahtarıyla imzalar ve her tür
// hatayı (ağ, zaman aşımı, sunucu, cihaz) tek biçimde döndürür.

import {
  DEVICE_UNSUPPORTED_MESSAGE,
  DeviceUnsupportedError,
  signedPost,
} from './deviceId';

export type ApiFailure = {
  ok: false;
  /** HTTP durum kodu; istek sunucuya ulaşmadıysa 0 */
  status: number;
  code?: string;
  message: string;
};

export type ApiResult<T> = { ok: true; data: T } | ApiFailure;

const NETWORK_MESSAGE =
  'Sunucuya erişilemedi. İnternet veya Wi-Fi bağlantınızı kontrol edin.';

export async function apiPost<T>(
  path: string,
  payload: Record<string, unknown>
): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await signedPost(path, payload);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      message:
        error instanceof DeviceUnsupportedError
          ? DEVICE_UNSUPPORTED_MESSAGE
          : NETWORK_MESSAGE,
    };
  }

  // Sunucu JSON dışında bir şey dönebilir (ör. vekil sunucunun hata sayfası)
  const data: unknown = await response.json().catch(() => null);
  const record =
    data && typeof data === 'object' ? (data as Record<string, unknown>) : null;

  if (response.ok && record?.success === true) {
    return { ok: true, data: record as T };
  }

  return {
    ok: false,
    status: response.status,
    code: typeof record?.code === 'string' ? record.code : undefined,
    message:
      typeof record?.message === 'string'
        ? record.message
        : 'Beklenmeyen bir sunucu hatası oluştu.',
  };
}

/** Bu cihaz hesaba bağlı değil: oturum geçersizdir, yeniden giriş gerekir. */
export function requiresRelogin(failure: ApiFailure): boolean {
  return failure.code === 'DEVICE_NOT_BOUND';
}

/** Cihaz eşleme kaynaklı ret (yanlış cihaz, başkasına kayıtlı cihaz vb.) */
export function isDeviceFailure(failure: ApiFailure): boolean {
  return failure.code?.startsWith('DEVICE_') ?? false;
}
