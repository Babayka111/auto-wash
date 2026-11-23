require('dotenv').config();
const express = require('express');
const {Pool} = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const {rateLimit} = require('express-rate-limit');
const path = require('path');

const app=express(), db=new Pool({connectionString:process.env.DATABASE_URL});
const PORT=Number(process.env.PORT)||3000, DAY_START=9*60, DAY_END=20*60;
app.disable('x-powered-by');
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'",'https://fonts.googleapis.com'],imgSrc:["'self'","data:"],fontSrc:["'self'",'https://fonts.gstatic.com'],connectSrc:["'self'"],objectSrc:["'none'"],upgradeInsecureRequests:process.env.NODE_ENV==='production'?[]:null}}}));
app.use(express.json({limit:'50kb'})); app.use(cookieParser());
app.use('/api/auth',rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Слишком много попыток. Попробуйте позже.'}}));
const validEmail=v=>typeof v==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)&&v.length<=254;
const clean=(v,max=100)=>typeof v==='string'?v.trim().slice(0,max):'';
const fail=(res,status,error)=>res.status(status).json({error});
const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
const wrap=fn=>(req,res,next)=>Promise.resolve(fn(req,res,next)).catch(next);
const isDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(new Date(`${v}T12:00:00Z`).valueOf())&&new Date(`${v}T12:00:00Z`).toISOString().slice(0,10)===v;
const minTime=t=>/^\d{2}:\d{2}$/.test(t||'')?Number(t.slice(0,2))*60+Number(t.slice(3,5)):NaN;
const fmtMin=n=>`${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;
const nowMinutes=()=>{const d=new Date();return d.getHours()*60+d.getMinutes()};
const dateToday=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const cookieOpts={httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',path:'/'};
// Origin check for state-changing requests protects session cookie from cross-origin requests.
app.use('/api',(req,res,next)=>{if(['POST','PUT','PATCH','DELETE'].includes(req.method)){const origin=req.get('origin');const expected=process.env.APP_ORIGIN;if(origin&&expected&&origin!==expected)return fail(res,403,'Недопустимый источник запроса');if(!origin&&req.get('sec-fetch-site')==='cross-site')return fail(res,403,'Недопустимый источник запроса');}next();});
app.use(wrap(async(req,res,next)=>{
  req.user=null;const token=req.cookies.aw_session;
  if(token&&/^[a-f0-9]{64}$/.test(token)){
    const r=await db.query(`SELECT u.id,u.full_name,u.email,u.phone,r.name AS role FROM sessions s JOIN users u ON u.id=s.user_id JOIN roles r ON r.id=u.role_id WHERE s.token_hash=$1 AND s.expires_at>now()`,[sha(token)]);
    if(r.rows[0])req.user=r.rows[0];
  }next();
}));
const auth=(req,res,next)=>req.user?next():fail(res,401,'Необходимо войти в аккаунт');
const admin=(req,res,next)=>req.user?.role==='admin'?next():fail(res,403,'Недостаточно прав');
const profile=u=>({id:u.id,name:u.full_name,email:u.email,phone:u.phone,role:u.role});

app.post('/api/auth/register',wrap(async(req,res)=>{
 const name=clean(req.body.name),email=clean(req.body.email,254).toLowerCase(),phone=clean(req.body.phone,30),password=req.body.password;
 if(name.length<2||!validEmail(email)||phone.length<6||typeof password!=='string'||password.length<8||password.length>72)return fail(res,400,'Проверьте имя, почту, телефон и пароль (8–72 символа)');
 const hash=await bcrypt.hash(password,12);
 try{await db.query(`INSERT INTO users(role_id,full_name,email,phone,password_hash) VALUES ((SELECT id FROM roles WHERE name='client'),$1,$2,$3,$4)`,[name,email,phone,hash]);}
 catch(e){if(e.code==='23505')return fail(res,409,'Эта почта уже зарегистрирована');throw e;}
 res.status(201).json({message:'Аккаунт создан. Теперь войдите.'});
}));
app.post('/api/auth/login',wrap(async(req,res)=>{
 const email=clean(req.body.email,254).toLowerCase(),pass=req.body.password;
 if(!validEmail(email)||typeof pass!=='string')return fail(res,400,'Введите почту и пароль');
 const r=await db.query(`SELECT u.*,roles.name AS role FROM users u JOIN roles ON roles.id=u.role_id WHERE u.email=$1`,[email]);
 if(!r.rows[0]||!await bcrypt.compare(pass,r.rows[0].password_hash))return fail(res,401,'Неверная почта или пароль');
 const token=crypto.randomBytes(32).toString('hex');
 await db.query(`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '7 days')`,[r.rows[0].id,sha(token)]);
 res.cookie('aw_session',token,{...cookieOpts,maxAge:7*86400000}).json({user:profile(r.rows[0])});
}));
app.post('/api/auth/logout',wrap(async(req,res)=>{if(req.cookies.aw_session)await db.query('DELETE FROM sessions WHERE token_hash=$1',[sha(req.cookies.aw_session)]);res.clearCookie('aw_session',cookieOpts).json({ok:true});}));
app.get('/api/me',(req,res)=>res.json({user:req.user?profile(req.user):null}));
app.put('/api/me',auth,wrap(async(req,res)=>{
 const name=clean(req.body.name),phone=clean(req.body.phone,30);if(name.length<2||phone.length<6)return fail(res,400,'Введите имя и телефон');
 const r=await db.query('UPDATE users SET full_name=$1,phone=$2 WHERE id=$3 RETURNING *',[name,phone,req.user.id]);res.json({user:profile({...r.rows[0],role:req.user.role})});
}));
app.get('/api/services',wrap(async(req,res)=>{const r=await db.query('SELECT id,name,description,price,duration_min FROM services WHERE active=true ORDER BY id');res.json(r.rows);}));
app.get('/api/cars',auth,wrap(async(req,res)=>{const r=await db.query('SELECT id,brand,model,plate FROM cars WHERE user_id=$1 ORDER BY id DESC',[req.user.id]);res.json(r.rows);}));
app.post('/api/cars',auth,wrap(async(req,res)=>{
 const brand=clean(req.body.brand,70),model=clean(req.body.model,70),plate=clean(req.body.plate,25).toUpperCase();if(!brand||!model||plate.length<3)return fail(res,400,'Заполните марку, модель и госномер');
 const r=await db.query('INSERT INTO cars(user_id,brand,model,plate) VALUES($1,$2,$3,$4) RETURNING id,brand,model,plate',[req.user.id,brand,model,plate]);res.status(201).json(r.rows[0]);
}));
app.put('/api/cars/:id',auth,wrap(async(req,res)=>{
 const brand=clean(req.body.brand,70),model=clean(req.body.model,70),plate=clean(req.body.plate,25).toUpperCase();if(!brand||!model||plate.length<3)return fail(res,400,'Заполните все поля');
 const r=await db.query('UPDATE cars SET brand=$1,model=$2,plate=$3 WHERE id=$4 AND user_id=$5 RETURNING id,brand,model,plate',[brand,model,plate,req.params.id,req.user.id]);if(!r.rowCount)return fail(res,404,'Автомобиль не найден');res.json(r.rows[0]);
}));
app.delete('/api/cars/:id',auth,wrap(async(req,res)=>{
 const has=await db.query('SELECT 1 FROM orders o JOIN cars c ON c.id=o.car_id WHERE c.id=$1 AND c.user_id=$2 LIMIT 1',[req.params.id,req.user.id]);if(has.rowCount)return fail(res,409,'Автомобиль указан в истории заказов и не может быть удален');
 const r=await db.query('DELETE FROM cars WHERE id=$1 AND user_id=$2',[req.params.id,req.user.id]);if(!r.rowCount)return fail(res,404,'Автомобиль не найден');res.json({ok:true});
}));
async function selectedServices(ids,client=db){
 if(!Array.isArray(ids)||ids.length<1||ids.length>15||ids.some(x=>!Number.isSafeInteger(Number(x))||Number(x)<1)||new Set(ids.map(Number)).size!==ids.length)return null;
 const r=await client.query('SELECT id,name,price,duration_min FROM services WHERE id=ANY($1::bigint[]) AND active=true',[ids.map(Number)]);
 return r.rowCount===ids.length?r.rows:null;
}
const rangeMins=(date,startStr,endStr)=>[minTime(startStr.slice(11,16)),minTime(endStr.slice(11,16))];
async function available(date,duration,client=db){
 const [bays,busy,blocks]=await Promise.all([
  client.query('SELECT id,name FROM wash_bays WHERE active=true ORDER BY id'),
  client.query(`SELECT bay_id,to_char(starts_at,'YYYY-MM-DD HH24:MI') st,to_char(ends_at,'YYYY-MM-DD HH24:MI') en FROM orders WHERE starts_at<$2::timestamp AND ends_at>$1::timestamp AND status_id!=(SELECT id FROM order_statuses WHERE code='cancelled')`,[`${date} 00:00`,`${date} 23:59`]),
  client.query(`SELECT bay_id,to_char(starts_at,'YYYY-MM-DD HH24:MI') st,to_char(ends_at,'YYYY-MM-DD HH24:MI') en FROM bay_blocks WHERE starts_at<$2::timestamp AND ends_at>$1::timestamp`,[`${date} 00:00`,`${date} 23:59`])]);
 const taken=[...busy.rows,...blocks.rows];const slots=[];
 for(let m=DAY_START;m+duration<=DAY_END;m+=30){
  if(date===dateToday()&&m<=nowMinutes()+30)continue;
  const bay=bays.rows.find(b=>!taken.some(x=>String(x.bay_id)===String(b.id)&&rangeMins(date,x.st,x.en)[0]<m+duration&&rangeMins(date,x.st,x.en)[1]>m));
  if(bay)slots.push({time:fmtMin(m),bay_id:bay.id});
 }
 return slots;
}
app.get('/api/slots',auth,wrap(async(req,res)=>{
 const date=req.query.date,ids=(req.query.services||'').split(',').filter(Boolean);
 if(!isDate(date)||date<dateToday())return fail(res,400,'Выберите актуальную дату');
 const services=await selectedServices(ids);if(!services)return fail(res,400,'Выберите доступные услуги');
 const duration=services.reduce((n,s)=>n+s.duration_min,0);res.json({duration,slots:await available(date,duration)});
}));
app.post('/api/orders',auth,wrap(async(req,res)=>{
 const {carId,date,time,serviceIds}=req.body;
 if(!isDate(date)||date<dateToday()||!/^\d{2}:\d{2}$/.test(time||'')||minTime(time)%30!==0)return fail(res,400,'Выберите корректную дату и время');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[date]);
  const car=await client.query('SELECT id FROM cars WHERE id=$1 AND user_id=$2',[carId,req.user.id]);if(!car.rowCount){await client.query('ROLLBACK');return fail(res,400,'Автомобиль не найден');}
  const services=await selectedServices(serviceIds,client);if(!services){await client.query('ROLLBACK');return fail(res,400,'Выберите доступные услуги');}
  const duration=services.reduce((n,s)=>n+s.duration_min,0),price=services.reduce((n,s)=>n+Number(s.price),0);
  const slots=await available(date,duration,client),slot=slots.find(x=>x.time===time);
  if(!slot){await client.query('ROLLBACK');return fail(res,409,'Это время уже занято. Выберите другое.');}
  const r=await client.query(`INSERT INTO orders(user_id,car_id,bay_id,status_id,starts_at,ends_at,total_price) VALUES ($1,$2,$3,(SELECT id FROM order_statuses WHERE code='pending'),$4::timestamp,$4::timestamp+($5::int*interval '1 minute'),$6) RETURNING id`,[req.user.id,carId,slot.bay_id,`${date} ${time}:00`,duration,price]);
  for(const s of services)await client.query('INSERT INTO order_services(order_id,service_id,price_at_booking,duration_at_booking) VALUES($1,$2,$3,$4)',[r.rows[0].id,s.id,s.price,s.duration_min]);
  await client.query('COMMIT');res.status(201).json({id:r.rows[0].id,message:'Запись успешно создана'});
 }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}));
const orderSelect=`SELECT o.id,u.full_name AS client_name,u.phone AS client_phone,c.brand,c.model,c.plate,b.name AS bay,st.code AS status,st.label AS status_label,to_char(o.starts_at,'YYYY-MM-DD HH24:MI') starts_at,to_char(o.ends_at,'YYYY-MM-DD HH24:MI') ends_at,o.total_price,COALESCE(string_agg(s.name,', ' ORDER BY s.name),'') AS services,COALESCE(array_agg(s.id ORDER BY s.id) FILTER (WHERE s.id IS NOT NULL),ARRAY[]::bigint[]) AS service_ids FROM orders o JOIN users u ON u.id=o.user_id JOIN cars c ON c.id=o.car_id JOIN wash_bays b ON b.id=o.bay_id JOIN order_statuses st ON st.id=o.status_id LEFT JOIN order_services os ON os.order_id=o.id LEFT JOIN services s ON s.id=os.service_id`;
const orderGroup=` GROUP BY o.id,u.full_name,u.phone,c.brand,c.model,c.plate,b.name,st.code,st.label`;
app.get('/api/orders',auth,wrap(async(req,res)=>{
 const r=await db.query(orderSelect+' WHERE o.user_id=$1'+orderGroup+' ORDER BY o.starts_at DESC',[req.user.id]);res.json(r.rows);
}));
app.patch('/api/orders/:id/cancel',auth,wrap(async(req,res)=>{
 const r=await db.query(`UPDATE orders SET status_id=(SELECT id FROM order_statuses WHERE code='cancelled') WHERE id=$1 AND user_id=$2 AND starts_at>now() AND status_id IN (SELECT id FROM order_statuses WHERE code IN ('pending','confirmed')) RETURNING id`,[req.params.id,req.user.id]);
 if(!r.rowCount)return fail(res,409,'Эту запись нельзя отменить');res.json({ok:true});
}));
// Administrative API. Every route checks the role on the server.
app.use('/api/admin',auth,admin);
app.get('/api/admin/summary',wrap(async(req,res)=>{
 const [users,orders,active,services]=await Promise.all([db.query('SELECT COUNT(*)::int n FROM users'),db.query('SELECT COUNT(*)::int n FROM orders'),db.query("SELECT COUNT(*)::int n FROM orders WHERE status_id IN (SELECT id FROM order_statuses WHERE code IN ('pending','confirmed','in_progress'))"),db.query('SELECT COUNT(*)::int n FROM services WHERE active=true')]);
 res.json({users:users.rows[0].n,orders:orders.rows[0].n,active:active.rows[0].n,services:services.rows[0].n});
}));
app.get('/api/admin/orders',wrap(async(req,res)=>{const r=await db.query(orderSelect+orderGroup+' ORDER BY o.starts_at DESC LIMIT 300');res.json(r.rows);}));
app.patch('/api/admin/orders/:id/status',wrap(async(req,res)=>{
 const status=req.body.status;if(!['pending','confirmed','in_progress','completed','cancelled'].includes(status))return fail(res,400,'Некорректный статус');
 const r=await db.query(`UPDATE orders SET status_id=(SELECT id FROM order_statuses WHERE code=$1) WHERE id=$2 RETURNING id`,[status,req.params.id]);if(!r.rowCount)return fail(res,404,'Заказ не найден');res.json({ok:true});
}));
app.get('/api/admin/services',wrap(async(req,res)=>res.json((await db.query('SELECT * FROM services ORDER BY id')).rows)));
app.post('/api/admin/services',wrap(async(req,res)=>{
 const name=clean(req.body.name),description=clean(req.body.description,1000),price=Number(req.body.price),duration=Number(req.body.duration_min);
 if(!name||!Number.isFinite(price)||price<0||price>999999||!Number.isInteger(duration)||duration<15||duration>480)return fail(res,400,'Проверьте название, цену и продолжительность (15–480 минут)');
 const r=await db.query('INSERT INTO services(name,description,price,duration_min) VALUES($1,$2,$3,$4) RETURNING *',[name,description,price,duration]);res.status(201).json(r.rows[0]);
}));
app.put('/api/admin/services/:id',wrap(async(req,res)=>{
 const name=clean(req.body.name),description=clean(req.body.description,1000),price=Number(req.body.price),duration=Number(req.body.duration_min),active=req.body.active===true;
 if(!name||!Number.isFinite(price)||price<0||price>999999||!Number.isInteger(duration)||duration<15||duration>480)return fail(res,400,'Проверьте название, цену и продолжительность');
 const r=await db.query('UPDATE services SET name=$1,description=$2,price=$3,duration_min=$4,active=$5 WHERE id=$6 RETURNING *',[name,description,price,duration,active,req.params.id]);if(!r.rowCount)return fail(res,404,'Услуга не найдена');res.json(r.rows[0]);
}));
app.get('/api/admin/users',wrap(async(req,res)=>res.json((await db.query(`SELECT u.id,u.full_name,u.email,u.phone,r.name role,u.created_at FROM users u JOIN roles r ON r.id=u.role_id ORDER BY u.id DESC LIMIT 300`)).rows)));
app.get('/api/admin/cars',wrap(async(req,res)=>res.json((await db.query('SELECT c.id,c.brand,c.model,c.plate,u.full_name AS owner,u.id AS owner_id FROM cars c JOIN users u ON u.id=c.user_id ORDER BY c.id DESC LIMIT 300')).rows)));
app.put('/api/admin/cars/:id',wrap(async(req,res)=>{const brand=clean(req.body.brand,70),model=clean(req.body.model,70),plate=clean(req.body.plate,25).toUpperCase();if(!brand||!model||plate.length<3)return fail(res,400,'Заполните поля автомобиля');const r=await db.query('UPDATE cars SET brand=$1,model=$2,plate=$3 WHERE id=$4 RETURNING id',[brand,model,plate,req.params.id]);if(!r.rowCount)return fail(res,404,'Автомобиль не найден');res.json({ok:true});}));
app.put('/api/admin/users/:id',wrap(async(req,res)=>{const name=clean(req.body.name),phone=clean(req.body.phone,30);if(name.length<2||phone.length<6)return fail(res,400,'Введите имя и телефон');const r=await db.query('UPDATE users SET full_name=$1,phone=$2 WHERE id=$3 RETURNING id',[name,phone,req.params.id]);if(!r.rowCount)return fail(res,404,'Пользователь не найден');res.json({ok:true});}));
app.get('/api/admin/bays',wrap(async(req,res)=>res.json((await db.query('SELECT * FROM wash_bays ORDER BY id')).rows)));
app.post('/api/admin/bays',wrap(async(req,res)=>{const name=clean(req.body.name,80);if(!name)return fail(res,400,'Введите название поста');try{res.status(201).json((await db.query('INSERT INTO wash_bays(name) VALUES($1) RETURNING *',[name])).rows[0]);}catch(e){if(e.code==='23505')return fail(res,409,'Пост уже существует');throw e;}}));
app.patch('/api/admin/bays/:id',wrap(async(req,res)=>{if(typeof req.body.active!=='boolean')return fail(res,400,'Некорректное значение');const r=await db.query('UPDATE wash_bays SET active=$1 WHERE id=$2 RETURNING *',[req.body.active,req.params.id]);if(!r.rowCount)return fail(res,404,'Пост не найден');res.json(r.rows[0]);}));
app.get('/api/admin/blocks',wrap(async(req,res)=>res.json((await db.query(`SELECT b.id,b.bay_id,w.name AS bay_name,to_char(b.starts_at,'YYYY-MM-DD"T"HH24:MI') starts_at,to_char(b.ends_at,'YYYY-MM-DD"T"HH24:MI') ends_at,b.reason FROM bay_blocks b JOIN wash_bays w ON w.id=b.bay_id ORDER BY b.starts_at DESC LIMIT 200`)).rows)));
app.post('/api/admin/blocks',wrap(async(req,res)=>{
 const {bayId,startsAt,endsAt}=req.body,reason=clean(req.body.reason,140)||'Недоступен';
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(startsAt||'')||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(endsAt||'')||startsAt>=endsAt)return fail(res,400,'Проверьте дату и время');
 const r=await db.query('INSERT INTO bay_blocks(bay_id,starts_at,ends_at,reason) VALUES($1,$2::timestamp,$3::timestamp,$4) RETURNING id',[bayId,startsAt,endsAt,reason]);res.status(201).json(r.rows[0]);
}));
app.delete('/api/admin/blocks/:id',wrap(async(req,res)=>{const r=await db.query('DELETE FROM bay_blocks WHERE id=$1',[req.params.id]);if(!r.rowCount)return fail(res,404,'Блокировка не найдена');res.json({ok:true});}));

app.use('/api',(req,res)=>fail(res,404,'Адрес API не найден'));
app.use(express.static(path.join(__dirname,'../public'),{extensions:['html'],index:'index.html'}));
app.use((req,res)=>res.status(404).sendFile(path.join(__dirname,'../public/404.html')));
app.use((err,req,res,next)=>{console.error('[ERROR]',err);if(res.headersSent)return next(err);if(req.path.startsWith('/api'))return fail(res,500,'Внутренняя ошибка сервера');res.status(500).sendFile(path.join(__dirname,'../public/500.html'));});
if(require.main===module){db.query('SELECT 1').then(()=>app.listen(PORT,()=>console.log(`Автомойка: http://localhost:${PORT}`))).catch(e=>{console.error('Не удалось подключиться к PostgreSQL:',e.message);process.exit(1);});}
module.exports={app,db};
