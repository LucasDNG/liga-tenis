import express from 'express';
import cors from 'cors';
import multer from 'multer';
import {pool} from './db.js';
import {auth,admin,sign} from './auth.js';
import {register,findLogin,publicUser,replaceIdentityDocuments,requestPasswordRecovery,resetPassword,requestPhoneChange,confirmPhoneChange,notificationsForUser,markNotificationRead,LEGAL_VERSIONS} from './account.js';
import {pairHub,invitePartner,cancelInvitation,acceptInvitation,requestPause,reactivatePair,requestDissolution} from './pairsRuntime.js';
import {myLeague,proposeSchedule,acceptSchedule,cancelScheduleProposal,voteExtension,reportNoShow,cancelNoShow,contestNoShow,acceptNoShow,reportOwnFailure,submitResult,confirmResult,publicUpcoming,recentResults,ranking,records,pairProfile,maintenance} from './wheelRuntime.js';
import {reportDiscipline} from './discipline.js';
import {pendingUsers,searchUsers,setUserVerification,updateUserDni,identityDocument,requestIdentityResubmission,listVenues,createVenue,updateVenue,disputes,resolveDispute,disciplineQueue,resolveDiscipline,systemStatus,auditLog,setLeagueClockPause,retryWhatsApp,verifyTotp} from './adminRuntime.js';
import {problem} from './core.js';
import {safeErrorLog,authRateLimitKey,safeClientErrorMessage,createFixedWindowRateLimitStore,securityResponseHeaders,privateResponseHeaders,createRequestTrace} from './httpSecurity.js';
import {readHealth,readLiveness} from './health.js';
import {corsOrigins} from './config.js';

export const app=express();
app.disable('x-powered-by');
app.set('trust proxy',1);
app.use((req,res,next)=>{
  const trace=createRequestTrace(req);
  req.requestId=trace.requestId;
  req.cfRay=trace.cfRay;
  const headers={...securityResponseHeaders(),...privateResponseHeaders(req.path),'X-Request-ID':trace.requestId};
  for(const [name,value] of Object.entries(headers))res.setHeader(name,value);
  next();
});
app.use(cors({origin:corsOrigins(process.env).length?corsOrigins(process.env):['http://localhost:5173']}));
app.use(express.json({limit:'1mb'}));
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const identityUpload=multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:5*1024*1024,files:2},
  fileFilter:(req,file,cb)=>cb(null,['image/jpeg','image/png','image/webp'].includes(file.mimetype))
}).fields([{name:'dniFront',maxCount:1},{name:'dniBack',maxCount:1}]);

const authAttempts=createFixedWindowRateLimitStore({windowMs:15*60*1000,maxEntries:10000});
function rateLimit(req,res,next){const v=authAttempts.hit(authRateLimitKey(req));if(v.saturated||v.count>25)return res.status(429).json({error:'Demasiados intentos. Probá nuevamente en unos minutos.'});next();}

app.get('/api/live',(req,res)=>res.json(readLiveness()));
app.get('/api/health',wrap(async(req,res)=>res.json(await readHealth(pool))));
app.get('/api/legal/versions',(req,res)=>res.json(LEGAL_VERSIONS));
app.get('/api/ranking',wrap(async(req,res)=>res.json(await ranking())));
app.get('/api/records',wrap(async(req,res)=>res.json(await records())));
app.get('/api/upcoming',wrap(async(req,res)=>res.json(await publicUpcoming())));
app.get('/api/results/recent',wrap(async(req,res)=>res.json(await recentResults())));
app.get('/api/pairs/:id/profile',wrap(async(req,res)=>res.json(await pairProfile(Number(req.params.id)))));
app.get('/api/venues',wrap(async(req,res)=>res.json((await listVenues()).filter(v=>v.active&&v.associated))));

