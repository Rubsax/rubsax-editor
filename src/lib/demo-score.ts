export const DEMO_SCORE_PUBLIC_URL = '/demo/parabens-teste-universal.mscz';
export const DEMO_SCORE_FILE_NAME = 'Parabéns pra Você - teste universal.mscz';
export const DEMO_SCORE_SHA256 =
  '1b09db4e3217a1ff36f5d07666aa8decba59b070bea630c47ee785b5f37b0e71';

export function isOfficialDemoHash(fileHash?: string | null): boolean {
  if (!fileHash) return false;
  return fileHash.trim().toLowerCase() === DEMO_SCORE_SHA256;
}
