import { getChatGPTUser } from '@/app/chatgpt-auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const user = await getChatGPTUser();
  return Response.json({
    authenticated: Boolean(user),
    identitySource: process.env.NODE_ENV === 'production' ? 'chatgpt-sites' : 'local-preview',
    user: user ? { displayName: user.displayName, email: user.email, fullName: user.fullName } : null,
    // Identity does not grant permission to use a visitor's ChatGPT plan.
    planUsage: { status: 'not_connected', available: false },
  }, { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
}
