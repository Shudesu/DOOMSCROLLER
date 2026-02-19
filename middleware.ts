import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    const [scheme, encoded] = authHeader.split(' ');
    if (scheme === 'Basic' && encoded) {
      const decoded = atob(encoded);
      const [user, pass] = decoded.split(':');

      const validUser = process.env.BASIC_AUTH_USER || 'admin';
      const validPass = process.env.BASIC_AUTH_PASS;

      if (validPass && user === validUser && pass === validPass) {
        return NextResponse.next();
      }
    }
  }

  // If no BASIC_AUTH_PASS is set, skip auth (local dev)
  if (!process.env.BASIC_AUTH_PASS) {
    return NextResponse.next();
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="DOOMSCROLLER"',
    },
  });
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.svg).*)'],
};
