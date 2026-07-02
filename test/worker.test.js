import {
  env,
  fetchMock,
  createExecutionContext,
  waitOnExecutionContext,
} from 'cloudflare:test';
import { describe, it, expect, beforeAll } from 'vitest';
import worker from '../src/worker';
import goldenFeed from './fixtures/golden-feed.xml?raw';
import pkg from '../package.json';
import {
  repository,
  user,
  userNoGravatar,
  tagsPage1,
  tagsEmpty,
} from './fixtures/dockerhub-responses.js';

const HOST = 'https://hub.docker.com';

// Normalize the only non-deterministic field so output can be compared to the
// golden fixture, which carries the __LAST_BUILD_DATE__ placeholder.
function normalize(xml) {
  return xml.replace(
    /<lastBuildDate>.*?<\/lastBuildDate>/,
    '<lastBuildDate>__LAST_BUILD_DATE__</lastBuildDate>',
  );
}

// Register single-shot interceptors for a full feed build: repo + user + one
// tags page + an empty page 2 (the recursion fetches page 2 and stops on the
// empty result). Single-shot (no .persist()) so the real worker must consume
// each exactly once; a leftover pending interceptor means the worker skipped a
// call, and a second unexpected fetch (e.g. missed cache) throws.
function mockFeed({ userResponse = user } = {}) {
  const client = fetchMock.get(HOST);
  client
    .intercept({ path: '/v2/repositories/acme/widget/', method: 'GET' })
    .reply(200, repository);
  client
    .intercept({ path: '/v2/users/acme/', method: 'GET' })
    .reply(200, userResponse);
  client
    .intercept({
      path: '/v2/repositories/acme/widget/tags?page_size=100&page=1',
      method: 'GET',
    })
    .reply(200, tagsPage1);
  client
    .intercept({
      path: '/v2/repositories/acme/widget/tags?page_size=100&page=2',
      method: 'GET',
    })
    .reply(200, tagsEmpty);
}

// Same full-build interceptors as mockFeed, but every Docker Hub call must
// carry `Authorization: Bearer test-jwt`, and a single login POST (matched on
// its exact credential body) hands back that JWT. Header matchers mean a call
// missing the Bearer token finds no interceptor and throws (net connect is
// disabled), so a passing test proves auth was threaded onto every request; the
// single-shot login interceptor proves login ran exactly once per feed build.
function mockFeedAuthed({ username = 'dhuser', token = 'dhtoken' } = {}) {
  const client = fetchMock.get(HOST);
  client
    .intercept({
      path: '/v2/users/login',
      method: 'POST',
      body: JSON.stringify({ username, password: token }),
    })
    .reply(200, { token: 'test-jwt' });
  client
    .intercept({
      path: '/v2/repositories/acme/widget/',
      method: 'GET',
      headers: { authorization: 'Bearer test-jwt' },
    })
    .reply(200, repository);
  client
    .intercept({
      path: '/v2/users/acme/',
      method: 'GET',
      headers: { authorization: 'Bearer test-jwt' },
    })
    .reply(200, user);
  client
    .intercept({
      path: '/v2/repositories/acme/widget/tags?page_size=100&page=1',
      method: 'GET',
      headers: { authorization: 'Bearer test-jwt' },
    })
    .reply(200, tagsPage1);
  client
    .intercept({
      path: '/v2/repositories/acme/widget/tags?page_size=100&page=2',
      method: 'GET',
      headers: { authorization: 'Bearer test-jwt' },
    })
    .reply(200, tagsEmpty);
}

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

describe('feed generation', () => {
  it('1. produces the golden feed for /acme/widget.atom', async () => {
    mockFeed();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/xml');
    const body = await res.text();
    expect(normalize(body)).toBe(normalize(goldenFeed));
    fetchMock.assertNoPendingInterceptors();
  });

  it('2. omits the <image> block when the user has no gravatar', async () => {
    mockFeed({ userResponse: userNoGravatar });
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const body = await res.text();
    expect(res.status).toBe(200);
    expect(body).not.toContain('<image>');
    fetchMock.assertNoPendingInterceptors();
  });

  it('3. include=latest yields only the latest item', async () => {
    mockFeed();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom?include=latest'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const body = await res.text();
    expect(body).toContain('acme/widget:latest');
    expect(body).not.toContain('acme/widget:v1.0]]>');
    expect(body).not.toContain('acme/widget:v1.0-dev');
    expect((body.match(/<item>/g) || []).length).toBe(1);
    fetchMock.assertNoPendingInterceptors();
  });

  it('4. exclude=latest drops the latest item, keeps the rest', async () => {
    mockFeed();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom?exclude=latest'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const body = await res.text();
    expect(body).not.toContain('acme/widget:latest');
    expect(body).toContain('acme/widget:v1.0]]>');
    expect(body).toContain('acme/widget:v1.0-dev');
    expect((body.match(/<item>/g) || []).length).toBe(2);
    fetchMock.assertNoPendingInterceptors();
  });

  it('5. includeRegex=^v yields only v1.0 and v1.0-dev', async () => {
    mockFeed();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom?includeRegex=^v'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const body = await res.text();
    expect(body).not.toContain('acme/widget:latest');
    expect(body).toContain('acme/widget:v1.0]]>');
    expect(body).toContain('acme/widget:v1.0-dev');
    expect((body.match(/<item>/g) || []).length).toBe(2);
    fetchMock.assertNoPendingInterceptors();
  });

  it('6. excludeRegex=-dev$ drops v1.0-dev', async () => {
    mockFeed();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom?excludeRegex=-dev$'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const body = await res.text();
    expect(body).not.toContain('acme/widget:v1.0-dev');
    expect(body).toContain('acme/widget:latest');
    expect(body).toContain('acme/widget:v1.0]]>');
    expect((body.match(/<item>/g) || []).length).toBe(2);
    fetchMock.assertNoPendingInterceptors();
  });
});

