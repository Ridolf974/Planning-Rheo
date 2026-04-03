// === Planning Rhéophérèse - Google Apps Script Backend ===
// Ce fichier doit être collé dans l'éditeur Apps Script de votre Google Sheet

function getSheetNames() {
  return { patients: 'Patients', sessions: 'Sessions', lines: 'Lignes' };
}

function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const names = getSheetNames();
  let ps = ss.getSheetByName(names.patients);
  if (!ps) { ps = ss.insertSheet(names.patients); ps.getRange(1,1,1,4).setValues([['id','last_name','first_name','notes']]); ps.getRange(1,1,1,4).setFontWeight('bold'); }
  let ss2 = ss.getSheetByName(names.sessions);
  if (!ss2) { ss2 = ss.insertSheet(names.sessions); ss2.getRange(1,1,1,10).setValues([['id','patient_id','date','slot','position','type','cancelled','cancel_reason','cancel_comment','updated_at']]); ss2.getRange(1,1,1,10).setFontWeight('bold'); }
  let ls = ss.getSheetByName(names.lines);
  if (!ls) { ls = ss.insertSheet(names.lines); ls.getRange(1,1,1,6).setValues([['id','label','placement_date','disposal_date','disposal_reason','notes']]); ls.getRange(1,1,1,6).setFontWeight('bold'); }
  const def = ss.getSheetByName('Feuille 1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1) { try { ss.deleteSheet(def); } catch(e) {} }
  SpreadsheetApp.getUi().alert('Feuilles initialisées !');
}

function doGet(e) { return handleRequest(e); }
function doPost(e) { return handleRequest(e); }

