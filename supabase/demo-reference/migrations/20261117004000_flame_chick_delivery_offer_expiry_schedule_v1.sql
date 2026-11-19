create extension if not exists pg_cron with schema pg_catalog;
insert into private.delivery_dispatch_settings(singleton,simultaneous_offers_enabled) values(true,false) on conflict(singleton) do nothing;
select cron.schedule('flame-chick-delivery-offer-expiry','30 seconds','select private.process_delivery_offer_expiries();');
