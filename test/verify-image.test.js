import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { verifyVercelBlobImage } from '../src/services/verify-image.js';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('existing non-Vercel HTTPS image URLs remain compatible without a server-side fetch', async () => {
  globalThis.fetch = async () => {
    throw new Error('External URLs must not be fetched');
  };

  assert.equal(await verifyVercelBlobImage('https://images.example.test/car.jpg'), true);
});

test('uploaded Vercel Blob images are checked against file signatures and response content type', async () => {
  const cases = [
    { type: 'image/jpeg', bytes: [0xff, 0xd8, 0xff] },
    { type: 'image/png', bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
    { type: 'image/webp', bytes: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50] },
  ];

  for (const { type, bytes } of cases) {
    let requestOptions;
    globalThis.fetch = async (_url, options) => {
      requestOptions = options;
      return new Response(new Uint8Array(bytes), {
        status: 206,
        headers: { 'content-type': type },
      });
    };

    assert.equal(
      await verifyVercelBlobImage(`https://store.public.blob.vercel-storage.com/cars/car.${type.slice(6)}`),
      true,
    );
    assert.equal(requestOptions.redirect, 'error');
    assert.equal(requestOptions.headers.range, 'bytes=0-11');
  }
});

test('uploaded Vercel Blob URLs with mismatched or unsupported image bytes are rejected', async () => {
  globalThis.fetch = async () => new Response('<script>alert(1)</script>', {
    status: 206,
    headers: { 'content-type': 'image/png' },
  });

  assert.equal(
    await verifyVercelBlobImage('https://store.public.blob.vercel-storage.com/cars/not-an-image.png'),
    false,
  );
});
