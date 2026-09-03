const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 10000;
const PUBLIC = path.join(__dirname, 'public');
const rooms = new Map();
const COLORS = ['#60a5fa','#34d399','#f59e0b','#f472b6'];
const REGION_ORDER=['timber','blackpine','white_ridge','deadwater','last_spike'];
const REGION_NAMES={timber:'THE TIMBER LINE',blackpine:'BLACK PINE FOREST',white_ridge:'THE WHITE RIDGE',deadwater:'DEADWATER SETTLEMENT',last_spike:'THE LAST SPIKE'};

const LOCATIONS = {
  cabin:{x:3,y:3,stage:0}, barrow:{x:21,y:12,stage:1},
  lumber:{x:31,y:18,stage:2}, junction:{x:31,y:24,stage:3}, stockade:{x:31,y:26,stage:4}
};
const LOOT = {
  'cache-cabin':{x:6,y:4,reward:{matches:2,rations:1}},
  'barrow-cache':{x:18,y:12,reward:{scrap:2,medkits:1}},
  'lumber-cache':{x:29,y:18,reward:{scrap:2,rations:2}},
  'junction-cache':{x:33,y:23,reward:{scrap:2,matches:2}},
  'key-cache':{x:34,y:25,reward:{stockadeKey:1}}
};

