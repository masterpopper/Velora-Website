import {handle} from '../backend/router.mjs';
export default {
  async fetch(request,env) {
    const path=new URL(request.url).pathname;
    if(path==='/api'||path.startsWith('/api/'))return handle(request,env);
    if(!env.ASSETS)return new Response('Static assets are not configured.',{status:503});
    return env.ASSETS.fetch(request);
  }
};
