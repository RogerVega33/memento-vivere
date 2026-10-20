import { authenticateRequest } from '@/server/auth-http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export function POST(request: Request) { return authenticateRequest(request, 'register'); }