function safeName(v){ return String(v||'Marshal').replace(/[^a-zA-Z0-9 _.-]/g,'').trim().slice(0,18)||'Marshal'; }
const DEFAULT_CHAR_PALETTE={coatMain:'#2b3c46',hatMain:'#4a3322',skin:'#c58760',hair:'#2b1c15'};
const VALID_CLASS_IDS=['marshal','scout','brawler','medic','trapper'];
function safeHex(v,fallback){ return (typeof v==='string' && /^#[0-9a-fA-F]{6}$/.test(v)) ? v : fallback; }
function safeClassId(v){ return VALID_CLASS_IDS.includes(v) ? v : 'marshal'; }
function safeCharacterConfig(cc){
  cc=cc||{};
  return {
    name: safeName(cc.name),
    classId: safeClassId(cc.classId),
    coatMain: safeHex(cc.coatMain, DEFAULT_CHAR_PALETTE.coatMain),
    hatMain: safeHex(cc.hatMain, DEFAULT_CHAR_PALETTE.hatMain),
    skin: safeHex(cc.skin, DEFAULT_CHAR_PALETTE.skin),
    hair: safeHex(cc.hair, DEFAULT_CHAR_PALETTE.hair)
  };
}
function makeCode(){ const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c=''; do{c=Array.from({length:6},()=>chars[crypto.randomInt(chars.length)]).join('');}while(rooms.has(c)); return c; }
function makeId(){ return crypto.randomUUID(); }
function dist(a,b,x,y){ return Math.abs(a-x)+Math.abs(b-y); }
function clamp(v,min,max){ return Math.max(min,Math.min(max,Number(v)||0)); }

function makeWorld(){ return {
  inventory:{scrap:2,medkits:1,rations:2,matches:3,relics:0,stockadeKey:0},
  discovered:{cabin:true}, looted:{}, questStage:0, gateOpen:false, revision:0,
  region:'timber',
  vehicle:{id:'snow-truck-1',type:'snow_truck',region:'timber',x:31,y:24,dir:0,fuel:100,driverId:null,passengers:[]}
};}
// ============================================================
// OPEN-WORLD CO-OP COMBAT (server-authoritative)
// Enemies are real shared entities: every marshal in the room sees the
// same wandering/chasing threats and can shoot or melee them directly,
// no turn order, no scene transition. Per-player vitals (hp/ammo/torch)
// stay client-reported like the rest of this server's model -- the
// server owns enemy hp/position and simply tells a targeted client "you
// were hit for N", trusting that client to apply it, same trust model
// already used for movement.
// A lightweight replica of the client's deterministic map keeps enemy
// spawns/movement off of trees and walls in the Timber region; other
// regions fall back to bounds-only movement (they're a Phase 3 add-on,
// not this system's focus).
const MAP_COLS=42, MAP_ROWS=30;
const SERVER_MAP = (() => {
  const m = new Array(MAP_COLS*MAP_ROWS);
  for (let i=0;i<m.length;i++){
    const x=i%MAP_COLS, y=Math.floor(i/MAP_COLS);
    if (x===0||y===0||x===MAP_COLS-1||y===MAP_ROWS-1) { m[i]=1; continue; }
    const n=(x*17+y*31+x*y*7)%23;
    if (n===0||(n===5&&x%3===0)) m[i]=1;
    else if (n===2||n===11) m[i]=2;
    else m[i]=0;
  }
  const setTile=(x,y,t)=>{ if(x>=0&&y>=0&&x<MAP_COLS&&y<MAP_ROWS) m[y*MAP_COLS+x]=t; };
  const clearArea=(cx,cy,r=2)=>{ for(let y=cy-r;y<=cy+r;y++) for(let x=cx-r;x<=cx+r;x++) setTile(x,y,0); };
  clearArea(3,3,3); setTile(3,3,4);
  for (let y=3;y<MAP_ROWS-2;y++) { setTile(5,y,0); if (y>10) setTile(6,y,0); }
  for (let x=5;x<38;x++) setTile(x,12,0);
  for (let y=12;y<27;y++) setTile(31,y,0);
  for (let y=6;y<11;y++) for (let x=8;x<16;x++) if ((x+y)%3!==0) setTile(x,y,2);
  for (let y=15;y<22;y++) for (let x=18;x<28;x++) if ((x*2+y)%4!==0) setTile(x,y,2);
  for (let x=20;x<25;x++) setTile(x,12,3);
  clearArea(18,12,2); clearArea(26,12,2);
  for (let x=28;x<37;x++) setTile(x,26,3);
  setTile(31,26,0); setTile(32,26,0);
  clearArea(31,24,2);
  setTile(5,12,4); setTile(31,18,4); setTile(31,24,4);
  return m;
})();
function timberWalkable(x,y){ if(x<0||y<0||x>=MAP_COLS||y>=MAP_ROWS) return false; const t=SERVER_MAP[y*MAP_COLS+x]; return t!==1&&t!==3; }
function isWalkableInRegion(region,x,y){
  if (region==='timber') return timberWalkable(x,y);
  return x>=1&&y>=1&&x<MAP_COLS-1&&y<MAP_ROWS-1;
}

// speed is px/tile-tick before the *6 applied in tickRoomEnemies, ticked every 180ms -- calibrated
// against a player's own client-side walk pace (~120px/sec) so chase feels real instead of a crawl:
// shambler stays outwalkable, walker keeps pace with a walking marshal, outlaw outpaces a walk
// outright and forces a run-or-fight call. Mirror any change here in ENEMY_TYPES on the client.
const ENEMY_TYPES={
  shambler:{name:'Frost Shambler',hp:18,damage:7,aggro:4.5,speed:2.2,scrapChance:.55},
  walker:{name:'Rime Walker',hp:26,damage:10,aggro:5.5,speed:2.9,scrapChance:.65},
  outlaw:{name:'Frozen Outlaw',hp:34,damage:13,aggro:6,speed:5.4,scrapChance:.8}
};
const MAX_ROOM_ENEMIES=6;
let nextEnemyId=1;

function spawnEnemyForRoom(room){
  const players=[...room.players.values()];
  if(!players.length) return;
  const anchor=players[Math.floor(Math.random()*players.length)];
  const region=anchor.region||'timber';
  const typeRoll=Math.random();
  const typeId=typeRoll<0.15?'outlaw':typeRoll<0.4?'walker':'shambler';
  const def=ENEMY_TYPES[typeId];
  for(let tries=0;tries<10;tries++){
    const ang=Math.random()*Math.PI*2, d=6+Math.random()*5;
    const tx=Math.round(clamp(anchor.tileX+Math.cos(ang)*d,1,MAP_COLS-2));
    const ty=Math.round(clamp(anchor.tileY+Math.sin(ang)*d,1,MAP_ROWS-2));
    if(!isWalkableInRegion(region,tx,ty)) continue;
    const id='e'+(nextEnemyId++);
    room.enemies.set(id,{
      id,type:typeId,name:def.name,region,
      tileX:tx,tileY:ty,targetX:tx,targetY:ty,pixelX:tx*32,pixelY:ty*32,
      dir:0,isMoving:false,walkAnimFrame:0,
      hp:def.hp,maxHp:def.hp,state:'idle',lastAttackAt:0,lastMoveAt:0
    });
    return;
  }
}

function tickRoomEnemies(room){
  const now=Date.now();
  if(room.enemies.size<Math.min(2+room.players.size,MAX_ROOM_ENEMIES) && Math.random()<0.10){
    spawnEnemyForRoom(room);
  }
  for(const e of room.enemies.values()){
    const def=ENEMY_TYPES[e.type];
    let nearest=null,nearestDist=Infinity;
    for(const p of room.players.values()){
      if((p.region||'timber')!==e.region) continue;
      const d=Math.hypot(p.tileX-e.tileX,p.tileY-e.tileY);
      if(d<nearestDist){nearestDist=d;nearest=p;}
    }
    if(!nearest) continue;
    if(e.state==='idle' && nearestDist<=def.aggro) e.state='chase';
    else if(e.state==='chase' && nearestDist>def.aggro+3) e.state='idle';

    if(!e.isMoving){
      if(e.state==='chase' && nearestDist>1.2 && now-e.lastMoveAt>140){
        e.lastMoveAt=now;
        const dx=nearest.tileX-e.tileX, dy=nearest.tileY-e.tileY;
        let stepX=0,stepY=0;
        if(Math.abs(dx)>=Math.abs(dy)) stepX=dx>0?1:dx<0?-1:0; else stepY=dy>0?1:dy<0?-1:0;
        let nx=e.tileX+stepX, ny=e.tileY+stepY;
        if(!isWalkableInRegion(e.region,nx,ny)){
          if(Math.abs(dx)>=Math.abs(dy)){ nx=e.tileX; ny=e.tileY+(dy>0?1:dy<0?-1:0); }
          else { nx=e.tileX+(dx>0?1:dx<0?-1:0); ny=e.tileY; }
        }
        if(isWalkableInRegion(e.region,nx,ny)){
          e.targetX=nx; e.targetY=ny; e.isMoving=true;
          e.dir=nx!==e.tileX ? (nx>e.tileX?3:2) : (ny>e.tileY?0:1);
        }
      } else if(e.state==='idle' && now-e.lastMoveAt>1800 && Math.random()<0.3){
        e.lastMoveAt=now;
        const dirs=[[1,0,3],[-1,0,2],[0,1,0],[0,-1,1]];
        const [ddx,ddy,dd]=dirs[Math.floor(Math.random()*4)];
        const nx=e.tileX+ddx, ny=e.tileY+ddy;
        if(isWalkableInRegion(e.region,nx,ny)){ e.targetX=nx; e.targetY=ny; e.isMoving=true; e.dir=dd; }
      }
    } else {
      const speed=(e.state==='chase'?def.speed:0.7)*6;
      const tpx=e.targetX*32, tpy=e.targetY*32;
      if(e.pixelX<tpx) e.pixelX=Math.min(tpx,e.pixelX+speed); else if(e.pixelX>tpx) e.pixelX=Math.max(tpx,e.pixelX-speed);
      if(e.pixelY<tpy) e.pixelY=Math.min(tpy,e.pixelY+speed); else if(e.pixelY>tpy) e.pixelY=Math.max(tpy,e.pixelY-speed);
      if(e.pixelX===tpx&&e.pixelY===tpy){ e.tileX=e.targetX; e.tileY=e.targetY; e.isMoving=false; }
      e.walkAnimFrame=(e.walkAnimFrame+1)%4;
    }

    if(e.state==='chase' && nearestDist<=1.3 && now-e.lastAttackAt>1150){
      e.lastAttackAt=now;
      broadcast(room,{type:'enemy_attack',targetPlayerId:nearest.id,targetName:nearest.name,damage:def.damage,enemyName:e.name});
    }
  }
  broadcast(room,{type:'enemies_state',enemies:[...room.enemies.values()]});
}

function handleCombatAction(room,player,msg){
  const action=msg.action;
  if(action!=='fire'&&action!=='melee') return;
  const now=Date.now();
  const cd=action==='fire'?300:380;
  if(player.lastCombatAt && now-player.lastCombatAt<cd) return;
  player.lastCombatAt=now;
  const range=action==='fire'?4:1.6;
  let target=null,targetDist=Infinity;
  for(const e of room.enemies.values()){
    if(e.region!==(player.region||'timber')) continue;
    const d=Math.hypot(e.tileX-player.tileX,e.tileY-player.tileY);
    if(d<=range&&d<targetDist){targetDist=d;target=e;}
  }
  if(!target) return;
  const isBrawler=player.characterConfig?.classId==='brawler';
  const isTrapper=player.characterConfig?.classId==='trapper';
  const hitChance=action==='fire'?0.82:(isBrawler?0.9:0.75);
  if(Math.random()>hitChance) return;
  const dmg=action==='fire'?(2+Math.floor(Math.random()*2)):(isBrawler?(2+Math.floor(Math.random()*2)):1);
  target.hp=Math.max(0,target.hp-dmg);
  if(target.hp<=0){
    room.enemies.delete(target.id);
    const def=ENEMY_TYPES[target.type];
    if(Math.random()<def.scrapChance+(isTrapper?0.2:0)){
      const amt=1+(isTrapper?1:0);
      room.world.inventory.scrap=(room.world.inventory.scrap||0)+amt;
      room.world.revision++;
    }
    broadcast(room,{type:'enemy_down',by:player.name,enemyName:target.name});
    sync(room);
  }
}

function publicPlayer(p){ const {ws,...out}=p; return out; }
function roomPayload(room){ return {type:'room_state',roomCode:room.code,players:[...room.players.values()].map(publicPlayer)}; }
function worldPayload(room){ return {type:'world_state',world:room.world}; }
function battlePayload(room){ return {type:'battle_state',battle:room.battle||null}; }
function broadcast(room,payload){ const raw=JSON.stringify(payload); for(const p of room.players.values()) if(p.ws.readyState===WebSocket.OPEN) p.ws.send(raw); }
function sync(room){ broadcast(room,roomPayload(room)); broadcast(room,worldPayload(room)); if(room.battle) broadcast(room,battlePayload(room)); }
function fail(ws,message){ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify({type:'error',message})); }
function notice(room,title,message,kind='success'){ broadcast(room,{type:'phase3_notice',title,message,kind}); }

function removePlayer(ws){
  const room=rooms.get(ws.roomCode); if(!room||!ws.playerId)return;
  const id=ws.playerId;
  room.players.delete(id);
  const v=room.world.vehicle;
  if(v){ v.passengers=v.passengers.filter(pid=>pid!==id); if(v.driverId===id) v.driverId=null; }
  if(room.battle&&room.battle.participants.includes(id)){
    room.battle.participants=room.battle.participants.filter(pid=>pid!==id);
    if(room.battle.participants.length===0) room.battle=null;
    else if(room.battle.activePlayerId===id){ room.battle.turnIndex%=room.battle.participants.length; room.battle.activePlayerId=room.battle.participants[room.battle.turnIndex]; }
  }
  ws.roomCode=null;ws.playerId=null;
  broadcast(room,{type:'player_left',playerId:id});
  if(room.players.size===0){ if(room.enemyTickTimer) clearInterval(room.enemyTickTimer); rooms.delete(room.code); } else sync(room);
}
function validNear(player,x,y,range=2){ return dist(player.tileX,player.tileY,x,y)<=range; }
function advanceWorld(world,stage){ if(stage===world.questStage && world.questStage<4){ world.questStage++; } }

function applyWorldAction(room,player,msg){
  const world=room.world, action=msg.action;
  if(action==='discover'){
    if(world.region!=='timber') return;
    const id=String(msg.id||''), loc=LOCATIONS[id]; if(!loc) return;
    if(!validNear(player,loc.x,loc.y,2)) return fail(player.ws,'You are too far away from that location.');
    if(!world.discovered[id]){ world.discovered[id]=true; advanceWorld(world,loc.stage); world.revision++; broadcast(room,{type:'world_event',event:'discover',id,by:player.name,byId:player.id}); sync(room); }
    return;
  }
  if(action==='loot'){
    if(world.region!=='timber') return;
    const id=String(msg.id||''), site=LOOT[id]; if(!site||world.looted[id]) return;
    if(!validNear(player,site.x,site.y,1)) return fail(player.ws,'You are too far away to search that cache.');
    world.looted[id]=true; for(const [k,v] of Object.entries(site.reward)) world.inventory[k]=(world.inventory[k]||0)+v;
    if(id==='key-cache' && world.questStage<4) world.questStage=4;
    world.revision++; broadcast(room,{type:'world_event',event:'loot',id,by:player.name,byId:player.id,reward:site.reward}); sync(room); return;
  }
  if(action==='open_stockade'){
    if(world.region!=='timber') return;
    if(!validNear(player,31,26,3)) return fail(player.ws,'You are too far away from the stockade gate.');
    if(world.gateOpen) return;
    if((world.inventory.stockadeKey||0)<1 || (world.inventory.scrap||0)<5) return fail(player.ws,`The gate needs a WAYSTATION KEY and 5 SCRAP. Expedition supplies have ${world.inventory.scrap||0} scrap.`);
    world.gateOpen=true; world.questStage=5; world.revision++;
    broadcast(room,{type:'world_event',event:'gate_opened',by:player.name,byId:player.id});
    sync(room); return;
  }
  if(action==='use_item'){
    const item=String(msg.item||''); if(!['medkits','rations','matches'].includes(item)) return;
    if((world.inventory[item]||0)<=0) return fail(player.ws,'The expedition has none of that item left.');
    world.inventory[item]--; world.revision++; broadcast(room,{type:'world_event',event:'item_used',item,by:player.name,byId:player.id}); sync(room); return;
  }
}

function vehicleRiders(v){ return new Set([v.driverId,...v.passengers].filter(Boolean)); }
function handleVehicle(room,player,msg){
  const v=room.world.vehicle;
  if(msg.type==='enter_vehicle'){
    if(player.region!==v.region) return fail(player.ws,'The snow truck is in another region.');
    if(validNear(player,v.x,v.y,3)===false) return fail(player.ws,'Move closer to the snow truck.');
    if(v.passengers.includes(player.id)||v.driverId===player.id) return;
    if(!v.driverId){ v.driverId=player.id; }
    else if(v.passengers.length<3){ v.passengers.push(player.id); }
    else return fail(player.ws,'The snow truck is full.');
    player.tileX=v.x;player.tileY=v.y;player.targetX=v.x;player.targetY=v.y;player.pixelX=v.x*32;player.pixelY=v.y*32;
    room.world.revision++; broadcast(room,{type:'world_event',event:'vehicle_entered',message:`${player.name} boarded the expedition snow truck.`}); sync(room); return;
  }
  if(msg.type==='exit_vehicle'){
    if(v.driverId!==player.id && !v.passengers.includes(player.id)) return;
    if(v.driverId===player.id){ v.driverId=null; if(v.passengers.length){ v.driverId=v.passengers.shift(); } }
    else v.passengers=v.passengers.filter(id=>id!==player.id);
    player.tileX=Math.min(40,v.x+1);player.tileY=v.y;player.targetX=player.tileX;player.targetY=player.tileY;player.pixelX=player.tileX*32;player.pixelY=player.tileY*32;
    room.world.revision++; broadcast(room,{type:'world_event',event:'vehicle_exited',message:`${player.name} left the snow truck.`}); sync(room); return;
  }
  if(msg.type==='vehicle_move'){
    if(v.driverId!==player.id) return;
    const s=msg.state||{};
    const x=Math.round(clamp(s.x,1,40)), y=Math.round(clamp(s.y,1,28));
    if(v.fuel<=0) return fail(player.ws,'The snow truck is out of fuel.');
    if(x!==v.x||y!==v.y) v.fuel=Math.max(0,+(v.fuel-0.12).toFixed(2));
    v.x=x;v.y=y;v.dir=Math.round(clamp(s.dir,0,3));
    for(const id of vehicleRiders(v)){
      const p=room.players.get(id); if(!p) continue;
      p.tileX=x;p.tileY=y;p.targetX=x;p.targetY=y;p.pixelX=x*32;p.pixelY=y*32;p.region=v.region;
    }
    room.world.revision++; sync(room); return;
  }
}

function handleTravel(room,player,msg){
  const region=String(msg.region||'');
  if(!REGION_ORDER.includes(region)) return fail(player.ws,'Unknown region.');
  if(region==='timber' || room.world.gateOpen){
    room.world.region=region;
    const spawn=region==='timber'?{x:3,y:3}:region==='blackpine'?{x:3,y:15}:region==='white_ridge'?{x:3,y:15}:region==='deadwater'?{x:5,y:15}:{x:5,y:15};
    for(const p of room.players.values()){
      p.region=region;p.tileX=spawn.x;p.tileY=spawn.y;p.targetX=spawn.x;p.targetY=spawn.y;p.pixelX=spawn.x*32;p.pixelY=spawn.y*32;p.isMoving=false;
    }
    const v=room.world.vehicle; v.region=region;v.x=Math.min(38,spawn.x+2);v.y=spawn.y;v.driverId=null;v.passengers=[];
    room.world.revision++; room.world.spawn=spawn;
    broadcast(room,{type:'world_event',event:'region_changed',message:`The expedition entered ${REGION_NAMES[region]}.`});
    notice(room,'NEW FRONTIER',REGION_NAMES[region]);
    sync(room);
  }else fail(player.ws,'The Waystation Stockade must be opened before the expedition can push south.');
}

function startEncounter(room,requester){
  if(room.battle&&room.battle.active) return;
  const now=Date.now();
  if(room.lastEncounter && now-room.lastEncounter<9000) return;
  room.lastEncounter=now;
  if(Math.random()>.38) return; // drift encounters remain dangerous, not constant.
  const participants=[...room.players.values()].filter(p=>p.region===room.world.region).map(p=>p.id);
  if(!participants.length) return;
  const roster=[
    {name:'Frost Shambler',maxHp:12,damage:8,hit:.70},
    {name:'Rime Walker',maxHp:16,damage:11,hit:.66},
    {name:'Frozen Outlaw',maxHp:20,damage:13,hit:.60}
  ];
  const enemy=roster[Math.floor(Math.random()*roster.length)];
  room.battle={active:true,id:crypto.randomUUID(),region:room.world.region,participants,turnIndex:0,activePlayerId:participants[0],
    enemy:{...enemy,hp:enemy.maxHp},seed:Math.random()*9999,message:`${enemy.name.toUpperCase()} STALKS THE EXPEDITION!`};
  notice(room,'CO-OP ENCOUNTER',room.battle.message,'danger');
  broadcast(room,battlePayload(room));
}
function handleBattleAction(room,player,msg){
  const b=room.battle;
  if(!b||!b.active) return;
  if(!b.participants.includes(player.id)) return fail(player.ws,'You are not in this battle.');
  if(b.activePlayerId!==player.id) return fail(player.ws,'It is not your turn.');
  const action=String(msg.action||'');
  if(!['shoot','shove','reload','run'].includes(action)) return;
  if(action==='shoot'){
    if(Math.random()<.84){ const dmg=2+crypto.randomInt(2);b.enemy.hp=Math.max(0,b.enemy.hp-dmg);b.message=`${player.name.toUpperCase()} HITS FOR ${dmg} DAMAGE!`; }
    else b.message=`${player.name.toUpperCase()}'S SHOT VANISHES INTO THE WHITEOUT.`;
  }else if(action==='shove'){
    const dmg=Math.random()<.78?1:0;b.enemy.hp=Math.max(0,b.enemy.hp-dmg);b.message=dmg?`${player.name.toUpperCase()} SMASHES FROZEN BONE.`:`${player.name.toUpperCase()} CANNOT MOVE THE DEAD.`;
  }else if(action==='reload'){
    b.message=`${player.name.toUpperCase()} RELOADS.`;
  }else if(action==='run'){
    b.participants=b.participants.filter(id=>id!==player.id);
    if(!b.participants.length){ b.active=false;b.message='THE EXPEDITION ESCAPED INTO THE DRIFTS.';broadcast(room,battlePayload(room));room.battle=null;return; }
    b.turnIndex%=b.participants.length;b.activePlayerId=b.participants[b.turnIndex];b.message=`${player.name.toUpperCase()} FALLS BACK — THE OTHERS HOLD THE LINE.`;broadcast(room,battlePayload(room));return;
  }
  if(b.enemy.hp<=0){
    room.world.inventory.scrap=(room.world.inventory.scrap||0)+1;
    room.world.inventory.medkits=(room.world.inventory.medkits||0)+(Math.random()<.25?1:0);
    b.active=false;b.message=`${b.enemy.name.toUpperCase()} FALLS. EXPEDITION SALVAGE RECOVERED.`;
    broadcast(room,battlePayload(room));notice(room,'BATTLE WON','The expedition recovers salvage from the frozen dead.');
    room.battle=null;room.world.revision++;sync(room);return;
  }
  // Enemy answers once, then rotate to the next surviving marshal.
  const target=player;
  if(Math.random()<b.enemy.hit){
    b.message=`${b.enemy.name.toUpperCase()} HITS ${target.name.toUpperCase()} FOR ${b.enemy.damage} DAMAGE!`;
    broadcast(room,{type:'phase3_notice',title:'ENEMY STRIKES',message:b.message,kind:'danger'});
  }else b.message=`${b.enemy.name.toUpperCase()} MISSES IN THE BLIZZARD.`;
  b.turnIndex=(b.turnIndex+1)%b.participants.length;b.activePlayerId=b.participants[b.turnIndex];
  broadcast(room,battlePayload(room));
}

const server=http.createServer((req,res)=>{
  const url=req.url==='/'?'/index.html':req.url.split('?')[0];
  const file=path.normalize(path.join(PUBLIC,url));
  if(!file.startsWith(PUBLIC)){res.writeHead(403);return res.end('Forbidden');}
  fs.readFile(file,(err,data)=>{
    if(err){res.writeHead(404);return res.end('Not found');}
    const types={'.html':'text/html; charset=utf-8','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.ico':'image/x-icon'};
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data);
  });
});

