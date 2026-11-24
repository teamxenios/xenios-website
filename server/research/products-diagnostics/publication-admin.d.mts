import type {Express,Request,Response,NextFunction} from 'express';
import type {Identity,PublicationPorts} from './publication.mjs';
import {createPublicationService} from './publication.mjs';
export const PUBLICATION_ADMIN_BASE:string;
export function createProductControlPublicationAdmin(input:{
  requireAdmin:(req:Request,res:Response,next:NextFunction)=>unknown;
  identityFor:(productId:string,variantId:string)=>Promise<Identity|null>;
  ports:Omit<PublicationPorts<object>,'authorize'>;
}):Readonly<{service:ReturnType<typeof createPublicationService<object>>;register(app:Express):void}>;
