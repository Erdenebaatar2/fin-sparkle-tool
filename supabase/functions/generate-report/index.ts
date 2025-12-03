import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.82.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ReportRequest {
  reportType: 'monthly' | 'quarterly' | 'yearly' | 'custom';
  startDate: string;
  endDate: string;
  format: 'json' | 'csv';
}

interface Transaction {
  id: string;
  date: string;
  type: string;
  amount: number;
  description: string;
  category_id: string;
  document_no: string;
}

interface ReportResponse {
  reportType: string;
  period: { start: string; end: string };
  summary: {
    totalIncome: number;
    totalExpense: number;
    netProfit: number;
    transactionCount: number;
  };
  incomeByCategory: Record<string, number>;
  expenseByCategory: Record<string, number>;
  transactions: Transaction[];
  csvData?: string;
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

    const { reportType, startDate, endDate, format = 'json' }: ReportRequest = await req.json();

    console.log('Generating report:', { reportType, startDate, endDate, format, userId: user.id });

    // Fetch transactions for the period
    const { data: transactions, error: transError } = await supabaseClient
      .from('transactions')
      .select('*, categories(name)')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: false });

    if (transError) {
      console.error('Error fetching transactions:', transError);
      throw transError;
    }

    // Calculate summary
    let totalIncome = 0;
    let totalExpense = 0;
    const incomeByCategory: Record<string, number> = {};
    const expenseByCategory: Record<string, number> = {};

    (transactions || []).forEach((t: any) => {
      const categoryName = t.categories?.name || 'Ангилаагүй';
      
      if (t.type === 'income') {
        totalIncome += Number(t.amount);
        incomeByCategory[categoryName] = (incomeByCategory[categoryName] || 0) + Number(t.amount);
      } else {
        totalExpense += Number(t.amount);
        expenseByCategory[categoryName] = (expenseByCategory[categoryName] || 0) + Number(t.amount);
      }
    });

    const result: ReportResponse = {
      reportType,
      period: { start: startDate, end: endDate },
      summary: {
        totalIncome,
        totalExpense,
        netProfit: totalIncome - totalExpense,
        transactionCount: transactions?.length || 0,
      },
      incomeByCategory,
      expenseByCategory,
      transactions: transactions || [],
    };

    // Generate CSV if requested
    if (format === 'csv') {
      const csvHeader = 'Огноо,Төрөл,Дүн,Тайлбар,Ангилал,Баримтын дугаар\n';
      const csvRows = (transactions || []).map((t: any) => 
        `${t.date},${t.type === 'income' ? 'Орлого' : 'Зарлага'},${t.amount},"${t.description || ''}","${t.categories?.name || ''}","${t.document_no || ''}"`
      ).join('\n');
      result.csvData = csvHeader + csvRows;
    }

    console.log('Report generated successfully');

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in generate-report function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
