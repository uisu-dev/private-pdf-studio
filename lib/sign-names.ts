export function signedPdfFilename(originalName: string) {
  const trimmed = originalName.trim() || "document.pdf";
  const base = trimmed.replace(/\.pdf$/i, "");
  return `${base}_서명.pdf`;
}

export function markPngFilename(label: string) {
  const cleaned = label.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim();
  return `${cleaned || "서명"}.png`;
}
