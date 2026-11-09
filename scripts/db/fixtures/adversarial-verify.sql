-- scripts/db/fixtures/adversarial-verify.sql
-- Queries survivor records after two-phase adversarial migration replay to assert data invariants.

SELECT
  (
    SELECT count(*)::int
    FROM public.friends
    WHERE user1_id = user2_id
  ) AS self_referential_count,

  (
    SELECT count(*)::int
    FROM public.friends
    WHERE (user1_id = '00000000-0000-4000-8000-000000000001' AND user2_id = '00000000-0000-4000-8000-000000000002')
       OR (user1_id = '00000000-0000-4000-8000-000000000002' AND user2_id = '00000000-0000-4000-8000-000000000001')
  ) AS reciprocal_pair_count,

  (
    SELECT status
    FROM public.friends
    WHERE (user1_id = '00000000-0000-4000-8000-000000000001' AND user2_id = '00000000-0000-4000-8000-000000000002')
       OR (user1_id = '00000000-0000-4000-8000-000000000002' AND user2_id = '00000000-0000-4000-8000-000000000001')
    LIMIT 1
  ) AS survivor_friend_status,

  (
    SELECT count(*)::int
    FROM public.profiles
    WHERE LOWER(email) = 'conflictuser@example.com'
  ) AS lower_email_conflict_count,

  (
    SELECT email
    FROM public.profiles
    WHERE id = '00000000-0000-4000-8000-000000000004'
  ) AS duplicate_profile_email;
