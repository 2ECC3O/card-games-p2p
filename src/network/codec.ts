/**
 * Wire format: JSON compressed with raw DEFLATE, using the browser's built-in CompressionStream
 * (Chrome 103+, Safari/iOS 16.4+, Firefox 113+). Game state compresses 4-7x, which matters because
 * relayed (TURN) traffic counts against a monthly allowance.
 */
async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const encode = (msg: unknown): Promise<Uint8Array> =>
  pipe(new TextEncoder().encode(JSON.stringify(msg)), new CompressionStream('deflate-raw'));

/** Rejects on anything that isn't a compressed JSON message; callers drop those. */
export async function decode(data: unknown): Promise<unknown> {
  const bytes = data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;
  if (!bytes) throw new Error('Expected binary data');
  return JSON.parse(new TextDecoder().decode(await pipe(bytes, new DecompressionStream('deflate-raw'))));
}
