// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS'
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

function isPendingUrgentRequest(row: Record<string, unknown>) {
  const requestType = String(row?.request_type || '').trim().toLowerCase();
  const urgency = String(row?.urgency_level || '').trim().toLowerCase();
  const status = String(row?.status || '').trim().toLowerCase();
  const communityStatus = String(row?.community_status || '').trim().toLowerCase();
  const expiresAt = row?.expires_at ? new Date(String(row.expires_at)) : null;
  const nonPendingStatuses = [
    'approved', 'processing', 'in progress', 'in_progress',
    'needs clarification', 'needs_clarification', 'clarification',
    'cancelled', 'canceled', 'expired', 'rejected', 'declined',
    'fulfilled', 'complete', 'completed', 'done', 'closed'
  ];
  const isUrgent = urgency.includes('urgent') || urgency.includes('emergency') || urgency.includes('critical');
  const isExpired = communityStatus === 'expired'
    || (expiresAt && !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now());

  return requestType !== 'replacement'
    && isUrgent
    && !nonPendingStatuses.includes(status)
    && !['fulfilled', 'expired'].includes(communityStatus)
    && !isExpired;
}
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase environment configuration' }, 500);
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceRoleKey);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthStartStr = monthStart.toISOString().slice(0, 10);
  const nextMonthStartStr = nextMonthStart.toISOString().slice(0, 10);

  const [donorsRes, pendingReqRes, urgentReqRes, totalReqRes, inventoryRes, donationsRes] = await Promise.all([
    adminClient
      .schema('blood_bank')
      .from('donor')
      .select('donor_id, first_name, last_name, email'),
    adminClient
      .schema('blood_bank')
      .from('blood_request')
      .select('*', { count: 'exact', head: true })
      .in('status', ['pending', 'Pending', 'PENDING']),
    adminClient
      .schema('blood_bank')
      .from('blood_request')
      .select('request_id, request_type, urgency_level, status, community_status, expires_at')
      .or('urgency_level.ilike.%urgent%,urgency_level.ilike.%emergency%,urgency_level.ilike.%critical%'),
    adminClient
      .schema('blood_bank')
      .from('blood_request')
      .select('*', { count: 'exact', head: true }),
    adminClient
      .schema('blood_bank')
      .from('blood_inventory')
      .select('units_available'),
    adminClient
      .schema('blood_bank')
      .from('donation_record')
      .select('quantity')
      .gte('donation_date', monthStartStr)
      .lt('donation_date', nextMonthStartStr)
  ]);

  const firstError =
    donorsRes.error ||
    pendingReqRes.error ||
    totalReqRes.error ||
    inventoryRes.error ||
    donationsRes.error;

  if (firstError) {
    return jsonResponse({ error: 'Failed to load overview stats: ' + firstError.message }, 500);
  }

  const realDonors = (donorsRes.data || []).filter((row) => {
    const email = String(row.email || '').toLowerCase();
    const first = String(row.first_name || '').toLowerCase();
    const last = String(row.last_name || '').toLowerCase();
    const isTempEmail = email.startsWith('donor.test.') && email.endsWith('@example.com');
    const isTempName = first === 'temp' && last === 'donor';
    return !isTempEmail && !isTempName;
  });

  const totalUnits = (inventoryRes.data || []).reduce((sum, row) => {
    const units = Number(row.units_available);
    return sum + (Number.isFinite(units) ? units : 0);
  }, 0);

  const donationsThisMonth = (donationsRes.data || []).reduce((sum, row) => {
    const qty = Number(row.quantity);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);

  return jsonResponse(
    {
      data: {
        total_units: totalUnits,
        donors_count: realDonors.length,
        requests_count: totalReqRes.count || 0,
        pending_requests_count: pendingReqRes.count || 0,
        pending_urgent_requests: urgentReqRes.error
          ? null
          : (urgentReqRes.data || []).filter(isPendingUrgentRequest).length,
        donations_this_month: donationsThisMonth
      }
    },
    200
  );
});
