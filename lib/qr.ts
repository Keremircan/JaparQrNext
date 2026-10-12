import CryptoJS from 'crypto-js';
import * as OTPAuth from 'otpauth';

const SHARED_SECRET_BASE32 = process.env.SHARED_SECRET_BASE32 || '';
const AES_SECRET_KEY = process.env.AES_SECRET_KEY || '';

const totp = new OTPAuth.TOTP({
  issuer: 'FactorySystem',
  label: 'Gate-01',
  algorithm: 'SHA256',
  digits: 6,
  period: 10,
  secret: OTPAuth.Secret.fromBase32(SHARED_SECRET_BASE32),
});

// Çift okutma kontrolü için geçici Set
export const usedTokens = new Set<string>();

export function verifyQRData(qrString: string) {
  try {
    const bytes = CryptoJS.AES.decrypt(qrString, AES_SECRET_KEY);
    const decryptedText = bytes.toString(CryptoJS.enc.Utf8);

    if (!decryptedText) {
      return {
        success: false,
        reason: 'Güvenlik İhlali: Şifre çözülemedi veya anahtar uyuşmuyor.',
      };
    }

    const payload = JSON.parse(decryptedText);

    const delta = totp.validate({
      token: payload.t,
      window: 1, // +- 10 saniyelik ağ toleransı
    });

    if (delta === null) {
      return {
        success: false,
        reason: 'Karekodun süresi dolmuş veya geçersiz.',
      };
    }

    return {
      success: true,
      data: {
        token: payload.t,
        factoryId: payload.f,
        gateId: payload.d,
      },
    };
  } catch (error) {
    console.error('Doğrulama hatası:', error);
    return {
      success: false,
      reason: 'Güvenlik İhlali: Bozuk karekod formatı.',
    };
  }
}