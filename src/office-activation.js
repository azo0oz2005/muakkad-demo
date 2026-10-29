'use strict';
const crypto=require('crypto');
function activationToken(user,secret) {
  if(!secret||!user.setup_expires_at)return '';
  const payload=Buffer.from(JSON.stringify({id:String(user.id),expires:new Date(user.setup_expires_at).getTime()})).toString('base64url');
  return payload+'.'+crypto.createHmac('sha256',secret).update('office-activation:'+payload).digest('base64url');
}
function activationUserId(token,secret,now=Date.now()) {
  if(!secret||typeof token!=='string'||token.length>600)return null;
  try {
    const [payload,signature,...extra]=token.split('.');if(extra.length)return null;
    const expected=crypto.createHmac('sha256',secret).update('office-activation:'+payload).digest();
    const actual=Buffer.from(signature,'base64url');if(expected.length!==actual.length||!crypto.timingSafeEqual(expected,actual))return null;
    const value=JSON.parse(Buffer.from(payload,'base64url').toString());
    return /^\d+$/.test(value.id)&&Number.isFinite(value.expires)&&value.expires>now?value.id:null;
  }catch{return null;}
}
module.exports={activationToken,activationUserId};
