import {productionSecrets} from '../src/secrets.js';

const accountArg=process.argv.find(x=>x.startsWith('--account='));
const account=accountArg?accountArg.slice('--account='.length).trim():'admin';
const secrets=productionSecrets({account:account||'admin'});

console.log('Generados localmente. No pegues estos valores en chats ni los commitees.');
console.log('JWT_SECRET='+secrets.jwtSecret);
console.log('ADMIN_TOTP_SECRET='+secrets.totpSecret);
console.log('ADMIN_TOTP_URI='+secrets.otpauthUri);
