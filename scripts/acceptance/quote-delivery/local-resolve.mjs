import {registerHooks} from 'node:module';
registerHooks({resolve(s,ctx,next){try{return next(s,ctx)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND' && s.startsWith('.') && !s.endsWith('.ts'))return next(s+'.ts',ctx);throw e}}});
