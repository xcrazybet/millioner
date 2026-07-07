// X Lodon Sports API - GitHub Auto-Deploy
const API_KEY = '2396236d9d5cd07468ce280da8390ad5';
const API_HOST = 'v3.football.api-sports.io';
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET, OPTIONS' };
let apiCalls = 0, minuteStart = Date.now();

async function fetchAPI(p) {
  if(Date.now()-minuteStart>60000){apiCalls=0;minuteStart=Date.now()}
  if(apiCalls>=25){await new Promise(r=>setTimeout(r,61000-(Date.now()-minuteStart)));apiCalls=0;minuteStart=Date.now()}
  apiCalls++;
  const r=await fetch(`https://${API_HOST}${p}`,{headers:{'x-apisports-key':API_KEY}});
  const d=await r.json();
  if(d.errors?.rateLimit){await new Promise(r=>setTimeout(r,2000));apiCalls++;const rt=await fetch(`https://${API_HOST}${p}`,{headers:{'x-apisports-key':API_KEY}});return await rt.json()}
  return d;
}

function j(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{...corsHeaders,'Content-Type':'application/json'}})}

function ff(f){if(!f)return null;return{fixture:{id:f.fixture?.id,date:f.fixture?.date,status:{long:f.fixture?.status?.long,short:f.fixture?.status?.short,elapsed:f.fixture?.status?.elapsed},venue:{id:f.fixture?.venue?.id,name:f.fixture?.venue?.name,city:f.fixture?.venue?.city},referee:f.fixture?.referee},league:{id:f.league?.id,name:f.league?.name,country:f.league?.country,logo:f.league?.logo,flag:f.league?.flag,season:f.league?.season,round:f.league?.round},teams:{home:{id:f.teams?.home?.id,name:f.teams?.home?.name,logo:f.teams?.home?.logo,winner:f.teams?.home?.winner},away:{id:f.teams?.away?.id,name:f.teams?.away?.name,logo:f.teams?.away?.logo,winner:f.teams?.away?.winner}},score:{halftime:{home:f.score?.halftime?.home??0,away:f.score?.halftime?.away??0},fulltime:{home:f.score?.fulltime?.home??0,away:f.score?.fulltime?.away??0},extratime:{home:f.score?.extratime?.home??null,away:f.score?.extratime?.away??null},penalty:{home:f.score?.penalty?.home??null,away:f.score?.penalty?.away??null}},goals:{home:f.goals?.home??0,away:f.goals?.away??0}}}

