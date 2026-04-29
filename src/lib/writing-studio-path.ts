/** Matches `/dashboard/projects/:id/review` (optional trailing slash). */
export const WRITING_STUDIO_PATH = /^\/dashboard\/projects\/[^/]+\/review\/?$/;

export function isWritingStudioPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return WRITING_STUDIO_PATH.test(pathname);
}

/** Home + writing studio: no white header wash so diffuse backgrounds read cleanly. */
export function isTransparentMarketingHeader(pathname: string | null | undefined): boolean {
  if (!pathname || pathname === "/") return true;
  return isWritingStudioPath(pathname);
}
