export function deploymentSha(env=process.env){
  return String(
    env.RENDER_GIT_COMMIT||
    env.GIT_COMMIT_SHA||
    env.GITHUB_SHA||
    env.COMMIT_SHA||
    ''
  ).trim()||null;
}

export function readLiveness(){
  return {
    ok:true,
    name:'LA RED Tenis',
    engine:'database-selected',
    timezone:'America/Argentina/Buenos_Aires',
    process:'ok',
    release:deploymentSha()
  };
}

export async function readHealth(client){
  const row=(await client.query(`SELECT value FROM app_settings WHERE key='engine'`)).rows[0];
  const engine=row?.value;
  if(!['wheel-v2','wheel-v3'].includes(engine))throw new Error('Motor competitivo inesperado');
  await client.query('SELECT 1');
  return {
    ok:true,
    name:'LA RED Tenis',
    engine,
    timezone:'America/Argentina/Buenos_Aires',
    database:'ok',
    release:deploymentSha()
  };
}
