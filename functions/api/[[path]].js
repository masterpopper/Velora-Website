import {handle} from '../../backend/router.mjs';
export const onRequest = context => handle(context.request,context.env);
