import { Buffer } from 'buffer';

if (typeof globalThis.Buffer === 'undefined') {
  globalThis.Buffer = Buffer;
}
if (typeof window !== 'undefined' && typeof (window as any).Buffer === 'undefined') {
  (window as any).Buffer = Buffer;
}
if (typeof global !== 'undefined' && typeof (global as any).Buffer === 'undefined') {
  (global as any).Buffer = Buffer;
}
