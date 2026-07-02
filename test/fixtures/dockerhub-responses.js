// Raw Docker Hub v2 API responses used to mock outbound fetch() in worker tests.
// This is the exact dataset that produced test/fixtures/golden-feed.xml via the
// original Express app, so the ported worker must reproduce that golden from it.

export const repository = {
  user: 'acme',
  name: 'widget',
  namespace: 'acme',
  description: 'A test widget <& stuff>',
  is_private: false,
};

export const user = {
  username: 'acme',
  gravatar_url: 'https://www.gravatar.com/avatar/abc123?s=80&r=g&d=mm',
};

// user with no gravatar (Docker Hub returns "" for accounts without one);
// the feed must then omit the <image> block entirely.
export const userNoGravatar = {
  username: 'acme',
  gravatar_url: '',
};

export const tagsPage1 = {
  count: 3,
  next: null,
  previous: null,
  results: [
    { id: 100, name: 'latest', last_updated: '2026-06-10T00:41:19.878Z' },
    { id: 200, name: 'v1.0', last_updated: '2026-05-01T12:00:00.000Z' },
    { id: 300, name: 'v1.0-dev', last_updated: '2026-04-01T08:30:00.500Z' },
  ],
};

export const tagsEmpty = { count: 0, next: null, previous: null, results: [] };
