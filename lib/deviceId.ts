// İstemci tarafı cihaz kimliği.
//
// Cihaz, IndexedDB'de saklanan ve dışa aktarılamayan (extractable: false) bir
// ECDSA P-256 özel anahtarıyla tanımlanır. Anahtar tarayıcıdan okunamadığı için
// başka bir telefona kopyalanamaz; sunucuya yalnızca açık anahtar ve isteğin
// imzası gider (bkz. lib/deviceBinding.ts).

const DB_NAME = 'japar-device';
const STORE_NAME = 'keys';
const KEY_ID = 'device-key-v1';
const LEGACY_STORAGE_KEY = 'device_hardware_id';
const REQUEST_TIMEOUT_MS = 15_000;

const KEY_ALGORITHM: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const SIGN_ALGORITHM: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };

/** Tarayıcı cihaz anahtarını üretemiyor/saklayamıyor (HTTPS değil, IndexedDB kapalı vb.) */
export class DeviceUnsupportedError extends Error {
  constructor(cause?: unknown) {
    super('Device key is not available in this browser');
    this.name = 'DeviceUnsupportedError';
    this.cause = cause;
  }
}

type DeviceIdentity = {
  privateKey: CryptoKey;
  publicKey: string; // raw, base64url
};

function toBase64Url(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('IndexedDB blocked'));
  });
}

function readKeyPair(db: IDBDatabase): Promise<CryptoKeyPair | undefined> {
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(STORE_NAME, 'readonly')
      .objectStore(STORE_NAME)
      .get(KEY_ID);
    request.onsuccess = () => resolve(request.result as CryptoKeyPair | undefined);
    request.onerror = () => reject(request.error);
  });
}

// Aynı anda iki sekme anahtar üretirse ilk yazılan kazanır; ikisi de onu kullanır.
function storeKeyPairIfAbsent(
  db: IDBDatabase,
  candidate: CryptoKeyPair
): Promise<CryptoKeyPair> {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    let winner = candidate;

    const existing = store.get(KEY_ID);
    existing.onsuccess = () => {
      if (existing.result) {
        winner = existing.result as CryptoKeyPair;
      } else {
        store.put(candidate, KEY_ID);
      }
    };
    transaction.oncomplete = () => resolve(winner);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

async function loadIdentity(): Promise<DeviceIdentity> {
  if (
    typeof window === 'undefined' ||
    !window.crypto?.subtle ||
    typeof indexedDB === 'undefined'
  ) {
    throw new DeviceUnsupportedError();
  }

  try {
    const db = await openDatabase();
    try {
      let keyPair = await readKeyPair(db);

      if (!keyPair) {
        const candidate = await crypto.subtle.generateKey(KEY_ALGORITHM, false, [
          'sign',
          'verify',
        ]);
        keyPair = await storeKeyPairIfAbsent(db, candidate);

        // Tarayıcıdan depolamayı "kalıcı" işaretlemesini iste: yer açmak için
        // otomatik silinmesini engeller. Reddedilirse anahtar yine çalışır.
        void navigator.storage?.persist?.().catch(() => false);
      }

      const rawPublicKey = await crypto.subtle.exportKey('raw', keyPair.publicKey);
      return {
        privateKey: keyPair.privateKey,
        publicKey: toBase64Url(rawPublicKey),
      };
    } finally {
      db.close();
    }
  } catch (error) {
    if (error instanceof DeviceUnsupportedError) throw error;
    throw new DeviceUnsupportedError(error);
  }
}

let identityPromise: Promise<DeviceIdentity> | null = null;

function getIdentity(): Promise<DeviceIdentity> {
  if (!identityPromise) {
    identityPromise = loadIdentity().catch((error) => {
      identityPromise = null; // sonraki denemede yeniden dene
      throw error;
    });
  }
  return identityPromise;
}

// Eski sistemin localStorage kimliği: yalnızca daha önce bu kimlikle eşlenmiş
// personelin yeni anahtara sorunsuz geçebilmesi için gönderilir, artık üretilmez.
function readLegacyHardwareId(): string | undefined {
  try {
    return localStorage.getItem(LEGACY_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Cihaz anahtarıyla imzalanmış JSON POST isteği gönderir.
 * İmza `${path}\n${body}` üzerinden alınır; sunucu aynı metni doğrular.
 *
 * @throws {DeviceUnsupportedError} Cihaz anahtarı oluşturulamıyorsa
 */
export async function signedPost(
  path: string,
  payload: Record<string, unknown>
): Promise<Response> {
  const identity = await getIdentity();

  const body = JSON.stringify({
    ...payload,
    legacyHardwareId: readLegacyHardwareId(),
  });

  const signature = await crypto.subtle.sign(
    SIGN_ALGORITHM,
    identity.privateKey,
    new TextEncoder().encode(`${path}\n${body}`)
  );

  // Zayıf Wi-Fi'da istek sonsuza kadar asılı kalmasın
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Device-Key': identity.publicKey,
        'X-Device-Signature': toBase64Url(signature),
      },
      body,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export const DEVICE_UNSUPPORTED_MESSAGE =
  'Bu tarayıcıda cihaz kimliği oluşturulamadı. Gizli sekme kullanmayın ve uygulamayı güvenli (https) adresinden açın.';
