import { IMAGE_TYPE_EXTENSIONS, isModFileName, LIMITS } from "@vgskins/shared";

export function fileSize(file: File): string {
  return `${(file.size / 1024 / 1024).toFixed(file.size >= 1024 * 1024 ? 1 : 2)} MB`;
}

export function modFileValidation(file: File): string | null {
  if (!isModFileName(file.name)) {
    return `${file.name} is not a supported DAT file`;
  }
  if (file.size > LIMITS.FILE_SIZE_DAT) {
    return `${file.name} exceeds the ${LIMITS.FILE_SIZE_DAT / 1024 / 1024} MB limit`;
  }
  return null;
}

export function imageFileValidation(file: File): string | null {
  if (!(file.type in IMAGE_TYPE_EXTENSIONS)) {
    return `${file.name} must be PNG, JPEG, WebP, or GIF`;
  }
  if (file.size > LIMITS.FILE_SIZE_IMAGE) {
    return `${file.name} exceeds the ${LIMITS.FILE_SIZE_IMAGE / 1024 / 1024} MB limit`;
  }
  return null;
}