app.post('/api/auth/register',rateLimit,identityUpload,wrap(async(req,res)=>{let legalAcceptances=req.body.legalAcceptances;try{if(typeof legalAcceptances==='string')legalAcceptances=JSON.parse(legalAcceptances);}catch{throw problem('Aceptaciones legales inválidas');}const user=await register({...req.body,legalAcceptances},{ip:req.ip,userAgent:req.get('user-agent')||null,identityDocuments:{front:req.files?.dniFront?.[0],back:req.files?.dniBack?.[0]}});res.status(201).json({token:sign(user),user});}));
app.post('/api/auth/login',rateLimit,wrap(async(req,res)=>{const user=await findLogin(req.body.dni,req.body.password);if(user.role==='admin')throw problem('Credenciales inválidas',401);res.json({token:sign(user),user:publicUser(user)});}));
app.post('/api/auth/admin-login',rateLimit,wrap(async(req,res)=>{const user=await findLogin(req.body.dni,req.body.password);if(user.role!=='admin')throw problem('Credenciales inválidas',401);const totpSecret=process.env.ADMIN_TOTP_SECRET;if(process.env.NODE_ENV==='production'&&!totpSecret)throw problem('Autenticación administrativa no disponible',503);if(totpSecret&&!verifyTotp(totpSecret,req.body.totp))throw problem('Credenciales inválidas',401);res.json({token:sign(user),user:publicUser(user)});}));
app.post('/api/auth/recovery/request',rateLimit,wrap(async(req,res)=>res.json(await requestPasswordRecovery(req.body.dni))));
app.post('/api/auth/recovery/reset',rateLimit,wrap(async(req,res)=>res.json(await resetPassword(req.body.dni,req.body.code,req.body.password))));
app.get('/api/me',auth,wrap(async(req,res)=>{const u=(await pool.query(`SELECT * FROM users WHERE id=$1`,[req.user.id])).rows[0];if(!u)throw problem('Usuario inexistente',404);res.json(publicUser(u));}));
app.post('/api/me/identity-documents',auth,identityUpload,wrap(async(req,res)=>res.json(await replaceIdentityDocuments(req.user.id,{front:req.files?.dniFront?.[0],back:req.files?.dniBack?.[0]}))));
app.post('/api/me/phone/request',auth,wrap(async(req,res)=>res.json(await requestPhoneChange(req.user.id,req.body.phone))));
app.post('/api/me/phone/confirm',auth,wrap(async(req,res)=>res.json(await confirmPhoneChange(req.user.id,req.body.code))));
app.get('/api/me/notifications',auth,wrap(async(req,res)=>res.json(await notificationsForUser(req.user.id))));
app.patch('/api/me/notifications/:id/read',auth,wrap(async(req,res)=>res.json(await markNotificationRead(req.user.id,Number(req.params.id)))));

app.get('/api/me/pair',auth,wrap(async(req,res)=>res.json(await pairHub(req.user.id))));
app.post('/api/pair-invitations',auth,wrap(async(req,res)=>res.status(201).json(await invitePartner(req.user.id,Number(req.body.inviteeUserId),req.body.category))));
app.patch('/api/pair-invitations/:id/cancel',auth,wrap(async(req,res)=>res.json(await cancelInvitation(req.user.id,Number(req.params.id)))));
app.patch('/api/pair-invitations/:id/accept',auth,wrap(async(req,res)=>{const r=await acceptInvitation(req.user.id,Number(req.params.id));await maintenance();res.json(r);}));
app.post('/api/me/pair/pause',auth,wrap(async(req,res)=>res.json(await requestPause(req.user.id,Boolean(req.body.afterCurrent)))));
app.post('/api/me/pair/reactivate',auth,wrap(async(req,res)=>{const r=await reactivatePair(req.user.id);await maintenance();res.json(r);}));
app.post('/api/me/pair/dissolve',auth,wrap(async(req,res)=>res.json(await requestDissolution(req.user.id))));

