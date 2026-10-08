import crypto from 'crypto';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';const bytes=crypto.randomBytes(20);let bits='';for(const b of bytes)bits+=b.toString(2).padStart(8,'0');let out='';for(let i=0;i<bits.length;i+=5)out+=alphabet[parseInt(bits.slice(i,i+5).padEnd(5,'0'),2)];console.log(out);
