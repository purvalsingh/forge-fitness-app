/**
 * Cloudflare Pages Function: proxies Supabase through this origin.
 * Some networks and DNS resolvers do not resolve *.supabase.co, which the browser reports
 * only as "Failed to fetch". Same-origin requests sidestep that (and the CORS preflight).
 */
interface Env { SUPABASE_ORIGIN?: string }

export const onRequest: PagesFunction<Env> = async ({ request, params, env }) => {
  const origin = env.SUPABASE_ORIGIN ?? 'https://jdogjpskctrpjtuygmdx.supabase.co'
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '')
  const target = new URL(`${origin}/${path}`)
  target.search = new URL(request.url).search

  const upstream = new Request(target.toString(), request)
  upstream.headers.delete('host')
  return fetch(upstream)
}
