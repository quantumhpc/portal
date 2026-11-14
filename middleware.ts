// Next 16 requires the middleware function to be statically visible in this
// module — a bare re-export from next-auth is not recognized at build time.
import { withAuth } from "next-auth/middleware";

export default withAuth({});

// Excluded routes check the session themselves:
// - api/data/tus: middleware buffers request bodies (10 MB cap), breaking upload chunks.
// - api/vnc/authorize: nginx auth_request needs 401/403, not a redirect to sign-in.
export const config = {
  matcher: [
    "/((?!login|api/auth|api/data/tus|api/vnc/authorize|_next/static|_next/image|favicon.ico|icon.svg|logos|img|apps).*)",
  ],
};
