export function getPublicUrl(accountId: string, bucketName: string, key: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${key}`;
}
