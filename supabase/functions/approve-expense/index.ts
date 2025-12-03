import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.82.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ApproveExpenseRequest {
  transactionId: string;
  action: 'approve' | 'reject';
  comment?: string;
}

interface ApproveExpenseResponse {
  success: boolean;
  transactionId: string;
  status: string;
  approvedAt?: string;
  approvedBy?: string;
  message: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { data: { user } } = await supabaseClient.auth.getUser();

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { transactionId, action, comment }: ApproveExpenseRequest = await req.json();

    console.log('Processing expense approval:', { transactionId, action, userId: user.id });

    // Verify the transaction exists and belongs to user
    const { data: transaction, error: transError } = await supabaseClient
      .from('transactions')
      .select('*')
      .eq('id', transactionId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (transError || !transaction) {
      throw new Error('Гүйлгээ олдсонгүй');
    }

    if (transaction.type !== 'expense') {
      throw new Error('Зөвхөн зарлагын гүйлгээг батлах боломжтой');
    }

    // In a real system, this would update a status column
    // For now, we'll return the approval status
    const status = action === 'approve' ? 'approved' : 'rejected';
    const approvedAt = new Date().toISOString();

    // Get user profile for approver name
    const { data: profile } = await supabaseClient
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle();

    const result: ApproveExpenseResponse = {
      success: true,
      transactionId,
      status,
      approvedAt,
      approvedBy: profile?.full_name || user.email || user.id,
      message: action === 'approve' 
        ? `Зарлага амжилттай батлагдлаа${comment ? `. Тайлбар: ${comment}` : ''}`
        : `Зарлага татгалзагдлаа${comment ? `. Шалтгаан: ${comment}` : ''}`,
    };

    console.log('Expense approval result:', result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in approve-expense function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