describe('TAGS_FETCH_LIMIT', () => {
  it('7. caps tags at the limit and stops paginating', async () => {
    // page 1 supplies 2 tags; with a limit of 2 the recursion must stop after
    // page 1 and NEVER request page 2. We deliberately register NO page-2
    // interceptor: if the worker ignores the cap and fetches page 2, there is
    // no matching interceptor and (with net-connect disabled) the fetch throws.
    // Honoring the cap leaves exactly repo/user/page1 consumed and none pending.
    const client = fetchMock.get(HOST);
    client
      .intercept({ path: '/v2/repositories/acme/widget/', method: 'GET' })
      .reply(200, repository);
    client
      .intercept({ path: '/v2/users/acme/', method: 'GET' })
      .reply(200, user);
    client
      .intercept({
        path: '/v2/repositories/acme/widget/tags?page_size=100&page=1',
        method: 'GET',
      })
      .reply(200, {
        count: 4,
        next: null,
        previous: null,
        results: [
          { id: 1, name: 'a', last_updated: '2026-06-10T00:00:00.000Z' },
          { id: 2, name: 'b', last_updated: '2026-06-09T00:00:00.000Z' },
        ],
      });

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom'),
      { ...env, TAGS_FETCH_LIMIT: '2' },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    const body = await res.text();
    expect((body.match(/<item>/g) || []).length).toBe(2);
    expect(body).toContain('acme/widget:a');
    expect(body).toContain('acme/widget:b');
    expect(body).not.toContain('acme/widget:c');
    expect(body).not.toContain('acme/widget:d');
    fetchMock.assertNoPendingInterceptors();
  });
});

describe('routing', () => {
  it('8. /info returns JSON with the package version', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/info'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.headers.get('content-type')).toContain('application/json');
    const json = await res.json();
    expect(json).toEqual({ version: pkg.version });
  });

  it('9. a single-segment path is 404 Not found', async () => {
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/onlyoneseg'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(404);
    expect(await res.text()).toBe('Not found');
  });
});

describe('edge caching', () => {
  it('10. serves the second identical request from cache', async () => {
    // Single-shot interceptors: the full build is mocked exactly once. A second
    // outbound fetch for the same URL would find no interceptor and throw, so a
    // passing test proves the second request was served from cache, not refetched.
    mockFeed();

    const url = 'https://example.com/acme/widget.atom';

    const ctx1 = createExecutionContext();
    const res1 = await worker.fetch(new Request(url), env, ctx1);
    await waitOnExecutionContext(ctx1);
    const body1 = await res1.text();

    const ctx2 = createExecutionContext();
    const res2 = await worker.fetch(new Request(url), env, ctx2);
    await waitOnExecutionContext(ctx2);
    const body2 = await res2.text();

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);
    expect(body2).toBe(body1);
    // All interceptors consumed by the first request; the second hit the cache.
    fetchMock.assertNoPendingInterceptors();
  });
});

describe('route parity', () => {
  it('/r/acme/widget produces the same feed as the .atom route', async () => {
    mockFeed();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/r/acme/widget'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(normalize(body)).toBe(normalize(goldenFeed));
    fetchMock.assertNoPendingInterceptors();
  });

  it('bare /acme/widget produces the same feed as the .atom route', async () => {
    mockFeed();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(normalize(body)).toBe(normalize(goldenFeed));
    fetchMock.assertNoPendingInterceptors();
  });

  it('bare /acme/widget applies filters like .atom (guards 8a654b1)', async () => {
    mockFeed();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget?include=latest'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect((body.match(/<item>/g) || []).length).toBe(1);
    expect(body).toContain('acme/widget:latest');
    fetchMock.assertNoPendingInterceptors();
  });
});

