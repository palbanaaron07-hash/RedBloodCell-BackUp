-- Include legacy pledges that remained in pledged status when an emergency
-- request was fulfilled before pledge completion statuses were introduced.

begin;

create or replace function blood_bank.get_my_donation_history()
returns table (
  donation_id bigint,
  blood_type varchar,
  quantity int,
  donation_date date,
  status varchar,
  notes text
)
language sql
stable
security definer
set search_path = blood_bank, public
as $$
  select history.donation_id,
         history.blood_type,
         history.quantity,
         history.donation_date,
         history.status,
         history.notes
  from (
    select dr.donation_id,
           dr.blood_type,
           dr.quantity,
           dr.donation_date,
           coalesce(dr.status, 'completed')::varchar as status,
           coalesce(dr.notes, dr.reason, '')::text as notes
    from blood_bank.donation_record dr
    join blood_bank.donor d on d.donor_id = dr.donor_id
    where d.auth_user_id = auth.uid()

    union all

    select -c.confirmation_id,
           d.blood_type,
           c.units_confirmed,
           c.donation_date,
           'completed'::varchar,
           ('Replacement donation confirmed by ' || c.receiving_facility)::text
    from blood_bank.replacement_donation_confirmation c
    join blood_bank.donor d on d.donor_id = c.donor_id
    where d.auth_user_id = auth.uid()
      and c.voided_at is null

    union all

    select -(1000000000000::bigint + dp.pledge_id),
           d.blood_type,
           dp.units_pledged,
           coalesce(br.recipient_received_at, br.community_fulfilled_at, dp.updated_at)::date,
           'completed'::varchar,
           ('Emergency donation fulfilled for request #' || br.request_id)::text
    from blood_bank.donor_pledge dp
    join blood_bank.donor d on d.donor_id = dp.donor_id
    join blood_bank.blood_request br on br.request_id = dp.request_id
    where d.auth_user_id = auth.uid()
      and br.request_type = 'emergency_donor'
      and (
        dp.status in ('request_fulfilled', 'recipient_confirmed')
        or (
          dp.status = 'pledged'
          and br.recipient_received_at is not null
          and br.community_status = 'fulfilled'
        )
      )
  ) history
  order by history.donation_date desc, history.donation_id desc;
$$;

revoke all on function blood_bank.get_my_donation_history() from public;
grant execute on function blood_bank.get_my_donation_history() to authenticated;

commit;
notify pgrst, 'reload schema';
