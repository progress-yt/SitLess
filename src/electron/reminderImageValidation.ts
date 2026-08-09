import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

export const MAX_REMINDER_IMAGE_BYTES = 20 * 1024 * 1024;
export const REMINDER_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'] as const;

export interface ValidatedReminderImage {
  extension: string;
  bytes: Buffer;
}

export function readValidatedReminderImage(
  filePath: string,
  maxBytes = MAX_REMINDER_IMAGE_BYTES
): ValidatedReminderImage {
  const extension = extname(filePath).toLowerCase();
  if (!REMINDER_IMAGE_EXTENSIONS.includes(extension as typeof REMINDER_IMAGE_EXTENSIONS[number])) {
    throw new Error('不支持该提醒图片格式');
  }

  const file = statSync(filePath);
  if (!file.isFile() || file.size === 0 || file.size > maxBytes) {
    throw new Error('提醒图片无效或超过大小限制');
  }

  const bytes = readFileSync(filePath);
  if (!validateReminderImage(extension, bytes)) {
    throw new Error('提醒图片内容与文件格式不匹配');
  }
  return { extension, bytes };
}

export function validateReminderImage(extension: string, bytes: Buffer): boolean {
  if (extension === '.png') {
    return bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (extension === '.gif') {
    const signature = bytes.subarray(0, 6).toString('ascii');
    return signature === 'GIF87a' || signature === 'GIF89a';
  }
  if (extension === '.webp') {
    return bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  }
  if (extension === '.svg') {
    const source = bytes.toString('utf8').trim();
    return /^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(source)
      && !/<(?:script|foreignObject|iframe|object|embed)\b/i.test(source)
      && !/\bon\w+\s*=/i.test(source)
      && !/(?:href|src)\s*=\s*["']\s*(?:https?:|file:|javascript:|data:)/i.test(source)
      && !/<!DOCTYPE|<!ENTITY/i.test(source);
  }
  return false;
}
