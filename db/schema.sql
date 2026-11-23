BEGIN;
CREATE TABLE IF NOT EXISTS roles (
  id SMALLSERIAL PRIMARY KEY,
  name VARCHAR(30) NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  role_id SMALLINT NOT NULL REFERENCES roles(id),
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone VARCHAR(30) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cars (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  brand VARCHAR(70) NOT NULL,
  model VARCHAR(70) NOT NULL,
  plate VARCHAR(25) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS services (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL CHECK(price >= 0),
  duration_min INTEGER NOT NULL CHECK(duration_min BETWEEN 15 AND 480),
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS wash_bays (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(80) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS order_statuses (
  id SMALLSERIAL PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  label VARCHAR(50) NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  car_id BIGINT NOT NULL REFERENCES cars(id),
  bay_id BIGINT NOT NULL REFERENCES wash_bays(id),
  status_id SMALLINT NOT NULL REFERENCES order_statuses(id),
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  total_price NUMERIC(10,2) NOT NULL CHECK(total_price >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK(ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS orders_user_time ON orders(user_id,starts_at DESC);
CREATE INDEX IF NOT EXISTS orders_bay_time ON orders(bay_id,starts_at,ends_at);
CREATE TABLE IF NOT EXISTS order_services (
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  service_id BIGINT NOT NULL REFERENCES services(id),
  price_at_booking NUMERIC(10,2) NOT NULL CHECK(price_at_booking >= 0),
  duration_at_booking INTEGER NOT NULL CHECK(duration_at_booking > 0),
  PRIMARY KEY(order_id,service_id)
);
CREATE TABLE IF NOT EXISTS sessions (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS bay_blocks (
  id BIGSERIAL PRIMARY KEY,
  bay_id BIGINT NOT NULL REFERENCES wash_bays(id) ON DELETE CASCADE,
  starts_at TIMESTAMP NOT NULL,
  ends_at TIMESTAMP NOT NULL,
  reason VARCHAR(140) NOT NULL DEFAULT 'Недоступен',
  CHECK(ends_at > starts_at)
);
INSERT INTO roles(name) VALUES ('client'),('admin') ON CONFLICT(name) DO NOTHING;
INSERT INTO order_statuses(code,label) VALUES
 ('pending','Ожидает подтверждения'),('confirmed','Подтвержден'),
 ('in_progress','В работе'),('completed','Завершен'),('cancelled','Отменен')
 ON CONFLICT(code) DO NOTHING;
INSERT INTO services(name,description,price,duration_min) SELECT 'Экспресс-мойка','Быстрая мойка кузова с бережной сушкой',550,30
 WHERE NOT EXISTS (SELECT 1 FROM services);
INSERT INTO services(name,description,price,duration_min) SELECT 'Комплексная мойка','Кузов, коврики, пороги и базовая уборка салона',1200,60
 WHERE (SELECT COUNT(*) FROM services)=1;
INSERT INTO services(name,description,price,duration_min) SELECT 'Химчистка салона','Глубокая очистка сидений и элементов салона',3500,120
 WHERE (SELECT COUNT(*) FROM services)=2;
INSERT INTO services(name,description,price,duration_min) SELECT 'Полировка кузова','Восстановление блеска лакокрасочного покрытия',2700,90
 WHERE (SELECT COUNT(*) FROM services)=3;
INSERT INTO services(name,description,price,duration_min) SELECT 'Уборка салона','Пылесос, очистка панелей и стекол',850,45
 WHERE (SELECT COUNT(*) FROM services)=4;
INSERT INTO services(name,description,price,duration_min) SELECT 'Защитный воск','Защитное покрытие для блеска и водоотталкивания',650,30
 WHERE (SELECT COUNT(*) FROM services)=5;
INSERT INTO wash_bays(name) VALUES ('Пост №1'),('Пост №2') ON CONFLICT(name) DO NOTHING;
COMMIT;
