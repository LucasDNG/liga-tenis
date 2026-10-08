import axios from 'axios';
const apiBase=(import.meta.env.VITE_API_URL||'/api').trim().replace(/\/+$/,'')||'/api';
export const api=axios.create({baseURL:apiBase});
api.interceptors.request.use(config=>{const token=localStorage.getItem('token');if(token)config.headers.Authorization=`Bearer ${token}`;return config;});
export function user(){try{return JSON.parse(localStorage.getItem('user')||'null');}catch{return null;}}
export function session(data){localStorage.setItem('token',data.token);localStorage.setItem('user',JSON.stringify(data.user));}
export function logout(){localStorage.removeItem('token');localStorage.removeItem('user');location.href='/';}
