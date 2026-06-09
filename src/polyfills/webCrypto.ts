import 'react-native-get-random-values';

type CryptoLike = {
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
  subtle?: {
    digest?: (algorithm: AlgorithmIdentifier, data: BufferSource) => Promise<ArrayBuffer>;
  };
};

type ExpoCryptoLike = {
  CryptoDigestAlgorithm: {
    SHA256: 'SHA-256';
  };
  digest: (algorithm: 'SHA-256', data: BufferSource) => Promise<ArrayBuffer>;
  getRandomValues?: <T extends ArrayBufferView | null>(array: T) => T;
};

declare const require: (moduleName: string) => unknown;

let cachedExpoCrypto: ExpoCryptoLike | null | undefined;

function getExpoCrypto(): ExpoCryptoLike | null {
  if (cachedExpoCrypto !== undefined) {
    return cachedExpoCrypto;
  }

  try {
    cachedExpoCrypto = require('expo-crypto') as ExpoCryptoLike;
  } catch (error) {
    cachedExpoCrypto = null;
    if (__DEV__) {
      console.warn(
        '[polyfill][webCrypto] expo-crypto native module is unavailable. Rebuild the dev client to enable PKCE S256.',
        error
      );
    }
  }

  return cachedExpoCrypto;
}

function normalizeDigestAlgorithm(algorithm: AlgorithmIdentifier): 'SHA-256' {
  const name =
    typeof algorithm === 'string'
      ? algorithm
      : typeof algorithm?.name === 'string'
        ? algorithm.name
        : '';
  const normalizedName = name.toUpperCase().replace(/_/g, '-');

  if (normalizedName !== 'SHA-256' && normalizedName !== 'SHA256') {
    throw new Error(`Unsupported WebCrypto digest algorithm: ${name || 'unknown'}`);
  }

  return 'SHA-256';
}

const runtimeGlobal = globalThis as unknown as { crypto?: CryptoLike };
const globalCrypto = (runtimeGlobal.crypto ?? {}) as CryptoLike;

if (typeof globalCrypto.getRandomValues !== 'function') {
  const expoCrypto = getExpoCrypto();
  if (typeof expoCrypto?.getRandomValues === 'function') {
    globalCrypto.getRandomValues = expoCrypto.getRandomValues as CryptoLike['getRandomValues'];
  }
}

if (!globalCrypto.subtle) {
  globalCrypto.subtle = {};
}

if (typeof globalCrypto.subtle.digest !== 'function') {
  globalCrypto.subtle.digest = async (algorithm: AlgorithmIdentifier, data: BufferSource) => {
    const expoCrypto = getExpoCrypto();
    if (!expoCrypto) {
      throw new Error('expo-crypto native module is unavailable. Rebuild the dev client to enable WebCrypto.');
    }
    return expoCrypto.digest(normalizeDigestAlgorithm(algorithm), data);
  };
}

runtimeGlobal.crypto = globalCrypto;
