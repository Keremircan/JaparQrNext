import * as OTPAuth from 'otpauth';
import { decryptQrPayload, loadQrSecrets } from './qrToken';

// Sırlar açılışta bir kez doğrulanır. Eksik, zayıf veya herkese açık örnek
// değerlerle karekod doğrulaması hiç yapılmaz (fail closed).
const loaded = loadQrSecrets();
if (!loaded.ok) {
  console.error(
    `[QR] Karekod doğrulaması devre dışı: ${loaded.problems.join('; ')}.`
  );
}
const secrets = loaded.ok ? loaded.secrets : null;

// TOTP parametreleri kiosk (japar-kiosk/app/api/qr/route.ts) ile birebir aynı olmalı
const totp = secrets
  ? new OTPAuth.TOTP({
      issuer: 'FactorySystem',
      label: 'Gate-01',
      algorithm: 'SHA256',
      digits: 6,
      period: 10,
      secret: OTPAuth.Secret.fromBase32(secrets.sharedSecretBase32),
    })
  : null;

type QrVerification =
  | { success: true; data: { token: string; factoryId: string; gateId: string } }
  | { success: false; reason: string };

const isShortText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 50;

export function verifyQRData(qrString: string): QrVerification {
  if (!totp || !secrets) {
    return {
      success: false,
      reason: 'Sunucu yapılandırması eksik. Lütfen yöneticinize bildirin.',
    };
  }

  try {
    // Kimlik doğrulamalı şifre çözme: değiştirilmiş veya sahte karekod null döner
    const decryptedText = decryptQrPayload(qrString, secrets);

    if (!decryptedText) {
      return {
        success: false,
        reason: 'Geçersiz karekod. Lütfen kapıdaki ekranı okutun.',
      };
    }

    const payload: unknown = JSON.parse(decryptedText);
    const { t, f, d } = (payload ?? {}) as Record<string, unknown>;

    // factory_id / gate_id kolonları varchar(50)
    if (typeof t !== 'string' || !/^\d{6}$/.test(t) || !isShortText(f) || !isShortText(d)) {
      return {
        success: false,
        reason: 'Geçersiz karekod. Lütfen kapıdaki ekranı okutun.',
      };
    }

    const delta = totp.validate({
      token: t,
      window: 1, // +- 10 saniyelik ağ toleransı
    });

    if (delta === null) {
      return {
        success: false,
        reason: 'Karekodun süresi dolmuş. Ekrandaki yeni kodu okutun.',
      };
    }

    return {
      success: true,
      data: { token: t, factoryId: f, gateId: d },
    };
  } catch {
    // Şifre çözme / JSON hataları: kapı ekranına ait olmayan bir karekod
    return {
      success: false,
      reason: 'Geçersiz karekod. Lütfen kapıdaki ekranı okutun.',
    };
  }
}