describe('Docker Hub error-path parity', () => {
  it('returns 200 and stops paginating on a page-past-last HTTP 404', async () => {
    // The live Docker Hub API returns HTTP 404 with a {message,errinfo} body for
    // a tags page past the last one. docker-hub-api ignores the HTTP status and
    // treats that body as a non-error (no .error, no .detail), so pagination must
    // stop gracefully via the non-array check and the feed must still return 200.
    const client = fetchMock.get(HOST);
    client
      .intercept({ path: '/v2/repositories/acme/widget/', method: 'GET' })
      .reply(200, repository);
    client
      .intercept({ path: '/v2/users/acme/', method: 'GET' })
      .reply(200, user);
    client
      .intercept({
        path: '/v2/repositories/acme/widget/tags?page_size=100&page=1',
        method: 'GET',
      })
      .reply(200, tagsPage1);
    client
      .intercept({
        path: '/v2/repositories/acme/widget/tags?page_size=100&page=2',
        method: 'GET',
      })
      .reply(404, { message: 'httperror 404: object not found', errinfo: {} });

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect((body.match(/<item>/g) || []).length).toBe(3);
    expect(body).toContain('acme/widget:latest');
    expect(body).toContain('acme/widget:v1.0]]>');
    expect(body).toContain('acme/widget:v1.0-dev');
    fetchMock.assertNoPendingInterceptors();
  });

  it('returns 500 when the response body has an error (detail set)', async () => {
    // HTTP status is ignored; a body with .detail (e.g. rate-limit/throttle)
    // must throw and surface as a 500, matching the original catch path.
    const client = fetchMock.get(HOST);
    client
      .intercept({ path: '/v2/repositories/acme/widget/', method: 'GET' })
      .reply(200, { detail: 'throttled' });

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(500);
    fetchMock.assertNoPendingInterceptors();
  });
});

describe('Docker Hub authentication', () => {
  it('logs in once and sends Bearer auth on every Docker Hub call', async () => {
    mockFeedAuthed();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom'),
      { ...env, DOCKERHUB_USERNAME: 'dhuser', DOCKERHUB_TOKEN: 'dhtoken' },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    // Authed build reproduces the golden feed byte-for-byte.
    expect(normalize(body)).toBe(normalize(goldenFeed));
    // Login + every authed interceptor consumed exactly once (login once).
    fetchMock.assertNoPendingInterceptors();
  });

  it('falls back to anonymous requests when creds are absent', async () => {
    // mockFeed registers NO login interceptor: if the worker tried to log in,
    // that POST would find no interceptor and throw with net connect disabled.
    mockFeed();
    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(normalize(body)).toBe(normalize(goldenFeed));
    fetchMock.assertNoPendingInterceptors();
  });
});

describe('Docker Hub rate-limit handling', () => {
  it('surfaces a 429 rate-limit as a 500, not a 200 with blank fields', async () => {
    // The exact edge failure: an anonymous repo call is rate-limited with
    // {"detail":"Rate limit exceeded","error":false} at HTTP 429. The old
    // body-only check treated error===false as success and produced a 200 with
    // undefined fields; the status check must now surface it as a 500.
    const client = fetchMock.get(HOST);
    client
      .intercept({ path: '/v2/repositories/acme/widget/', method: 'GET' })
      .reply(429, { detail: 'Rate limit exceeded', error: false });

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(500);
    const body = await res.text();
    expect(body).toContain('429');
    expect(body).toContain('Rate limit exceeded');
    fetchMock.assertNoPendingInterceptors();
  });
});

describe('private repository guard', () => {
  it('refuses to serve a private repo even when authenticated', async () => {
    // The shared service-account token could have private-repo read access;
    // without a guard, /owner/private.atom would turn an anonymous 404 into a
    // public feed. The repo lookup must be rejected on is_private before any
    // tags are fetched, so no user/tags interceptors are registered here: the
    // guard must throw on the repo response alone (surfaced as a 500).
    const client = fetchMock.get(HOST);
    client
      .intercept({
        path: '/v2/users/login',
        method: 'POST',
        body: JSON.stringify({ username: 'dhuser', password: 'dhtoken' }),
      })
      .reply(200, { token: 'test-jwt' });
    client
      .intercept({
        path: '/v2/repositories/acme/secret/',
        method: 'GET',
        headers: { authorization: 'Bearer test-jwt' },
      })
      .reply(200, {
        user: 'acme',
        name: 'secret',
        description: 'hush',
        is_private: true,
      });

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/secret.atom'),
      { ...env, DOCKERHUB_USERNAME: 'dhuser', DOCKERHUB_TOKEN: 'dhtoken' },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(500);
    const body = await res.text();
    // Message names the private guard, proving it fired (not an incidental
    // fetch failure on an unregistered user/tags call).
    expect(body).toContain('private');
    fetchMock.assertNoPendingInterceptors();
  });
});

