require('dotenv').config();
const fs=require('fs'); const path=require('path'); const {Pool}=require('pg');
(async()=>{const pool=new Pool({connectionString:process.env.DATABASE_URL});try{await pool.query(fs.readFileSync(path.join(__dirname,'schema.sql'),'utf8'));console.log('База данных и тестовые услуги готовы.');}finally{await pool.end();}})().catch(e=>{console.error(e.message);process.exitCode=1;});