const wss=new WebSocketServer({server,path:'/ws'});
wss.on('connection',ws=>{
  ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);
  ws.on('message',buf=>{
    let msg;try{msg=JSON.parse(buf.toString());}catch{return;}
    if(msg.type==='create_room'){
      removePlayer(ws);const code=makeCode();const room={code,players:new Map(),world:makeWorld(),battle:null,lastEncounter:0,enemies:new Map()};
      room.enemyTickTimer=setInterval(()=>tickRoomEnemies(room),180);
      rooms.set(code,room);
      const id=makeId(),p={id,name:safeName(msg.name),characterConfig:safeCharacterConfig(msg.characterConfig),color:COLORS[0],region:'timber',tileX:3,tileY:3,targetX:3,targetY:3,pixelX:96,pixelY:96,dir:0,isMoving:false,walkAnimFrame:0,stepCount:0,ws};
      room.players.set(id,p);ws.roomCode=code;ws.playerId=id;ws.send(JSON.stringify({type:'room_joined',roomCode:code,playerId:id,playerCount:1}));sync(room);return;
    }
    if(msg.type==='join_room'){
      removePlayer(ws);const code=String(msg.roomCode||'').toUpperCase(),room=rooms.get(code);if(!room)return fail(ws,'That expedition room does not exist.');if(room.players.size>=4)return fail(ws,'That expedition already has four marshals.');
      const id=makeId(),n=room.players.size,tx=4+(n%2),ty=3+Math.floor(n/2);const p={id,name:safeName(msg.name),characterConfig:safeCharacterConfig(msg.characterConfig),color:COLORS[n],region:room.world.region,tileX:tx,tileY:ty,targetX:tx,targetY:ty,pixelX:tx*32,pixelY:ty*32,dir:0,isMoving:false,walkAnimFrame:0,stepCount:0,ws};
      room.players.set(id,p);ws.roomCode=code;ws.playerId=id;ws.send(JSON.stringify({type:'room_joined',roomCode:code,playerId:id,playerCount:room.players.size}));sync(room);return;
    }
    const room=rooms.get(ws.roomCode),player=room?.players.get(ws.playerId);if(!room||!player)return;
    if(msg.type==='player_state'&&msg.state){
      if(room.battle?.active && room.battle.participants.includes(player.id)) return;
      const s=msg.state;player.tileX=Math.round(clamp(s.tileX,0,41));player.tileY=Math.round(clamp(s.tileY,0,29));player.targetX=Math.round(clamp(s.targetX,0,41));player.targetY=Math.round(clamp(s.targetY,0,29));player.pixelX=clamp(s.pixelX,0,41*32);player.pixelY=clamp(s.pixelY,0,29*32);player.dir=Math.round(clamp(s.dir,0,3));player.isMoving=!!s.isMoving;player.walkAnimFrame=Math.round(clamp(s.walkAnimFrame,0,3));player.stepCount=Math.round(clamp(s.stepCount,0,999999));player.region=room.world.region;broadcast(room,roomPayload(room));return;
    }
    if(msg.type==='start_expedition'){ broadcast(room,{type:'expedition_started',by:player.name}); return; }
    if(msg.type==='world_action') return applyWorldAction(room,player,msg);
    if(msg.type==='enter_vehicle'||msg.type==='exit_vehicle'||msg.type==='vehicle_move') return handleVehicle(room,player,msg);
    if(msg.type==='travel_region') return handleTravel(room,player,msg);
    if(msg.type==='encounter_request') return startEncounter(room,player);
    if(msg.type==='battle_action') return handleBattleAction(room,player,msg);
    if(msg.type==='combat_action') return handleCombatAction(room,player,msg);
  });
  ws.on('close',()=>removePlayer(ws));ws.on('error',()=>removePlayer(ws));
});
const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},30000);
wss.on('close',()=>clearInterval(heartbeat));
process.on('SIGTERM',()=>{for(const ws of wss.clients)ws.close(1001,'Server shutting down');server.close(()=>process.exit(0));setTimeout(()=>process.exit(0),5000).unref();});
server.listen(PORT,'0.0.0.0',()=>console.log(`DEADEYE Phase 3 co-op frontier listening on ${PORT}`));
