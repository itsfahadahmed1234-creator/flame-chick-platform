-- Flame Chick demo seed. These are the user's supplied catalog and settings only.
with r as (
 insert into public.restaurants(name,slug,currency_code,timezone,phone,whatsapp_phone,address,is_active)
 values ('Flame Chick','flame-chick','PKR','Asia/Karachi','+923358044164','+923358044164','Main Kamra Road, Opp. Zellbury, Attock',true)
 returning id
)
insert into public.branches(restaurant_id,branch_code,name,phone,address,is_active)
select id,'MAIN','Main Branch','+923358044164','Main Kamra Road, Opp. Zellbury, Attock',true from r;
insert into public.categories(restaurant_id,legacy_id,name_en,sort_order,is_active)
select r.id,v.legacy_id,v.name_en,v.sort_order,true from public.restaurants r
cross join (values ('starters','STARTERS',1),('injected-broast','INJECTED BROAST',2),('wraps','WRAPS',3),('burgers','BURGERS',4),('drinks','DRINKS',5)) v(legacy_id,name_en,sort_order)
where r.slug='flame-chick';
with p(legacy_id,category_key,name_en,description_en,price,sort_order) as (values
('classic-nuggets-12','starters','Classic Nuggets 12 pcs',null,599,1),
('injected-nuggets-12','starters','Injected Nuggets 12 pcs',null,649,2),
('fire-wings-6','starters','Fire Wings 6 pcs',null,499,3),
('injected-wings-6','starters','Injected Wings 6 pcs',null,599,4),
('quarter-broast','injected-broast','Quarter Broast','2pcs chic, dips, bun and fries',749,1),
('half-broast','injected-broast','Half Broast','4pcs chic, dips, 2 buns and fries',1399,2),
('full-broast','injected-broast','Full Broast','8pcs chic, dips, 4 buns and fries',2100,3),
('tender-fillet-wrap','wraps','Tender Fillet Wrap',null,500,1),
('flame-chick-special','wraps','Flame Chick Special',null,550,2),
('bbq-wrap','wraps','B-B-Q Wrap',null,600,3),
('the-injector','burgers','The Injector','Juicy injected chicken, crispy coating, signature sauce, lettuce & mayo.',549,1),
('og-crunch','burgers','OG Crunch','Crispy chicken, fresh lettuce, pickles & signature sauce.',499,2),
('classic-chick','burgers','Classic Chick','Crispy chicken fillet, cheese, fresh veggies & creamy sauce.',599,3),
('nashville-fire','burgers','Nashville Fire','Spicy Nashville-style chicken, lettuce, pickles & fiery sauce.',649,4),
('fresh-mint','drinks','Fresh Mint',null,249,1),('strawberry-blaze','drinks','Strawberry Blaze',null,299,2),
('peach-kick','drinks','Peach Kick',null,299,3),('berry-burst','drinks','Berry Burst',null,349,4),
('blue-flame','drinks','Blue Flame',null,349,5),('sunset-splash','drinks','Sunset Splash',null,449,6),
('water','drinks','Water',null,99,7),('cold-drink','drinks','Cold Drink',null,120,8),
('water-bottle-1-5ltr','drinks','1.5 Ltr Water Bottle',null,150,9),('cold-drinks-1-5ltr','drinks','Cold Drinks 1.5 Ltr',null,250,10)
)
insert into public.products(restaurant_id,category_id,legacy_id,name_en,description_en,sort_order,is_active,is_available,featured,metadata)
select r.id,c.id,p.legacy_id,p.name_en,p.description_en,p.sort_order,true,true,false,'{}'::jsonb from p
join public.categories c on c.legacy_id=p.category_key join public.restaurants r on r.id=c.restaurant_id and r.slug='flame-chick';
insert into public.product_variants(product_id,legacy_id,size_key,size_label,price,sort_order,is_active,is_available)
select p.id,p.legacy_id||'-regular','regular','Regular',v.price,0,true,true from public.products p
join (values ('classic-nuggets-12',599),('injected-nuggets-12',649),('fire-wings-6',499),('injected-wings-6',599),('quarter-broast',749),('half-broast',1399),('full-broast',2100),('tender-fillet-wrap',500),('flame-chick-special',550),('bbq-wrap',600),('the-injector',549),('og-crunch',499),('classic-chick',599),('nashville-fire',649),('fresh-mint',249),('strawberry-blaze',299),('peach-kick',299),('berry-burst',349),('blue-flame',349),('sunset-splash',449),('water',99),('cold-drink',120),('water-bottle-1-5ltr',150),('cold-drinks-1-5ltr',250)) v(legacy_id,price) on v.legacy_id=p.legacy_id
join public.restaurants r on r.id=p.restaurant_id and r.slug='flame-chick';
insert into public.deals(restaurant_id,category_id,legacy_id,title,description_en,bundle_price,featured,sort_order,is_active,is_available,metadata)
select r.id,c.id,'platter-new','Platter (NEW)','6 Classic Nuggets, 6 Injected Nuggets, 6 Fire Wings, 6 Injected Wings, Fries & Dips',1499,true,0,true,true,'{"demo_seed":true}'::jsonb
from public.restaurants r join public.categories c on c.restaurant_id=r.id and c.legacy_id='starters' where r.slug='flame-chick';
insert into public.deal_components(deal_id,legacy_id,component_type,ref_type,product_id,quantity,sort_order,price_delta,display_name,metadata)
select d.id,x.legacy_id,'ITEM','FIXED_PRODUCT',p.id,x.quantity,x.sort_order,0,x.display_name,'{}'::jsonb
from public.deals d join public.restaurants r on r.id=d.restaurant_id and r.slug='flame-chick'
cross join (values ('platter-classic-nuggets','classic-nuggets-12',6,1,'Classic Nuggets'),('platter-injected-nuggets','injected-nuggets-12',6,2,'Injected Nuggets'),('platter-fire-wings','fire-wings-6',6,3,'Fire Wings'),('platter-injected-wings','injected-wings-6',6,4,'Injected Wings')) x(legacy_id,product_legacy_id,quantity,sort_order,display_name)
join public.products p on p.restaurant_id=r.id and p.legacy_id=x.product_legacy_id where d.legacy_id='platter-new';
insert into public.restaurant_settings(restaurant_id,branch_id,setting_key,value_json,is_public,description)
select r.id,b.id,s.setting_key,s.value_json,s.is_public,s.description from public.restaurants r join public.branches b on b.restaurant_id=r.id and b.branch_code='MAIN'
cross join (values
('restaurant_name','"Flame Chick"'::jsonb,true,'Public restaurant name'),
('wa_phone_display','"+92 335 8044164"'::jsonb,true,'Public WhatsApp display'),
('wa_phone','"923358044164"'::jsonb,true,'WhatsApp contact number'),
('DefaultDeliveryFee','0'::jsonb,true,'Demo delivery fee: zero'),
('address','"Main Kamra Road, Opp. Zellbury, Attock"'::jsonb,true,'Restaurant address'),
('contact_phone','"+92 335 8044164"'::jsonb,true,'Public phone'),
('contact_address','"Main Kamra Road, Opp. Zellbury, Attock"'::jsonb,true,'Contact address'),
('opening_hours','"12 PM to 1 AM"'::jsonb,true,'Initial opening hours; editable in Admin'),
('delivery_hours','"12 PM to 1 AM"'::jsonb,true,'Initial delivery hours; editable in Admin'),
('website_content','{"tagline":"Crispy. Juicy. Addictive.","demo_checkout_notice":"Demo behaviour: manually entered delivery address and Rs 0 delivery fee. Delivery areas and charges will be configured later.","payment_methods":["cod"],"demo_mode":true}'::jsonb,true,'Flame Chick demo website settings'),
('meta_description','"Flame Chick — Crispy. Juicy. Addictive."'::jsonb,true,'Website metadata')
) s(setting_key,value_json,is_public,description) where r.slug='flame-chick';
