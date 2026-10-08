import html from '../../public/client/index.html?raw';
export function GET(request: Request) {
  const path = new URL(request.url).pathname;
  const known = ['/posts', '/archive', '/tags', '/about', '/admin'];
  if (!known.includes(path) && !path.startsWith('/posts/')) return new Response('页面不存在', { status: 404 });
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });
}
