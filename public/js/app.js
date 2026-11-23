'use strict';
const AW={
 user:null,
 async api(url,options={}){
  const init={credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}};
  let res;try{res=await fetch(url,init)}catch(e){throw Error('Нет соединения с сервером');}
  let data;try{data=await res.json()}catch(e){throw Error('Некорректный ответ сервера');}
  if(!res.ok)throw Error(data.error||`Ошибка ${res.status}`);return data;
 },
 esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));},
 money(n){return Number(n||0).toLocaleString('ru-RU',{maximumFractionDigits:2})+' ₽'},
 toast(text,type='ok'){const el=document.getElementById('toast');if(!el)return;el.textContent=text;el.className='toast'+(type==='error'?' error':'');clearTimeout(AW.timer);AW.timer=setTimeout(()=>el.classList.add('hidden'),4400)},
 async loadUser(){const result=await AW.api('/api/me');AW.user=result.user;document.getElementById('nav-login')?.classList.toggle('hidden',!!AW.user);document.getElementById('nav-logout')?.classList.toggle('hidden',!AW.user);document.getElementById('nav-admin')?.classList.toggle('hidden',AW.user?.role!=='admin');return AW.user;},
 async requireLogin(){await AW.ready;if(!AW.user){location.href='/auth.html?next='+encodeURIComponent(location.pathname);return false;}return true;},
 status(s,label){return `<span class="status ${AW.esc(s)}">${AW.esc(label)}</span>`},
 order(o,canCancel=false){return `<div class="order-row"><div><div class="primaryline">Заказ №${AW.esc(o.id)} · ${AW.esc(o.brand)} ${AW.esc(o.model)}</div><small>${AW.esc(o.starts_at)} · ${AW.esc(o.plate)} · ${AW.esc(o.bay)}</small><small>${AW.esc(o.services)}</small></div><div class="right"><div>${AW.status(o.status,o.status_label)}</div><strong style="display:block;margin:10px 0">${AW.money(o.total_price)}</strong>${canCancel&&['pending','confirmed'].includes(o.status)&&o.starts_at.replace(' ','T')>new Date().toLocaleString('sv-SE').replace(' ','T')?`<button class="btn btn-danger btn-sm" data-cancel="${AW.esc(o.id)}">Отменить</button>`:''}</div></div>`},
 empty(title,detail){return `<div class="empty"><strong>${AW.esc(title)}</strong><span>${AW.esc(detail)}</span></div>`}
};
window.AW=AW;
AW.ready=AW.loadUser().catch(()=>null);
document.getElementById('menu-btn')?.addEventListener('click',()=>document.getElementById('navlinks').classList.toggle('open'));
document.getElementById('nav-logout')?.addEventListener('click',async()=>{try{await AW.api('/api/auth/logout',{method:'POST'});location.href='/';}catch(e){AW.toast(e.message,'error')}});
