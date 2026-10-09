import pg from 'pg';
import {databasePoolOptions} from './config.js';
const {Pool}=pg;
export const pool=new Pool(databasePoolOptions());
export const q=(client,text,values=[])=>client.query(text,values);
