import {defineConfig,loadEnv} from 'vite';
import react from '@vitejs/plugin-react';
import {productionApiUrl} from './buildEnv.js';
import {frontendReleaseSha,injectFrontendReleaseMeta} from './releaseMeta.js';

export default defineConfig(({mode})=>{
  const env=loadEnv(mode,process.cwd(),'');
  if(mode==='production')productionApiUrl(process.env.VITE_API_URL||env.VITE_API_URL);
  const release=frontendReleaseSha({...env,...process.env});
  const releasePlugin={
    name:'la-red-release-meta',
    transformIndexHtml(html){
      return injectFrontendReleaseMeta(html,release);
    }
  };
  return {plugins:[react(),releasePlugin],server:{proxy:{'/api':{target:'http://localhost:3000',changeOrigin:true}}}};
});
