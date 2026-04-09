import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// 1. Define routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)', 
  '/forum(.*)',
  // Add other private routes here
]);

export default clerkMiddleware(async (auth, req) => {
  // 2. Check if the current route is protected
  if (isProtectedRoute(req)) {
    // FIX 1: Use 'auth.protect()' (no parentheses on auth) for Clerk v6
    await auth.protect(); 
  }
});

export const config = {
  matcher: [
    // FIX 2: This regex prevents the infinite loop by ignoring internal _next files and static assets
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};