describe('underscore -> library mapping', () => {
  it('maps _ to library for repo + tags but keeps _ for the user', async () => {
    const client = fetchMock.get(HOST);
    client
      .intercept({ path: '/v2/repositories/library/nginx/', method: 'GET' })
      .reply(200, { user: 'library', name: 'nginx', description: 'x' });
    // user path uses the RAW lowercased `_`, NOT library. Docker Hub returns a
    // real HTTP 404 for `/v2/users/_/` (there is no `_` account), so the user
    // lookup must degrade gracefully (omit the optional image) and still build
    // the feed rather than 500 -- this is the documented official-image route.
    client
      .intercept({ path: '/v2/users/_/', method: 'GET' })
      .reply(404, { message: 'httperror 404: object not found', errinfo: {} });
    client
      .intercept({
        path: '/v2/repositories/library/nginx/tags?page_size=100&page=1',
        method: 'GET',
      })
      .reply(200, {
        count: 1,
        next: null,
        previous: null,
        results: [
          { id: 1, name: 'latest', last_updated: '2026-06-10T00:00:00.000Z' },
        ],
      });
    client
      .intercept({
        path: '/v2/repositories/library/nginx/tags?page_size=100&page=2',
        method: 'GET',
      })
      .reply(200, tagsEmpty);

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/_/nginx.atom'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('library/nginx | Docker Hub Images');
    // The 404 user lookup yields no gravatar, so the <image> block is omitted.
    expect(body).not.toContain('<image>');
    fetchMock.assertNoPendingInterceptors();
  });
});

describe('multi-page accumulation', () => {
  it('concatenates tags across pages in order', async () => {
    const client = fetchMock.get(HOST);
    client
      .intercept({ path: '/v2/repositories/acme/widget/', method: 'GET' })
      .reply(200, repository);
    client
      .intercept({ path: '/v2/users/acme/', method: 'GET' })
      .reply(200, userNoGravatar);
    client
      .intercept({
        path: '/v2/repositories/acme/widget/tags?page_size=100&page=1',
        method: 'GET',
      })
      .reply(200, {
        count: 4,
        next: null,
        previous: null,
        results: [
          { id: 1, name: 'a', last_updated: '2026-06-10T00:00:00.000Z' },
          { id: 2, name: 'b', last_updated: '2026-06-09T00:00:00.000Z' },
        ],
      });
    client
      .intercept({
        path: '/v2/repositories/acme/widget/tags?page_size=100&page=2',
        method: 'GET',
      })
      .reply(200, {
        count: 4,
        next: null,
        previous: null,
        results: [
          { id: 3, name: 'c', last_updated: '2026-06-08T00:00:00.000Z' },
          { id: 4, name: 'd', last_updated: '2026-06-07T00:00:00.000Z' },
        ],
      });
    client
      .intercept({
        path: '/v2/repositories/acme/widget/tags?page_size=100&page=3',
        method: 'GET',
      })
      .reply(200, tagsEmpty);

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom'),
      { ...env, TAGS_FETCH_LIMIT: '' },
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    const titles = [...body.matchAll(/acme\/widget:([a-d])/g)].map((m) => m[1]);
    expect(titles).toEqual(['a', 'b', 'c', 'd']);
    fetchMock.assertNoPendingInterceptors();
  });
});

describe('CDATA terminator escaping', () => {
  it('splits a `]]>` terminator across adjacent CDATA blocks (guards FIX 2)', async () => {
    const client = fetchMock.get(HOST);
    client
      .intercept({ path: '/v2/repositories/acme/widget/', method: 'GET' })
      .reply(200, {
        user: 'acme',
        name: 'widget',
        description: 'evil ]]> injection',
      });
    client
      .intercept({ path: '/v2/users/acme/', method: 'GET' })
      .reply(200, userNoGravatar);
    client
      .intercept({
        path: '/v2/repositories/acme/widget/tags?page_size=100&page=1',
        method: 'GET',
      })
      .reply(200, tagsPage1);
    client
      .intercept({
        path: '/v2/repositories/acme/widget/tags?page_size=100&page=2',
        method: 'GET',
      })
      .reply(200, tagsEmpty);

    const ctx = createExecutionContext();
    const res = await worker.fetch(
      new Request('https://example.com/acme/widget.atom'),
      env,
      ctx,
    );
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);
    const body = await res.text();
    // The terminator is split so the CDATA is not closed early.
    expect(body).toContain(']]]]><![CDATA[>');
    // The description CDATA is well-formed: opens and re-opens correctly.
    expect(body).toContain(
      '<description><![CDATA[evil ]]]]><![CDATA[> injection]]></description>',
    );
    fetchMock.assertNoPendingInterceptors();
  });
});
