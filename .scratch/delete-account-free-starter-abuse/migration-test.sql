-- Test harness for the email-keyed free starter allowance migration.
-- Uses the supabase image's built-in auth.users table.

-- Apply the original migration.
\i /migrations/20260729000000_add_free_starter_card_allowance.sql

-- Apply the new email-keyed migration.
\i /migrations/20260805000000_add_email_keyed_free_starter_allowance.sql

-- ============================================================
-- Scenario: same email, delete account, re-register
-- ============================================================
-- User 1 registers.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'alice@example.com');

-- User 1 claims 3 cards and finishes them as success.
select claim_free_starter_card_generation(
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  20, 'alice@example.com'
);
select finish_free_starter_card_generation(
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  true
);
select claim_free_starter_card_generation(
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111112',
  20, 'alice@example.com'
);
select finish_free_starter_card_generation(
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111112',
  true
);
select claim_free_starter_card_generation(
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111113',
  20, 'alice@example.com'
);
select finish_free_starter_card_generation(
  '00000000-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111113',
  true
);

-- User 1 allowance before delete: used=3, remaining=17.
select * from get_free_starter_card_allowance(
  '00000000-0000-0000-0000-000000000001', 20, 'alice@example.com'
) as user1_allowance_before_delete;

-- User 1 deletes account. Generation rows must survive (no cascade).
delete from auth.users where id = '00000000-0000-0000-0000-000000000001';

-- User 2 re-registers with the same email.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000002', 'alice@example.com');

-- User 2 claims. Must inherit user1's 3 used (used=4, remaining=16), NOT reset.
select claim_free_starter_card_generation(
  '00000000-0000-0000-0000-000000000002',
  '11111111-1111-1111-1111-111111111114',
  20, 'alice@example.com'
) as user2_claim_after_delete;

-- User 2 allowance: used=3 (3 success from user1), remaining=16.
select * from get_free_starter_card_allowance(
  '00000000-0000-0000-0000-000000000002', 20, 'alice@example.com'
) as user2_allowance_after_delete;

-- ============================================================
-- Scenario: email-less user falls back to user_id counting
-- ============================================================
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000003', null);

select claim_free_starter_card_generation(
  '00000000-0000-0000-0000-000000000003',
  '22222222-2222-2222-2222-222222222221',
  20, null
) as phoneless_claim_1;
select finish_free_starter_card_generation(
  '00000000-0000-0000-0000-000000000003',
  '22222222-2222-2222-2222-222222222221',
  true
);
select claim_free_starter_card_generation(
  '00000000-0000-0000-0000-000000000003',
  '22222222-2222-2222-2222-222222222222',
  20, null
) as phoneless_claim_2;
select * from get_free_starter_card_allowance(
  '00000000-0000-0000-0000-000000000003', 20, null
) as phoneless_allowance;
