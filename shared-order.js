'use strict';
// V6.4 — único pedido compartido. Las operaciones de +/− son atómicas en PostgreSQL.
(() => {
 let revision=-1, enabled=false, writing=false, updating=false, tick, sentRevision=null;
 const oldRender=render;
 function info(){return document.getElementById('sharedOrderInfo')}
 function status(t){const x=info();if(x)x.textContent=t}
 function mapQuantities(remote){
  const next={};for(const p of state.products){if(p.cloudId&&remote[p.cloudId]>0)next[p.id]=remote[p.cloudId]}
  state.order=next;save();render();
 }
 async function pull(force=false){
  if(!enabled||writing||updating||document.hidden)return;
  updating=true;
  try{const rows=await window.karolCloud.api('/rest/v1/pedido_compartido?select=cantidades,revision&id=eq.1');
   const r=rows?.[0];if(!r)throw Error('No existe pedido compartido. Ejecuta SQL V6.4.');
   if(force||r.revision!==revision){revision=r.revision;mapQuantities(r.cantidades||{});}
   status('Pedido compartido en línea · revisión '+revision);
  }catch(e){status('Sin conexión con pedido: '+e.message);}
  finally{updating=false}
 }
 async function start(){enabled=true;revision=-1;await pull(true);if(revision<0){enabled=false;throw Error('No se pudo leer el pedido compartido. Ejecuta el SQL V6.4 en Supabase.')}clearInterval(tick);tick=setInterval(()=>pull(),3500)}
 function stop(){enabled=false;clearInterval(tick);revision=-1;sentRevision=null}
 async function op(path,body){
  if(!enabled)throw Error('Inicia sesión para modificar el pedido compartido.');
  if(writing)throw Error('Espera a que termine el cambio anterior.');
  writing=true;status('Guardando en nube…');
  try{
   const r=await window.karolCloud.api('/rest/v1/rpc/'+path,{method:'POST',body:JSON.stringify(body)});
   revision=r.revision;mapQuantities(r.cantidades||{});status('Sincronizado · revisión '+revision);
   return r;
  }catch(e){status('Error: '+e.message);alert('No se guardó el cambio en la nube: '+e.message);throw e}
  finally{writing=false}
 }
 async function adjust(id,diff){
  const p=state.products.find(x=>x.id===id);
  if(!p?.cloudId){alert('Producto sin identificador de nube. Actualiza el catálogo.');return}
  try{await op('cambiar_cajas_compartidas',{p_producto:p.cloudId,p_delta:diff})}catch{}
 }
 async function reset(){if(!confirm('¿Vaciar el pedido COMPARTIDO para todos los dispositivos?'))return;
  try{await op('vaciar_pedido_compartido',{});go('order')}catch{}
 }
 function markSent(){sentRevision=revision}
 async function finish(){
  if(!enabled){alert('Inicia sesión para cerrar el pedido compartido.');return}
  // Evita finalizar con una pantalla obsoleta.
  await pull(true);
  const items=picked().map(p=>({code:p.code,name:p.name,qty:state.order[p.id]}));
  if(!items.length){alert('El pedido ya está vacío.');return}
  if(sentRevision===null || revision!==sentRevision){alert('El pedido fue modificado desde que abriste WhatsApp. Debes revisar y enviar nuevamente el pedido actualizado antes de cerrarlo.');go('review');return}
  if(!confirm('Confirmar cierre del pedido compartido de '+total()+' cajas. ¿Ya se enviaron los mensajes de WhatsApp?'))return;
  try{const r=await op('cerrar_pedido_compartido',{p_revision:revision});
   const h={id:'h'+Date.now(),cloudId:r.id,date:now(),iso:new Date().toISOString(),items:r.items};
   state.history.unshift(h);sentRevision=null;state.sendPending=null;save();closeModal();go('home');
   alert('Pedido guardado en Supabase e iniciado uno nuevo para todos los dispositivos.');
  }catch{}
 }
 const baseRender=render;
 render=function(){baseRender();if(enabled&&(page==='home'||page==='order'||page==='review')){
  const root=document.getElementById('root');root.insertAdjacentHTML('afterbegin','<p class="note" id="sharedOrderInfo">☁️ Pedido único compartido · revisión '+revision+'</p>');
 }};
 window.karolSharedOrder={start,stop,adjust,reset,finish,markSent,isEnabled:()=>enabled,pull};
})();
