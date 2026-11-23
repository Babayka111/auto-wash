(async()=>{
 if(!await AW.requireLogin())return;
 const active=document.getElementById('active-bookings'),all=document.getElementById('all-orders');
 async function load(){try{const orders=await AW.api('/api/orders');if(active){const curr=orders.filter(o=>!['cancelled','completed'].includes(o.status)&&o.ends_at.replace(' ','T')>=new Date().toLocaleString('sv-SE').replace(' ','T'));active.innerHTML=curr.length?curr.map(o=>AW.order(o,true)).join(''):AW.empty('Активных записей нет','Запишитесь на удобное время онлайн');}if(all)all.innerHTML=orders.length?orders.map(o=>AW.order(o,false)).join(''):AW.empty('Заказов пока нет','Ваши посещения автомойки появятся здесь');}catch(e){(active||all).textContent=e.message;}}
 active?.addEventListener('click',async e=>{const button=e.target.closest('[data-cancel]');if(!button||!confirm('Отменить эту запись?'))return;try{await AW.api('/api/orders/'+button.dataset.cancel+'/cancel',{method:'PATCH'});AW.toast('Запись отменена');await load();}catch(err){AW.toast(err.message,'error')}});
 await load();
})();
