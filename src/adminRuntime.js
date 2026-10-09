import {competitiveEngine,withCompetitiveWrite} from './competitionRuntime.js';
import * as legacy from './admin.js';
import {disputesV3,resolveDisputeV3,systemStatusV3} from './adminV3Api.js';

export {
  pendingUsers,
  searchUsers,
  setUserVerification,
  updateUserDni,
  identityDocument,
  requestIdentityResubmission,
  listVenues,
  createVenue,
  updateVenue,
  disciplineQueue,
  resolveDiscipline,
  auditLog,
  retryWhatsApp,
  verifyTotp,
} from './admin.js';

export async function disputes(){
  return (await competitiveEngine())==='wheel-v3'?disputesV3():legacy.disputes();
}

export async function resolveDispute(adminId,assignmentId,body){
  return withCompetitiveWrite(engine=>engine==='wheel-v3'
    ?resolveDisputeV3(adminId,assignmentId,body)
    :legacy.resolveDispute(adminId,assignmentId,body));
}

export async function setLeagueClockPause(adminId,paused){
  return withCompetitiveWrite(()=>legacy.setLeagueClockPause(adminId,paused));
}

export async function systemStatus(){
  return (await competitiveEngine())==='wheel-v3'?systemStatusV3():legacy.systemStatus();
}
