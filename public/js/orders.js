(async()=>{
 if(!await AW.requireLogin())return;
 const active=document.getElementById('active-bookings'),all=document.getElementById('all-orders'),filter=document.getElementById('history-filter'),exportButton=document.getElementById('history-export');let orders=[];
 const isActive=o=>!['cancelled','completed'].includes(o.status)&&o.ends_at.replace(' ','T')>=new Date().toLocaleString('sv-SE').replace(' ','T');
 function filtered(){return orders.filter(o=>!filter||filter.value==='all'||(filter.value==='active'?isActive(o):o.status===filter.value))}
 function render(){if(active){const curr=orders.filter(isActive);active.innerHTML=curr.length?curr.map(o=>AW.order(o,true)).join(''):AW.empty('Активных записей нет','Запишитесь на удобное время онлайн')}
  if(all){const shown=filtered();all.innerHTML=shown.length?shown.map(o=>AW.order(o,false)).join(''):AW.empty('Заказов не найдено','Попробуйте изменить фильтр')}
 }
 async function load(){try{orders=await AW.api('/api/orders');render()}catch(e){(active||all).textContent=e.message}}
 filter?.addEventListener('change',render);
 exportButton?.addEventListener('click',()=>{if(!orders.length)return AW.toast('Нет заказов для выгрузки','error');const rows=[['Номер','Дата','Автомобиль','Номер авто','Услуги','Статус','Сумма'],...filtered().map(o=>[o.id,o.starts_at,`${o.brand} ${o.model}`,o.plate,o.services,o.status_label,o.total_price])];const csv='\ufeff'+rows.map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(';')).join('\r\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='washpoint-orders.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)});
 active?.addEventListener('click',async e=>{const button=e.target.closest('[data-cancel]');if(!button||!confirm('Отменить эту запись?'))return;try{await AW.api('/api/orders/'+button.dataset.cancel+'/cancel',{method:'PATCH'});AW.toast('Запись отменена');await load()}catch(err){AW.toast(err.message,'error')}});
 await load();
})();
