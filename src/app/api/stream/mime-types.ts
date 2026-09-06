/**
 * Minimal MIME type lookup for local file streaming.
 * Kept inline to ensure zero external CDN / network dependency.
 */
export const mime: Record<string, string> = {
  // Video
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  mov: 'video/quicktime',
  avi: 'video/x-msvideo',
  m4v: 'video/x-m4v',
  ogv: 'video/ogg',

  // Audio
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  m4a: 'audio/x-m4a',
  opus: 'audio/opus',

  // Image
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  avif: 'image/avif',
  tiff: 'image/tiff',
  tif: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',

  // Document / Text
  pdf: 'application/pdf',
  txt: 'text/plain',
  md: 'text/markdown',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  js: 'text/javascript',
  ts: 'text/typescript',
  json: 'application/json',
  xml: 'application/xml',
  csv: 'text/csv',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  sh: 'text/x-shellscript',

  // Office / Code
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  doc: 'application/msword',
  xls: 'application/vnd.ms-excel',
  ppt: 'application/vnd.ms-powerpoint',
  py: 'text/x-python',
  rs: 'text/x-rustsrc',
  go: 'text/x-go',
  java: 'text/x-java',
  cpp: 'text/x-c++src',
  c: 'text/x-csrc',
  tsx: 'text/typescript',
  jsx: 'text/javascript',
  vue: 'text/plain',
  sql: 'text/x-sql',

  // Archive
  zip: 'application/zip',
  tar: 'application/x-tar',
  gz: 'application/gzip',
  '7z': 'application/x-7z-compressed',
  rar: 'application/x-rar-compressed',
  iso: 'application/x-iso9660-image',
  dmg: 'application/x-apple-diskimage',
  service: 'text/plain',
};
