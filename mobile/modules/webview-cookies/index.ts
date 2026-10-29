import { requireOptionalNativeModule } from 'expo';

type WebviewCookiesModule = {
  getCookies(url: string): string;
  clearCookies(): void;
};

// Only present in Android builds of the app (not on web or in Expo Go).
const native = requireOptionalNativeModule<WebviewCookiesModule>('WebviewCookies');

export const webviewCookiesAvailable = !!native;

/** Cookies the WebView holds for `url`, as a name → value map. */
export function getWebviewCookies(url: string): Record<string, string> {
  const header = native?.getCookies(url) ?? '';
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function clearWebviewCookies() {
  native?.clearCookies();
}
