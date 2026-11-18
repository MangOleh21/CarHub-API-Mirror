const blobHostSuffix = '.public.blob.vercel-storage.com';
const cloudinaryHost = 'res.cloudinary.com';
const signatureLength = 12;

function getImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a) {
    return 'image/png';
  }
  if (bytes.length >= signatureLength
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

export async function verifyManagedImage(imageUrl) {
  const url = new URL(imageUrl);
  const isCloudinaryImage = url.hostname === cloudinaryHost
    && /^\/[A-Za-z0-9_-]+\/image\/upload\//.test(url.pathname);
  if (!url.hostname.endsWith(blobHostSuffix) && !isCloudinaryImage) return true;

  const response = await fetch(url, {
    headers: { range: `bytes=0-${signatureLength - 1}` },
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || !response.body) return false;

  const reader = response.body.getReader();
  const chunks = [];
  let length = 0;
  while (length < signatureLength) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = value.subarray(0, signatureLength - length);
    chunks.push(chunk);
    length += chunk.length;
  }
  await reader.cancel();

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }

  const detectedType = getImageType(bytes);
  const responseType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  return detectedType !== null && detectedType === responseType;
}
