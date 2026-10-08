import jwt from 'jsonwebtoken';
import {pool} from './db.js';
export function sign(user){return jwt.sign({id:user.id},process.env.JWT_SECRET,{expiresIn:user.role==='admin'?'12h':'30d'});}
export function auth(req,res,next){const h=req.headers.authorization||'';const token=h.startsWith('Bearer ')?h.slice(7):null;if(!token)return res.status(401).json({error:'No autenticado'});try{req.user=jwt.verify(token,process.env.JWT_SECRET);next();}catch{return res.status(401).json({error:'Sesión inválida'});}}
export async function admin(req,res,next){try{const u=(await pool.query('SELECT role FROM users WHERE id=$1',[req.user?.id])).rows[0];if(u?.role!=='admin')return res.status(403).json({error:'Solo administrador'});next();}catch(nextErr){next(nextErr);}}
