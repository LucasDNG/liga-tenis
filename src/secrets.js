import crypto from 'node:crypto';

export function base32(buffer){
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits='';
  for(const byte of buffer)bits+=byte.toString(2).padStart(8,'0');
  let out='';
  for(let i=0;i<bits.length;i+=5){
    const chunk=bits.slice(i,i+5).padEnd(5,'0');
    out+=alphabet[parseInt(chunk,2)];
  }
  return out;
}

export function productionSecrets({account='admin',issuer='LA RED Tenis',randomBytes=crypto.randomBytes}={}){
  const jwtSecret=randomBytes(48).toString('base64url');
  const totpSecret=base32(randomBytes(20));
  const label=encodeURIComponent(issuer+':'+account);
  const params=new URLSearchParams({secret:totpSecret,issuer,algorithm:'SHA1',digits:'6',period:'30'});
  return {
    jwtSecret,
    totpSecret,
    otpauthUri:'otpauth://totp/'+label+'?'+params.toString(),
  };
}
