const DOCKER_HUB_BASE = 'https://hub.docker.com/v2';

// Docker Hub rate-limits Cloudflare's shared egress IPs, so anonymous edge
// requests get HTTP 429. Exchange a username + read-only access token for a
// short-lived JWT; authenticated calls get a per-account limit instead.
async function dockerHubLogin(username, token) {
  const res = await fetch(`${DOCKER_HUB_BASE}/users/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password: token }),
  });
  const body = await res.json();
  if (!res.ok || !body.token) {
    const detail = body && body.detail ? `: ${body.detail}` : '';
    throw new Error(`Docker Hub login failed (${res.status})${detail}`);
  }
  return body.token;
}

// Body-level error signal, kept for the cases HTTP status does not cover: an
// explicit `error: true` payload, or a `detail` set on a 2xx response.
function bodyHasError(body) {
  if (body && body.error === true) return true;
  if (body && body.error === false) return false;
  return !!(body && typeof body.detail !== 'undefined');
}

// The primary failure signal is the HTTP status: any >= 400 (e.g. a 429
// rate-limit, whose body {"detail":"Rate limit exceeded","error":false} the
// body-only check would have mistaken for success) is surfaced as a thrown
// error, which handleFeed turns into a 500. `allow404` lets the tags paginator
// treat Docker Hub's page-past-last 404 as an end-of-pagination signal instead.
async function dockerHubFetch(url, { jwt, allow404 = false } = {}) {
  const init = jwt ? { headers: { Authorization: `Bearer ${jwt}` } } : undefined;
  const res = await fetch(url, init); // follows redirects by default
  if (allow404 && res.status === 404) return null;
  const body = await res.json();
  if (!res.ok) {
    const detail = body && body.detail ? `: ${body.detail}` : '';
    throw new Error(`Docker Hub request failed (${res.status})${detail}`);
  }
  if (bodyHasError(body)) {
    throw new Error(JSON.stringify(body));
  }
  return body;
}

async function getAllTags(user, repository, tagsFetchLimit, jwt) {
  const limitRaw = Number(tagsFetchLimit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : null;

  let tags = [];
  let page = 1;
  while (!(limit && tags.length >= limit)) {
    const data = await dockerHubFetch(
      `${DOCKER_HUB_BASE}/repositories/${user}/${repository}/tags?page_size=100&page=${page}`,
      { jwt, allow404: true },
    );
    if (!data) break; // 404 past the last page: stop gracefully
    const results = data.results || data;
    if (!Array.isArray(results) || results.length === 0) break;
    tags = tags.concat(results);
    page++;
  }
  return tags;
}

// XML-escape plain-text fields (link, image url). CDATA fields stay raw.
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Wrap a value in CDATA, splitting any `]]>` terminator across adjacent CDATA
// blocks (matches the `rss` npm package). Byte-identical to a bare CDATA wrap
// for inputs that contain no `]]>`.
function cdata(str) {
  return `<![CDATA[${String(str).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function buildFeedXml(repo, user, images) {
  const title = `${repo.user}/${repo.name} | Docker Hub Images`;
  const link = `https://hub.docker.com/r/${repo.user}/${repo.name}`;

  let out = '<?xml version="1.0" encoding="UTF-8"?>';
  out +=
    '<rss xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
    'xmlns:content="http://purl.org/rss/1.0/modules/content/" ' +
    'xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">';
  out += '<channel>';
  out += `<title>${cdata(title)}</title>`;
  out += `<description>${cdata(repo.description)}</description>`;
  out += `<link>${esc(link)}</link>`;
  if (user.gravatar_url) {
    out += '<image>';
    out += `<url>${esc(user.gravatar_url)}</url>`;
    out += `<title>${title}</title>`;
    out += `<link>${esc(link)}</link>`;
    out += '</image>';
  }
  out += '<generator>RSS for Node</generator>';
  out += `<lastBuildDate>${new Date().toUTCString()}</lastBuildDate>`;
  images.forEach((image) => {
    const itemTitle = `${repo.user}/${repo.name}:${image.name}`;
    const itemLink = `${link}/tags?name=${image.name}`;
    const guid = `${image.id}-${new Date(image.last_updated).getTime()}`;
    out += '<item>';
    out += `<title>${cdata(itemTitle)}</title>`;
    out += `<link>${esc(itemLink)}</link>`;
    out += `<guid isPermaLink="false">${esc(guid)}</guid>`;
    out += `<pubDate>${new Date(image.last_updated).toUTCString()}</pubDate>`;
    out += '</item>';
  });
  out += '</channel></rss>';
  return out;
}

// `_` -> `library`, lowercased (used for the repo + tags endpoints).
function resolveRepoUser(username) {
  const lower = String(username).toLowerCase();
  return lower === '_' ? 'library' : lower;
}

// filters: raw query values (strings or undefined).
function filterTags(tags, filters = {}) {
  const include = filters.include ? filters.include.split(',') : [];
  const exclude = filters.exclude ? filters.exclude.split(',') : [];
  const { includeRegex, excludeRegex } = filters;
  return tags.filter(
    (t) =>
      (include.length === 0 || include.includes(t.name)) &&
      (exclude.length === 0 || !exclude.includes(t.name)) &&
      (!includeRegex || t.name.match(new RegExp(includeRegex))) &&
      (!excludeRegex || !t.name.match(new RegExp(excludeRegex))),
  );
}

// Orchestrator both adapters call. Returns the feed XML string. When `auth`
// carries a username + token, logs in ONCE and threads the JWT through every
// Docker Hub call; absent creds it falls back to anonymous requests.
async function generateFeed({
  username,
  repository,
  filters,
  tagsFetchLimit,
  auth,
}) {
  const jwt =
    auth && auth.username && auth.token
      ? await dockerHubLogin(auth.username, auth.token)
      : null;
  const repoUser = resolveRepoUser(username); // repo + tags: _ -> library
  const userSlug = String(username).toLowerCase(); // users endpoint: raw lowercased, NOT mapped
  const repo = await dockerHubFetch(
    `${DOCKER_HUB_BASE}/repositories/${repoUser}/${repository}/`,
    { jwt },
  );
  const user = await dockerHubFetch(`${DOCKER_HUB_BASE}/users/${userSlug}/`, {
    jwt,
  });
  const tags = await getAllTags(repoUser, repository, tagsFetchLimit, jwt);
  const filtered = filterTags(tags, filters);
  return buildFeedXml(repo, user, filtered);
}

module.exports = {
  generateFeed,
  filterTags,
  buildFeedXml,
  dockerHubFetch,
  getAllTags,
  resolveRepoUser,
};
