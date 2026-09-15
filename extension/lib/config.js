// The published subtitle repository. These are defaults rather than blanks so the
// extension works the moment it is installed, with no setup step. The options page
// still overrides them for anyone hosting their own subtitles.
export const DEFAULTS = {
  owner: 'ilirkl',
  repo: 'animekinoteka-shqip',
  branch: 'main',
  baseUrl: ''
};
export function baseUrlFrom({owner, repo, branch, baseUrl} = {}) {
  if (baseUrl) return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  if (!owner || !repo) return null;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch || 'main'}/`;
}
