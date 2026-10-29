/** Format prose from older saved reports without changing stored sources or code. */
export function uiText(text: string): string {
  return text.replace(/([가-힣])\s*\u00b7\s*(?=[가-힣])/g, '$1 및 ').replace(/\s*\u00b7\s*/g, ', ');
}

export function uiCopy<T>(value: T): T {
  if (typeof value === 'string') return uiText(value) as T;
  if (Array.isArray(value)) return value.map(item => uiCopy(item)) as T;
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, uiCopy(item)])) as T;
  return value;
}
