/**
 * Wire format: JSON compressed with raw DEFLATE, using the browser's built-in CompressionStream
 * (Chrome 103+, Safari/iOS 16.4+, Firefox 113+). Game state compresses 4-7x, which matters because
 * relayed (TURN) traffic counts against a monthly allowance.
 */

// Real messages are tiny (a four-player snapshot is about 500 B packed). The limits stop
// a hostile peer from sending a "decompression bomb" that expands into gigabytes and crashes the tab.
export const MAX_PACKED_BYTES = 64 * 1024;
export const MAX_UNPACKED_BYTES = 1024 * 1024;

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream, limit: number): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart]).stream().pipeThrough(transform).getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error('Message too large');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

export const encode = (msg: unknown): Promise<Uint8Array> =>
  pipe(new TextEncoder().encode(JSON.stringify(msg)), new CompressionStream('deflate-raw'), Infinity);

/** Rejects on anything that isn't a compressed JSON message within the size limits; callers drop those. */
export async function decode(data: unknown): Promise<unknown> {
  const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
  if (!bytes) throw new Error('Expected binary data');
  if (bytes.byteLength > MAX_PACKED_BYTES) throw new Error('Message too large');
  return JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'), MAX_UNPACKED_BYTES)));
}
