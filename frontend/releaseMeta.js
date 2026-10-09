export function frontendReleaseSha(env=process.env){
  return String(
    env.VERCEL_GIT_COMMIT_SHA||
    env.VITE_VERCEL_GIT_COMMIT_SHA||
    env.GITHUB_SHA||
    env.GIT_COMMIT_SHA||
    env.VITE_RELEASE_SHA||
    'dev'
  ).trim();
}

export function injectFrontendReleaseMeta(html,release){
  const value=String(release||'dev').replace(/[<>"']/g,'');
  return String(html).replace('</head>',`  <meta name="la-red-release" content="${value}"/>\n</head>`);
}
