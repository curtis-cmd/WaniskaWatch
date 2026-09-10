import {NextRequest, NextResponse} from 'next/server';
import directory from './public/data/jurisdiction-status.json';
import {publicStatus} from './app/publication-freshness.mjs';

// A failed refresh must not leave old public snapshots accessible indefinitely.
// This guard runs before public asset delivery on the production Next/Vercel path.
export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname.replace(/^\/watch(?=\/|$)/, '');
  const statuses = Object.fromEntries(Object.entries(directory.jurisdictions).map(([key, value]) => [key, publicStatus(value)]));
  if (pathname === '/data/jurisdiction-status.json') {
    return NextResponse.json({...directory, jurisdictions: statuses}, {headers: {'Cache-Control': 'no-store'}});
  }
  const key = Object.keys(statuses).find(key => pathname.startsWith(`/data/${key}-`) || pathname.startsWith(`/data/canada-detail/${key}-`));
  const expiredSummary = ['/data/canada-claims-overview.json', '/data/canada-detail-index.json', '/data/province-coverage.json'].includes(pathname)
    && Object.entries(directory.jurisdictions).some(([key, value]) => value.state === 'verified' && statuses[key].state !== 'verified');
  if ((key && statuses[key].state !== 'verified') || expiredSummary) {
    return NextResponse.json({error: 'Records temporarily withheld pending current source verification.'}, {status: 503, headers: {'Cache-Control': 'no-store'}});
  }
  const response = NextResponse.next();
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
export const config = {matcher: ['/data/:path*']};