app.get('/api/me/league',auth,wrap(async(req,res)=>res.json(await myLeague(req.user.id))));
app.post('/api/assignments/:id/schedule-proposals',auth,wrap(async(req,res)=>res.status(201).json(await proposeSchedule(req.user.id,Number(req.params.id),req.body))));
app.patch('/api/assignments/:id/schedule-proposals/:proposalId/accept',auth,wrap(async(req,res)=>res.json(await acceptSchedule(req.user.id,Number(req.params.id),Number(req.params.proposalId)))));
app.patch('/api/assignments/:id/schedule-proposals/:proposalId/cancel',auth,wrap(async(req,res)=>res.json(await cancelScheduleProposal(req.user.id,Number(req.params.id),Number(req.params.proposalId)))));
app.post('/api/assignments/:id/extension-vote',auth,wrap(async(req,res)=>res.json(await voteExtension(req.user.id,Number(req.params.id)))));
app.post('/api/assignments/:id/no-show',auth,wrap(async(req,res)=>res.status(201).json(await reportNoShow(req.user.id,Number(req.params.id)))));
app.patch('/api/assignments/:id/no-show/cancel',auth,wrap(async(req,res)=>res.json(await cancelNoShow(req.user.id,Number(req.params.id)))));
app.patch('/api/assignments/:id/no-show/accept',auth,wrap(async(req,res)=>{const r=await acceptNoShow(req.user.id,Number(req.params.id));await maintenance();res.json(r);}));
app.patch('/api/assignments/:id/no-show/contest',auth,wrap(async(req,res)=>{const r=await contestNoShow(req.user.id,Number(req.params.id));await maintenance();res.json(r);}));
app.post('/api/assignments/:id/cannot-play',auth,wrap(async(req,res)=>{const r=await reportOwnFailure(req.user.id,Number(req.params.id));await maintenance();res.json(r);}));
app.post('/api/assignments/:id/results',auth,wrap(async(req,res)=>{const r=await submitResult(req.user.id,Number(req.params.id),req.body);await maintenance();res.json(r);}));
app.patch('/api/assignments/:id/results/confirm',auth,wrap(async(req,res)=>{const r=await confirmResult(req.user.id,Number(req.params.id));await maintenance();res.json(r);}));
app.post('/api/discipline-reports',auth,wrap(async(req,res)=>res.status(201).json(await reportDiscipline(req.user.id,req.body))));

app.get('/api/admin/status',auth,admin,wrap(async(req,res)=>res.json(await systemStatus())));
app.get('/api/admin/audit',auth,admin,wrap(async(req,res)=>res.json(await auditLog(req.query.limit))));
app.post('/api/admin/maintenance',auth,admin,wrap(async(req,res)=>res.json(await maintenance())));
app.post('/api/admin/whatsapp/retry',auth,admin,wrap(async(req,res)=>res.json(await retryWhatsApp())));
app.patch('/api/admin/system/clock',auth,admin,wrap(async(req,res)=>res.json(await setLeagueClockPause(req.user.id,Boolean(req.body.paused)))));
app.get('/api/admin/identity/pending',auth,admin,wrap(async(req,res)=>res.json(await pendingUsers())));
app.get('/api/admin/identity/search',auth,admin,wrap(async(req,res)=>res.json(await searchUsers(req.query.q))));
app.patch('/api/admin/identity/:id',auth,admin,wrap(async(req,res)=>res.json(await setUserVerification(req.user.id,Number(req.params.id),req.body.status))));
app.patch('/api/admin/identity/:id/dni',auth,admin,wrap(async(req,res)=>res.json(await updateUserDni(req.user.id,Number(req.params.id),req.body.dni))));
app.get('/api/admin/identity/:id/document/:side',auth,admin,wrap(async(req,res)=>{const d=await identityDocument(Number(req.params.id),req.params.side);res.setHeader('Content-Type',d.mime);res.setHeader('Cache-Control','no-store, private');res.send(d.data);}));
app.post('/api/admin/identity/:id/resubmit',auth,admin,wrap(async(req,res)=>res.json(await requestIdentityResubmission(req.user.id,Number(req.params.id),req.body.reason))));
app.get('/api/admin/venues',auth,admin,wrap(async(req,res)=>res.json(await listVenues())));
app.post('/api/admin/venues',auth,admin,wrap(async(req,res)=>res.status(201).json(await createVenue(req.user.id,req.body))));
app.patch('/api/admin/venues/:id',auth,admin,wrap(async(req,res)=>res.json(await updateVenue(req.user.id,Number(req.params.id),req.body))));
app.get('/api/admin/disputes',auth,admin,wrap(async(req,res)=>res.json(await disputes())));
app.patch('/api/admin/disputes/:id',auth,admin,wrap(async(req,res)=>{const r=await resolveDispute(req.user.id,Number(req.params.id),req.body);await maintenance();res.json(r);}));
app.get('/api/admin/discipline',auth,admin,wrap(async(req,res)=>res.json(await disciplineQueue())));
app.patch('/api/admin/discipline/:id',auth,admin,wrap(async(req,res)=>{const r=await resolveDiscipline(req.user.id,Number(req.params.id),req.body.status);await maintenance();res.json(r);}));

app.use((err,req,res,next)=>{console.error(JSON.stringify(safeErrorLog(err,req)));const status=err.statusCode||(String(err.code||'').startsWith('23')?400:500);res.status(status).json({error:safeClientErrorMessage(err)});});
