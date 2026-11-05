import { getNeonBearer } from './portal-auth';

const validImages = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadPortalImage(file: File, kind: 'application' | 'self' | 'member' | 'management' | 'showcase') {
  if (!validImages.includes(file.type)) throw new Error('Use a JPEG, PNG or WebP image.');
  if (file.size < 100 || file.size > 5 * 1024 * 1024) throw new Error('Image must be under 5 MB.');
  const token = await getNeonBearer();
  const signed = await fetch('/api/photo-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ kind, content_type: file.type, size: file.size }),
  });
  const json = await signed.json();
  if (!signed.ok || typeof json.upload_url !== 'string' || typeof json.public_url !== 'string')
    throw new Error(json.error || 'Neon photo upload could not be prepared.');
  const put = await fetch(json.upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!put.ok) throw new Error('Photo upload failed. Check Neon Storage CORS or try again later.');
  return json.public_url as string;
}
