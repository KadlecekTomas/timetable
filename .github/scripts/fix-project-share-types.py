from pathlib import Path

path = Path("apps/web/lib/local/project-share.ts")
text = path.read_text()

text = text.replace(
    '''function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}
''',
    '''function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
''',
    1,
)
text = text.replace(
    'crypto.subtle.digest("SHA-256", utf8(value))',
    'crypto.subtle.digest("SHA-256", ownedArrayBuffer(utf8(value)))',
    1,
)
text = text.replace('new Blob([bytes])', 'new Blob([ownedArrayBuffer(bytes)])', 2)
text = text.replace(
    '''function normalizeShareData(value: unknown): BrowserProjectShareData {
  if (!isRecord(value) || !isRecord(value.localStorage)) {
    throw new Error("Sdílený projekt nemá platnou strukturu pracovních dat.");
  }
  if (!isRecord(value.project)) {
''',
    '''function normalizeShareData(value: unknown): BrowserProjectShareData {
  if (!isRecord(value)) {
    throw new Error("Sdílený projekt nemá platnou strukturu pracovních dat.");
  }
  const localStorageValue = value.localStorage;
  if (!isRecord(localStorageValue)) {
    throw new Error("Sdílený projekt nemá platnou strukturu pracovních dat.");
  }
  if (!isRecord(value.project)) {
''',
    1,
)
text = text.replace(
    'const item = value.localStorage[key];',
    'const item = localStorageValue[key];',
    1,
)

path.write_text(text)
