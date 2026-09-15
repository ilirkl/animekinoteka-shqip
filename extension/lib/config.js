export const DEFAULTS = {owner: '', repo: '', branch: 'main', baseUrl: ''};
export function baseUrlFrom({owner, repo, branch, baseUrl} = {}) {
  if (baseUrl) return baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  if (!owner || !repo) return null;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${branch || 'main'}/`;
}
