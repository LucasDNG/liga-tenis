import 'dotenv/config';
import {runProductionSmoke} from '../src/productionSmoke.js';

const result=await runProductionSmoke({
  apiUrl:process.env.PROD_API_URL,
  frontendUrl:process.env.PROD_FRONTEND_URL
});
console.log(JSON.stringify(result));
