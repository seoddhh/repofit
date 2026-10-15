const AUTH_PATHS = new Set(['/signin-with-chatgpt', '/signout-with-chatgpt', '/callback']);

export function safeRelativeReturnPath(value: string): string {
  if (!value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/';
  try {
    const url = new URL(value, 'https://app.local');
    const pathname = decodeURIComponent(url.pathname).replace(/\/+$/, '') || '/';
    if (url.origin !== 'https://app.local' || AUTH_PATHS.has(pathname) || pathname.startsWith('//') || pathname.includes('\\')) return '/';
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return '/'; }
}

export function chatGPTSignInPath(returnTo = '/'): string {
  return `/signin-with-chatgpt?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}

export function chatGPTSignOutPath(returnTo = '/'): string {
  return `/signout-with-chatgpt?return_to=${encodeURIComponent(safeRelativeReturnPath(returnTo))}`;
}