function handleRequest(e) {
  const params = e.parameter;
  try {
    let r;
    switch (params.action) {
      case 'getPatients': r = getPatients(); break;
      case 'addPatient': r = addPatient(params); break;
      case 'updatePatient': r = updatePatient(params); break;
      case 'deletePatient': r = deletePatient(params); break;
      case 'getSessions': r = getSessions(params.month); break;
      case 'addSession': r = addSession(params); break;
      case 'updateSession': r = updateSession(params); break;
      case 'cancelSession': r = cancelSession(params); break;
      case 'restoreSession': r = restoreSession(params); break;
      case 'deleteSession': r = deleteSession(params); break;
      case 'getLines': r = getLines(); break;
      case 'addLine': r = addLine(params); break;
      case 'updateLine': r = updateLine(params); break;
      case 'deleteLine': r = deleteLine(params); break;
      case 'getAnalyticsMonthly': r = getAnalyticsMonthly(params.month); break;
      case 'getAnalyticsYearly': r = getAnalyticsYearly(params.year); break;
      default: r = { error: 'Action inconnue' };
    }
    return ContentService.createTextOutput(JSON.stringify(r)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

function getSheet(n) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(n); }
function getNextId(sh) { const d=sh.getDataRange().getValues(); if(d.length<=1)return 1; let m=0; for(let i=1;i<d.length;i++){const id=parseInt(d[i][0]);if(id>m)m=id;} return m+1; }
function sheetToObjects(sh,h) { const d=sh.getDataRange().getValues(); if(d.length<=1)return[]; const o=[]; for(let i=1;i<d.length;i++){const obj={};for(let j=0;j<h.length;j++)obj[h[j]]=d[i][j];o.push(obj);} return o; }
function findRowById(sh,id) { const d=sh.getDataRange().getValues(); for(let i=1;i<d.length;i++)if(String(d[i][0])===String(id))return i+1; return -1; }

function getPatients() { return sheetToObjects(getSheet(getSheetNames().patients),['id','last_name','first_name','notes']); }
function addPatient(p) { const sh=getSheet(getSheetNames().patients); const id=getNextId(sh); const ln=(p.last_name||'').toUpperCase(); sh.appendRow([id,ln,p.first_name||'',p.notes||'']); return {id,last_name:ln,first_name:p.first_name||'',notes:p.notes||''}; }
function updatePatient(p) { const sh=getSheet(getSheetNames().patients); const r=findRowById(sh,p.id); if(r===-1)return{error:'Patient non trouvé'}; if(p.last_name)sh.getRange(r,2).setValue(p.last_name.toUpperCase()); if(p.first_name)sh.getRange(r,3).setValue(p.first_name); if(p.notes!==undefined)sh.getRange(r,4).setValue(p.notes); const d=sh.getRange(r,1,1,4).getValues()[0]; return{id:d[0],last_name:d[1],first_name:d[2],notes:d[3]}; }
function deletePatient(p) { const sh=getSheet(getSheetNames().patients); const r=findRowById(sh,p.id); if(r===-1)return{error:'Patient non trouvé'}; const ss=getSheet(getSheetNames().sessions).getDataRange().getValues(); for(let i=1;i<ss.length;i++)if(String(ss[i][1])===String(p.id))return{error:'Patient avec séances'}; sh.deleteRow(r); return{success:true}; }

function getSessions(month) { const sh=getSheet(getSheetNames().sessions); const psh=getSheet(getSheetNames().patients); const sess=sheetToObjects(sh,['id','patient_id','date','slot','position','type','cancelled','cancel_reason','cancel_comment','updated_at']); const pts=sheetToObjects(psh,['id','last_name','first_name','notes']); const pm={}; pts.forEach(p=>pm[p.id]=p); return sess.filter(s=>String(s.date).startsWith(month)).map(s=>{const p=pm[s.patient_id]||{last_name:'?',first_name:'?'};return{...s,slot:parseInt(s.slot),position:parseInt(s.position),cancelled:parseInt(s.cancelled)||0,last_name:p.last_name,first_name:p.first_name};}); }
function addSession(p) { const sh=getSheet(getSheetNames().sessions); const id=getNextId(sh); const date=p.date,slot=parseInt(p.slot),pos=parseInt(p.position),type=p.type||'isolee'; const ex=sheetToObjects(sh,['id','patient_id','date','slot','position','type','cancelled','cancel_reason','cancel_comment','updated_at']); if(ex.find(s=>s.date===date&&parseInt(s.slot)===slot&&parseInt(s.position)===pos))return{error:'Position occupée'}; sh.appendRow([id,parseInt(p.patient_id),date,slot,pos,type,0,'','',new Date().toISOString()]); const psh=getSheet(getSheetNames().patients); const pr=findRowById(psh,p.patient_id); let ln='?',fn='?'; if(pr!==-1){const d=psh.getRange(pr,1,1,4).getValues()[0];ln=d[1];fn=d[2];} return{id,patient_id:parseInt(p.patient_id),date,slot,position:pos,type,cancelled:0,cancel_reason:'',cancel_comment:'',last_name:ln,first_name:fn}; }
function updateSession(p) { const sh=getSheet(getSheetNames().sessions); const r=findRowById(sh,p.id); if(r===-1)return{error:'Séance non trouvée'}; if(p.patient_id)sh.getRange(r,2).setValue(parseInt(p.patient_id)); if(p.date)sh.getRange(r,3).setValue(p.date); if(p.slot)sh.getRange(r,4).setValue(parseInt(p.slot)); if(p.position)sh.getRange(r,5).setValue(parseInt(p.position)); if(p.type)sh.getRange(r,6).setValue(p.type); sh.getRange(r,10).setValue(new Date().toISOString()); const d=sh.getRange(r,1,1,10).getValues()[0]; const psh=getSheet(getSheetNames().patients); const pr=findRowById(psh,d[1]); let ln='?',fn='?'; if(pr!==-1){const pd=psh.getRange(pr,1,1,4).getValues()[0];ln=pd[1];fn=pd[2];} return{id:d[0],patient_id:d[1],date:d[2],slot:parseInt(d[3]),position:parseInt(d[4]),type:d[5],cancelled:parseInt(d[6])||0,cancel_reason:d[7],cancel_comment:d[8],last_name:ln,first_name:fn}; }
function cancelSession(p) { const sh=getSheet(getSheetNames().sessions); const r=findRowById(sh,p.id); if(r===-1)return{error:'Séance non trouvée'}; sh.getRange(r,7).setValue(1); sh.getRange(r,8).setValue(p.cancel_reason||''); sh.getRange(r,9).setValue(p.cancel_comment||''); sh.getRange(r,10).setValue(new Date().toISOString()); const d=sh.getRange(r,1,1,10).getValues()[0]; const psh=getSheet(getSheetNames().patients); const pr=findRowById(psh,d[1]); let ln='?',fn='?'; if(pr!==-1){const pd=psh.getRange(pr,1,1,4).getValues()[0];ln=pd[1];fn=pd[2];} return{id:d[0],patient_id:d[1],date:d[2],slot:parseInt(d[3]),position:parseInt(d[4]),type:d[5],cancelled:1,cancel_reason:d[7],cancel_comment:d[8],last_name:ln,first_name:fn}; }
function restoreSession(p) { const sh=getSheet(getSheetNames().sessions); const r=findRowById(sh,p.id); if(r===-1)return{error:'Séance non trouvée'}; sh.getRange(r,7).setValue(0); sh.getRange(r,8).setValue(''); sh.getRange(r,9).setValue(''); sh.getRange(r,10).setValue(new Date().toISOString()); const d=sh.getRange(r,1,1,10).getValues()[0]; const psh=getSheet(getSheetNames().patients); const pr=findRowById(psh,d[1]); let ln='?',fn='?'; if(pr!==-1){const pd=psh.getRange(pr,1,1,4).getValues()[0];ln=pd[1];fn=pd[2];} return{id:d[0],patient_id:d[1],date:d[2],slot:parseInt(d[3]),position:parseInt(d[4]),type:d[5],cancelled:0,cancel_reason:'',cancel_comment:'',last_name:ln,first_name:fn}; }
function deleteSession(p) { const sh=getSheet(getSheetNames().sessions); const r=findRowById(sh,p.id); if(r===-1)return{error:'Séance non trouvée'}; sh.deleteRow(r); return{success:true}; }

function getLines() { return sheetToObjects(getSheet(getSheetNames().lines),['id','label','placement_date','disposal_date','disposal_reason','notes']); }
function addLine(p) { const sh=getSheet(getSheetNames().lines); const id=getNextId(sh); sh.appendRow([id,p.label,p.placement_date,p.disposal_date||'',p.disposal_reason||'',p.notes||'']); return{id,label:p.label,placement_date:p.placement_date,disposal_date:p.disposal_date||'',disposal_reason:p.disposal_reason||'',notes:p.notes||''}; }
function updateLine(p) { const sh=getSheet(getSheetNames().lines); const r=findRowById(sh,p.id); if(r===-1)return{error:'Ligne non trouvée'}; if(p.label)sh.getRange(r,2).setValue(p.label); if(p.placement_date)sh.getRange(r,3).setValue(p.placement_date); if(p.disposal_date!==undefined)sh.getRange(r,4).setValue(p.disposal_date); if(p.disposal_reason!==undefined)sh.getRange(r,5).setValue(p.disposal_reason); if(p.notes!==undefined)sh.getRange(r,6).setValue(p.notes); const d=sh.getRange(r,1,1,6).getValues()[0]; return{id:d[0],label:d[1],placement_date:d[2],disposal_date:d[3],disposal_reason:d[4],notes:d[5]}; }
function deleteLine(p) { const sh=getSheet(getSheetNames().lines); const r=findRowById(sh,p.id); if(r===-1)return{error:'Ligne non trouvée'}; sh.deleteRow(r); return{success:true}; }

function getAnalyticsMonthly(month) { const sh=getSheet(getSheetNames().sessions); const all=sheetToObjects(sh,['id','patient_id','date','slot','position','type','cancelled','cancel_reason','cancel_comment','updated_at']); const sess=all.filter(s=>String(s.date).startsWith(month)); const total=sess.length,tandem=sess.filter(s=>s.type==='tandem').length,isolee=sess.filter(s=>s.type==='isolee').length,cancelled=sess.filter(s=>parseInt(s.cancelled)===1).length,active=total-cancelled; const cr={medical:0,patient_absence:0,staff_absence:0}; sess.filter(s=>parseInt(s.cancelled)===1).forEach(s=>{if(cr[s.cancel_reason]!==undefined)cr[s.cancel_reason]++;}); const pids={};sess.forEach(s=>pids[s.patient_id]=true); const patients=Object.keys(pids).length; const dm={};sess.forEach(s=>{if(!dm[s.date])dm[s.date]={date:s.date,total:0,active:0,cancelled_count:0};dm[s.date].total++;if(parseInt(s.cancelled)===1)dm[s.date].cancelled_count++;else dm[s.date].active++;}); const perDay=Object.values(dm).sort((a,b)=>a.date.localeCompare(b.date)); const[y,m]=month.split('-').map(Number); const dim=new Date(y,m,0).getDate(); let wd=0;for(let d=1;d<=dim;d++)if(new Date(y,m-1,d).getDay()!==0)wd++; const mx=wd*6; return{total,tandem,isolee,cancelled,active,patients,cancelReasons:cr,perDay,maxSessions:mx,occupationRate:mx>0?parseFloat(((active/mx)*100).toFixed(1)):0,cancelRate:total>0?parseFloat(((cancelled/total)*100).toFixed(1)):0}; }
function getAnalyticsYearly(year) { const sh=getSheet(getSheetNames().sessions); const all=sheetToObjects(sh,['id','patient_id','date','slot','position','type','cancelled','cancel_reason','cancel_comment','updated_at']); const sess=all.filter(s=>String(s.date).startsWith(year)); const total=sess.length,tandem=sess.filter(s=>s.type==='tandem').length,isolee=sess.filter(s=>s.type==='isolee').length,cancelled=sess.filter(s=>parseInt(s.cancelled)===1).length,active=total-cancelled; const cr={medical:0,patient_absence:0,staff_absence:0}; sess.filter(s=>parseInt(s.cancelled)===1).forEach(s=>{if(cr[s.cancel_reason]!==undefined)cr[s.cancel_reason]++;}); const pids={};sess.forEach(s=>pids[s.patient_id]=true); const patients=Object.keys(pids).length; const mm={};sess.forEach(s=>{const m=String(s.date).substring(0,7);if(!mm[m])mm[m]={month:m,total:0,active:0,cancelled_count:0,tandem:0,isolee:0};mm[m].total++;if(parseInt(s.cancelled)===1)mm[m].cancelled_count++;else mm[m].active++;if(s.type==='tandem')mm[m].tandem++;else mm[m].isolee++;}); return{total,tandem,isolee,cancelled,active,patients,cancelReasons:cr,perMonth:Object.values(mm).sort((a,b)=>a.month.localeCompare(b.month)),cancelRate:total>0?parseFloat(((cancelled/total)*100).toFixed(1)):0}; }
