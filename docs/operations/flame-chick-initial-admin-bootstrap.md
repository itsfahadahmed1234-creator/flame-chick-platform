# Flame Chick — Initial Admin bootstrap (manual, postgres-only)

No browser/API bootstrap action exists.

## Preconditions
1. Correct project: adkrxfnawdiljhjaavnj, Mumbai, Free plan.
2. Flame Chick restaurant and at least one active branch are provisioned.
3. Intended Admin Auth account is created and email-confirmed.
4. Obtain the Auth UUID through the trusted Auth console; never store passwords or invitation tokens in SQL/source.
5. Verify there are no user_roles rows for this restaurant.

## Trusted operator procedure
Run only as postgres in a trusted SQL session. Bind the confirmed Auth UUID and display name.

```sql
INSERT INTO public.user_profiles(user_id,display_name,is_active)
VALUES (:admin_user_id,:display_name,true);

INSERT INTO public.user_roles(
 restaurant_id,user_id,role_key,branch_id,is_active,assigned_by,reason,request_id,assignment_method
)
SELECT r.id,:admin_user_id,'admin',NULL,true,:admin_user_id,
 'Initial trusted Flame Chick Admin bootstrap',gen_random_uuid(),'initial_bootstrap'
FROM public.restaurants r
WHERE r.slug='flame-chick' AND r.is_active
AND NOT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.restaurant_id=r.id);
```

Verify the one restaurant-wide Admin role and matching audit event. Then sign in and use normal invitation flow to add a separate Owner. Never expose initial_bootstrap to application roles.
