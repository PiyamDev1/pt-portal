// Next.js treats `server-only` as a compile-time boundary marker. Vitest does
// not resolve that virtual marker, so server module tests use this empty shim.
export {}
