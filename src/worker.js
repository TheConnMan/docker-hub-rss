import pkg from '../package.json';
import { generateFeed } from '../lib/feed.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let segments = url.pathname.split('/').filter(Boolean);

    // /info -> JSON { version }
    if (segments.length === 1 && segments[0] === 'info') {
      return new Response(JSON.stringify({ version: pkg.version }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Strip an optional leading /r segment, then a trailing .atom on the repo.
    if (segments[0] === 'r') {
      segments = segments.slice(1);
    }
    if (segments.length) {
      const last = segments.length - 1;
      segments[last] = segments[last].replace(/\.atom$/, '');
    }

    // Feed routes are exactly two segments (user + repo).
    if (segments.length !== 2 || !segments[0] || !segments[1]) {
      return new Response('Not found', { status: 404 });
    }

    return handleFeed(request, url, env, ctx, segments[0], segments[1]);
  },
};

async function handleFeed(request, url, env, ctx, username, repository) {
  // Edge cache: keyed on the full request URL.
  const cache = caches.default;
  const hit = await cache.match(request);
  if (hit) {
    return hit;
  }

  try {
    const xml = await generateFeed({
      username,
      repository,
      filters: {
        include: url.searchParams.get('include'),
        exclude: url.searchParams.get('exclude'),
        includeRegex: url.searchParams.get('includeRegex'),
        excludeRegex: url.searchParams.get('excludeRegex'),
      },
      tagsFetchLimit: env.TAGS_FETCH_LIMIT,
      // Optional Docker Hub auth (Worker secrets). Absent -> anonymous.
      auth: { username: env.DOCKERHUB_USERNAME, token: env.DOCKERHUB_TOKEN },
    });
    const response = new Response(xml, {
      headers: {
        'Content-Type': 'text/xml',
        'Cache-Control': 'public, max-age=1800',
      },
    });
    ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  } catch (e) {
    console.error(e);
    return new Response(e.message, { status: 500 });
  }
}
