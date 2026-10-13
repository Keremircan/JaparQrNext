import CryptoJS from 'crypto-js';
import * as OTPAuth from 'otpauth';

// Herkese açık örnek değerler (otpauth belgelerindeki örnek sır ve "1234…").
// Bunlarla üretilen karekodu herkes üretebilir; canlıda kullanılmamalıdır.
const SAMPLE_SHARED_SECRET = 'JBSWY3DPEHPK3PXP';
const SAMPLE_AES_KEY = '12345678901234567890123456789012';

const SHARED_SECRET_BASE32 = process.env.SHARED_SECRET_BASE32 || '';
const AES_SECRET_KEY = process.env.AES_SECRET_KEY || '';

const isConfigured = Boolean(SHARED_SECRET_BASE32 && AES_SECRET_KEY);

if (!isConfigured) {
  console.error(
    '[QR] SHARED_SECRET_BASE32 / AES_SECRET_KEY tanımlı değil; karekod doğrulaması devre dışı.'
  );
} else if (
  SHARED_SECRET_BASE32 === SAMPLE_SHARED_SECRET ||
  AES_SECRET_KEY === SAMPLE_AES_KEY
) {
  console.error(
    '[QR] GÜVENLİK UYARISI: SHARED_SECRET_BASE32 / AES_SECRET_KEY herkese açık örnek değerlerde. Canlıya çıkmadan önce değiştirin.'
  );
}

const totp = isConfigured
  ? new OTPAuth.TOTP({
      issuer: 'FactorySystem',
      label: 'Gate-01',
      algorithm: 'SHA256',
      digits: 6,
      period: 10,
      secret: OTPAuth.Secret.fromBase32(SHARED_SECRET_BASE32),
    })
  : null;

type QrVerification =
  | { success: true; data: { token: string; factoryId: string; gateId: string } }
  | { success: false; reason: string };

const isShortText = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= 50;

export function verifyQRData(qrString: string): QrVerification {
  if (!totp) {
    return {
      success: false,
      reason: 'Sunucu yapılandırması eksik. Lütfen yöneticinize bildirin.',
    };
  }

  try {
    const bytes = CryptoJS.AES.decrypt(qrString, AES_SECRET_KEY);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

    if (!decryptedText) {
      return {
        success: false,
        reason: 'Geçersiz karekod. Lütfen kapıdaki ekranı okutun.',
      };
    }

    const payload: unknown = JSON.parse(decryptedText);
    const { t, f, d } = (payload ?? {}) as Record<string, unknown>;

    // factory_id / gate_id kolonları varchar(50)
    if (typeof t !== 'string' || !isShortText(f) || !isShortText(d)) {
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
