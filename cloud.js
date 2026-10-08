'use strict';
/* Supabase REST client. Public project URL and publishable/anon key only. */
(() => {
const CK='karol_cloud_connection_v1', TK='karol_cloud_session_v1';
let cfg=JSON.parse(localStorage.getItem(CK)||'null'),session=JSON.parse(localStorage.getItem(TK)||'null');
let role=null, busy=false, unsynced=new Set(), scheduled=null;
const el=id=>document.getElementById(id);
const notice=s=>{const x=el('cloudStatus');if(x)x.textContent=s;};
function authHeaders(json=true){return {'apikey':cfg.key,...(json?{'Content-Type':'application/json'}:{}),...(session?.access_token?{'Authorization':'Bearer '+session.access_token}:{})};}
async function call(path,options={}){
 if(!cfg)throw Error('Configura la conexión a Supabase.');
 let res=await fetch(cfg.url+path,{...options,headers:{...authHeaders(),...(options.headers||{})}});
 if(res.status===401&&session?.refresh_token){await refresh();res=await fetch(cfg.url+path,{...options,headers:{...authHeaders(),...(options.headers||{})}})}
 if(!res.ok){let j=await res.text();try{const x=JSON.parse(j);j=x.message||x.error_description||x.error||j}catch{}throw Error(`${res.status}: ${j.slice(0,230)}`)}
 if(res.status===204)return null;const t=await res.text();return t?JSON.parse(t):null;
}
async function refresh(){if(!session?.refresh_token)throw Error('Inicia sesión nuevamente');const res=await fetch(cfg.url+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});if(!res.ok){session=null;localStorage.removeItem(TK);throw Error('Sesión vencida. Vuelve a iniciar sesión.')}session=await res.json();localStorage.setItem(TK,JSON.stringify(session));}
async function checkRole(){if(!session)return null;try{const r=await call('/rest/v1/rpc/es_operador_autorizado',{method:'POST',body:'{}'});if(r!==true){role=null;throw Error('Esta cuenta no está autorizada en usuarios_autorizados.')}role=(await call('/rest/v1/rpc/es_administrador',{method:'POST',body:'{}'}))===true?'administrador':'operador';return role}catch(e){role=null;throw e}}
function cloudId(p){if(!p.cloudId)p.cloudId=crypto.randomUUID();return p.cloudId}
function toRemote(p){return {id:cloudId(p),codigo_barras:p.code||null,descripcion:p.name,activo:p.status!=='inactive',foto_path:p.photoPath||null,posicion:0,updated_at:new Date().toISOString()}}
async function uploadPhoto(p){if(!p.photo?.startsWith('data:image/'))return;const id=cloudId(p);const path=id+'.jpg';const blob=await (await fetch(p.photo)).blob();const resp=await fetch(cfg.url+'/storage/v1/object/productos-karol/'+path,{method:'POST',headers:{...authHeaders(false),'Content-Type':'image/jpeg','x-upsert':'true'},body:blob});if(!resp.ok)throw Error('Fotografía '+p.name+': '+(await resp.text()).slice(0,180));p.photoPath=path;}
async function batchUpload(products){
 if(!role)throw Error('Inicia sesión antes de sincronizar.');
 for(let i=0;i<products.length;i+=25){const slice=products.slice(i,i+25);for(const p of slice)await uploadPhoto(p);
 await call('/rest/v1/productos?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(slice.map(toRemote))});
 notice(`Sincronizados ${Math.min(i+25,products.length)}/${products.length} productos…`);
 }
 save();
}
async function signedPhoto(path){if(!path)return null;const r=await call('/storage/v1/object/sign/productos-karol/'+encodeURIComponent(path),{method:'POST',body:JSON.stringify({expiresIn:3600})});return cfg.url+'/storage/v1'+r.signedURL;}
async function getRemote(){return await call('/rest/v1/productos?select=id,codigo_barras,descripcion,activo,foto_path&order=descripcion.asc&limit=10000');}
async function loadCloud(){
 if(!role)throw Error('Debes iniciar sesión');
 if(unsynced.size)throw Error('Hay modificaciones locales pendientes de sincronizar. Primero pulsa Enviar cambios.');
 const rows=await getRemote();if(!rows.length){notice('La nube está vacía. El administrador debe publicar primero el catálogo.');return}
 const previous=new Map(state.products.map(p=>[p.cloudId||'',p]));const byCode=new Map(state.products.filter(p=>p.code).map(p=>[p.code,p]));
 const result=rows.map(r=>{const old=previous.get(r.id)||byCode.get(r.codigo_barras)||{};return {id:old.id||'c'+r.id,cloudId:r.id,code:r.codigo_barras||'',name:r.descripcion,status:r.activo?'active':'inactive',photoPath:r.foto_path||null,photo:r.foto_path?(old.photoPath===r.foto_path&&old.photo?.startsWith('data:')?old.photo:null):null,customRank:old.customRank??null}});
 // Never replace an unsent draft: the order uses stable local IDs mapped by product code.
 const existingItems=state.products.filter(p=>(state.order[p.id]||0)>0).map(p=>({code:p.code,name:p.name,qty:state.order[p.id]}));
 const newOrder={};for(const item of existingItems){const p=result.find(p=>item.code&&p.code===item.code)||result.find(p=>p.name===item.name);if(p)newOrder[p.id]=item.qty;}
 state.products=result;state.order=newOrder;save();render();notice(`Catálogo actualizado desde la nube: ${rows.length} productos.`);
 // Signed URLs are short-lived, renewed on every cloud refresh.
 for(const p of result.filter(x=>x.photoPath)){try{p.photo=await signedPhoto(p.photoPath)}catch{p.photo=null}}
 save();render();
}
async function publishInitial(){
 if(role!=='administrador')throw Error('Solo el administrador puede publicar el catálogo inicial.');
 const remote=await getRemote();if(remote.length)throw Error('La base ya contiene productos. Usa «Descargar catálogo»; no se permite sobreescribir masivamente.');
 if(!confirm('Publicar TODOS los productos locales como catálogo inicial de la nube? Esta operación debe ejecutarse una sola vez.'))return;
 notice('Publicando catálogo inicial…');await batchUpload(state.products);notice('Catálogo inicial publicado. Ahora puedes abrirlo desde otros dispositivos.');
}
async function pushChanges(){if(!role)throw Error('Primero inicia sesión.');if(!unsynced.size){notice('No hay cambios pendientes.');return}const ids=[...unsynced];const products=state.products.filter(p=>ids.includes(p.id));if(!(await getRemote()).length)throw Error('Nube vacía: el administrador debe publicar el catálogo inicial.');await batchUpload(products);products.forEach(p=>unsynced.delete(p.id));notice('Cambios sincronizados con Supabase.');}
function dirty(ids){if(!cfg||!session)return;for(const id of ids)unsynced.add(id);notice(`${unsynced.size} producto(s) pendiente(s) de sincronizar.`);if(scheduled)clearTimeout(scheduled);scheduled=setTimeout(()=>pushChanges().catch(e=>notice('Sincronización pendiente: '+e.message)),950)}
async function saveOrder(h){if(!role)return;try{if(!h.cloudId)h.cloudId=crypto.randomUUID();await call('/rest/v1/pedidos?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:h.cloudId,fecha:h.iso,estado:'ENVIADO',enviado_confirmado:true,contenido:{date:h.date,items:h.items}})});save()}catch(e){console.warn('Pedido no sincronizado',e);alert('Pedido guardado localmente, pero NO llegó a la nube: '+e.message)}}
function settingsHtml(){return `<div class="panel" style="margin-top:14px"><h3>☁️ Nube Supabase</h3><p class="sub">Para conectar los dispositivos utiliza la URL del proyecto y su clave pública (publishable/anon). Nunca uses la service_role o secret key.</p><label>URL del proyecto<br><input class="wide" id="cloudUrl" placeholder="https://xxxxx.supabase.co" value="${esc(cfg?.url||'')}"></label><label>Clave pública<br><input class="wide" id="cloudKey" type="password" placeholder="sb_publishable_... o anon" value="${esc(cfg?.key||'')}"></label><div class="tools"><button class="secondary" id="cloudConfigure">Guardar conexión</button></div><p class="sub">${session?'Sesión iniciada · Rol: '+(role||'por verificar'):'Sin sesión de usuario'}</p><label>Correo del empleado<br><input class="wide" type="email" id="cloudEmail" autocomplete="username"></label><label>Contraseña<br><input class="wide" type="password" id="cloudPassword" autocomplete="current-password"></label><div class="tools"><button id="cloudLogin">Iniciar sesión</button><button class="secondary" id="cloudLogout">Cerrar sesión</button></div><p id="cloudStatus" class="note">${cfg?(role?'Nube conectada.':'Conexión guardada; inicia sesión.'):'Sin configurar.'}</p><div class="tools"><button id="cloudPull">Descargar catálogo de la nube</button><button id="cloudPush">Enviar cambios pendientes</button><button class="secondary" id="cloudPublish">Publicar catálogo inicial (administrador)</button></div><p class="sub">El pedido en elaboración permanece local en cada dispositivo. No publiques un catálogo inicial si ya existen productos en la nube. Las fotos se guardan en un bucket privado.</p></div>`}
async function login(email,password){if(!cfg)throw Error('Guarda primero la conexión');const r=await fetch(cfg.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:cfg.key,'Content-Type':'application/json'},body:JSON.stringify({email,password})});const j=await r.json();if(!r.ok)throw Error(j.msg||j.error_description||j.message||'Credenciales incorrectas');session=j;localStorage.setItem(TK,JSON.stringify(j));try{await checkRole()}catch(e){session=null;localStorage.removeItem(TK);throw e}await loadCloud();}
function wire(){if(!el('cloudConfigure'))return;el('cloudConfigure').onclick=()=>{const url=el('cloudUrl').value.trim().replace(/\/+$/,''),key=el('cloudKey').value.trim();if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)||!key) return alert('Comprueba URL y clave pública de Supabase.');cfg={url,key};localStorage.setItem(CK,JSON.stringify(cfg));role=null;session=null;localStorage.removeItem(TK);render()};el('cloudLogin').onclick=async()=>{try{notice('Validando usuario…');await login(el('cloudEmail').value.trim(),el('cloudPassword').value);render();notice('Sesión iniciada y catálogo cargado.')}catch(e){notice('Error: '+e.message)}};el('cloudLogout').onclick=async()=>{try{if(session)await call('/auth/v1/logout',{method:'POST'})}catch{}session=null;role=null;localStorage.removeItem(TK);render()};el('cloudPull').onclick=async()=>{try{notice('Descargando…');await loadCloud()}catch(e){notice('Error: '+e.message)}};el('cloudPush').onclick=async()=>{try{await pushChanges()}catch(e){notice('Error: '+e.message)}};el('cloudPublish').onclick=async()=>{try{await publishInitial()}catch(e){notice('Error: '+e.message)}};}
function show(){if(page==='settings'){el('root').insertAdjacentHTML('beforeend',settingsHtml());wire()}}
window.karolCloud={show,dirty,saveOrder,connected:()=>!!cfg,authenticated:()=>!!role,role:()=>role};
const oldRender=render;render=function(){oldRender();show()};
(async()=>{if(cfg&&session){try{await checkRole();await loadCloud()}catch(e){notice('Conexión pendiente: '+e.message)}}render()})();
})();
