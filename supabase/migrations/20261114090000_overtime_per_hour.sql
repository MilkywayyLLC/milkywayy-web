-- Content shoot overtime is per extra hour, not per 30 minutes (owner, 28 Oct 2026). Additive: only
-- the unit and description of the existing rate change, and only while they still say 30 minutes.
-- The prices (set in Admin → Prices & packages) are not touched.
update public.rate_card
   set unit = 'hour',
       includes = 'Per extra hour beyond the booked length',
       updated_at = now()
 where key = 'content_overtime'
   and unit = '30 min';
