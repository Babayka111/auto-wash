(async()=>{
 const holder=document.getElementById('services-list'),search=document.getElementById('service-search'),sort=document.getElementById('service-sort'),only=document.getElementById('favorites-only'),count=document.getElementById('catalog-count'),favCount=document.getElementById('favorites-count');
 const key='washpoint-favorite-services';let items=[];
 const favorites=()=>{try{const ids=JSON.parse(localStorage.getItem(key)||'[]');return new Set(Array.isArray(ids)?ids.map(String):[])}catch{return new Set()}};
 const save=ids=>{try{localStorage.setItem(key,JSON.stringify([...ids]))}catch{AW.toast('Не получилось сохранить избранное','error')}};
 function render(){const fav=favorites(),query=(search.value||'').trim().toLocaleLowerCase('ru');let found=items.filter(s=>(!only.checked||fav.has(String(s.id)))&&(`${s.name} ${s.description}`.toLocaleLowerCase('ru').includes(query)));
  if(sort.value==='price-asc')found.sort((a,b)=>Number(a.price)-Number(b.price));else if(sort.value==='price-desc')found.sort((a,b)=>Number(b.price)-Number(a.price));else if(sort.value==='duration')found.sort((a,b)=>a.duration_min-b.duration_min);
  count.textContent=`Найдено услуг: ${found.length}`;favCount.textContent=fav.size?`(${fav.size})`:'';
  holder.innerHTML=found.length?found.map((s,i)=>`<div class="card service-card"><button type="button" class="fav-button ${fav.has(String(s.id))?'active':''}" data-fav="${s.id}" aria-label="${fav.has(String(s.id))?'Удалить из избранного':'Добавить в избранное'}" title="Избранное">${fav.has(String(s.id))?'♥':'♡'}</button><div class="iconbox">${String(i+1).padStart(2,'0')}</div><h3>${AW.esc(s.name)}</h3><p>${AW.esc(s.description)}</p><div class="service-bottom"><div><span class="price">${AW.money(s.price)}</span><div class="muted small">${s.duration_min} мин</div></div><a class="btn btn-light btn-sm" href="/booking.html?service=${encodeURIComponent(s.id)}">Выбрать ↗</a></div></div>`).join(''):AW.empty('Ничего не найдено','Попробуйте другой запрос или отключите фильтр');
 }
 holder.addEventListener('click',e=>{const b=e.target.closest('[data-fav]');if(!b)return;const ids=favorites();ids.has(b.dataset.fav)?ids.delete(b.dataset.fav):ids.add(b.dataset.fav);save(ids);render()});
 [search,sort,only].forEach(el=>el.addEventListener(el===search?'input':'change',render));
 try{items=await AW.api('/api/services');render()}catch(e){holder.textContent=e.message}
})();
