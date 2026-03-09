-- Lägg till VIN-kolumn på vehicles (används av Tesla-pollaren för exakt matchning)
alter table vehicles add column if not exists vin text;
create unique index if not exists idx_vehicles_vin on vehicles(vin) where vin is not null;