async function handleRequest(request) {
  const url=new URL(request.url),p=url.pathname;
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  try{
    if(p==='/health')return j({status:'ok',timestamp:new Date().toISOString(),api_calls:apiCalls,version:'20.0.2'});
    if(p==='/')return j({name:'X Lodon Sports API',version:'20.0.2',status:'active',endpoints:['/health','/api/fixtures/date/:date','/api/livescores','/api/fixture/:id','/api/leagues','/api/standings/:league/:season','/api/team/:id','/api/topscorers/:league/:season','/api/countries','/api/debug']});
    if(p==='/api/test')return j({success:true,message:'API is working!'});
    if(p==='/api/fixtures/week'){const t=new Date(),f=t.toISOString().split('T')[0],n=new Date(t);n.setDate(t.getDate()+7);const to=n.toISOString().split('T')[0],d=await fetchAPI(`/fixtures?from=${f}&to=${to}`),fx=(d.response||[]).map(ff);return j({success:true,data:fx,count:fx.length,date_range:{from:f,to}})}
    if(p.startsWith('/api/fixtures/date/')){const d=p.replace('/api/fixtures/date/',''),r=await fetchAPI(`/fixtures?date=${d}`),fx=(r.response||[]).map(ff);return j({success:true,data:fx,count:fx.length,date:d})}
    if(p.startsWith('/api/fixtures/range/')){const pt=p.replace('/api/fixtures/range/','').split('/'),r=await fetchAPI(`/fixtures?from=${pt[0]}&to=${pt[1]}`),fx=(r.response||[]).map(ff);return j({success:true,data:fx,count:fx.length,date_range:{from:pt[0],to:pt[1]}})}
    if(p==='/api/livescores'){const d=await fetchAPI('/fixtures?live=all'),ls=['1H','2H','HT','ET','BT','LIVE','INT','P'],lv=(d.response||[]).filter(f=>ls.includes(f.fixture?.status?.short));return j({success:true,data:lv.map(ff),count:lv.length})}
    if(p.startsWith('/api/fixtures/head2head/')){const pt=p.replace('/api/fixtures/head2head/','').split('/'),d=await fetchAPI(`/fixtures/headtohead?h2h=${pt[0]}-${pt[1]}`),mt=(d.response||[]).map(f=>({fixture:{id:f.fixture.id,date:f.fixture.date},teams:{home:{name:f.teams.home.name,winner:f.teams.home.winner},away:{name:f.teams.away.name,winner:f.teams.away.winner}},goals:{home:f.goals.home,away:f.goals.away}})),t=mt.length,hw=mt.filter(m=>m.teams.home.winner===true).length,aw=mt.filter(m=>m.teams.away.winner===true).length;return j({success:true,data:mt,stats:{total:t,home_wins:hw,away_wins:aw,draws:t-hw-aw}})}
    if(p.startsWith('/api/predictions/')){const d=await fetchAPI(`/predictions?fixture=${p.replace('/api/predictions/','')}`);return j({success:true,data:d.response?.[0]||null})}
    if(p.startsWith('/api/fixtures/events/')){const d=await fetchAPI(`/fixtures/events?fixture=${p.replace('/api/fixtures/events/','')}`);return j({success:true,data:d.response||[]})}
    if(p.startsWith('/api/fixtures/statistics/')){const d=await fetchAPI(`/fixtures/statistics?fixture=${p.replace('/api/fixtures/statistics/','')}`);return j({success:true,data:d.response||[]})}
    if(p.startsWith('/api/fixture/')){const id=p.replace('/api/fixture/',''),[fx,ev,st,od]=await Promise.all([fetchAPI(`/fixtures?id=${id}`),fetchAPI(`/fixtures/events?fixture=${id}`).catch(()=>({response:[]})),fetchAPI(`/fixtures/statistics?fixture=${id}`).catch(()=>({response:[]})),fetchAPI(`/odds?fixture=${id}`).catch(()=>({response:[]}))]);if(fx.response?.length)return j({success:true,fixture:ff(fx.response[0]),events:ev.response||[],statistics:st.response||[],odds:od.response||[]});return j({success:false,error:'Fixture not found'},404)}
    if(p==='/api/leagues'){const d=await fetchAPI('/leagues'),lg=(d.response||[]).map(l=>({id:l.league.id,name:l.league.name,logo:l.league.logo,type:l.league.type,country:l.country.name,flag:l.country.flag}));return j({success:true,data:lg,count:lg.length})}
    if(p.startsWith('/api/standings/')){const pt=p.replace('/api/standings/','').split('/'),d=await fetchAPI(`/standings?league=${pt[0]}&season=${pt[1]}`);return j({success:true,data:d.response||[],league:pt[0],season:pt[1]})}
    if(p.startsWith('/api/team/')){const d=await fetchAPI(`/teams?id=${p.replace('/api/team/','')}`);if(d.response?.length){const t=d.response[0];return j({success:true,data:{id:t.team.id,name:t.team.name,logo:t.team.logo,country:t.team.country,founded:t.team.founded,venue:t.venue}})}return j({success:false,error:'Team not found'},404)}
    if(p.startsWith('/api/topscorers/')){const pt=p.replace('/api/topscorers/','').split('/'),d=await fetchAPI(`/players/topscorers?league=${pt[0]}&season=${pt[1]}`),sc=(d.response||[]).map(p=>({rank:p.rank,player:p.player.name,photo:p.player.photo,team:p.statistics?.[0]?.team?.name,team_logo:p.statistics?.[0]?.team?.logo,goals:p.statistics?.[0]?.goals?.total||0,assists:p.statistics?.[0]?.goals?.assists||0,appearances:p.statistics?.[0]?.games?.appearences||0,minutes:p.statistics?.[0]?.games?.minutes||0}));return j({success:true,data:sc,count:sc.length,league:pt[0],season:pt[1]})}
    if(p==='/api/countries'){const d=await fetchAPI('/countries');return j({success:true,data:d.response||[],count:(d.response||[]).length})}
    if(p==='/api/debug'){const t=new Date().toISOString().split('T')[0],[fx,lv]=await Promise.all([fetchAPI(`/fixtures?date=${t}`),fetchAPI('/fixtures?live=all')]);return j({success:true,current_date:t,fixtures_today:(fx.response||[]).length,live_matches:(lv.response||[]).length,api_calls:apiCalls,version:'20.0.2'})}
    return j({success:false,error:`Not found: ${p}`},404);
  }catch(e){return j({success:false,error:e.message},500)}
}

export default { async fetch(request, env, ctx) { return handleRequest(request); } };
