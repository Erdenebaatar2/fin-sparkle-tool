import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.82.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IncomeTaxReportRequest {
  year: number;
  quarter?: number; // 1-4, optional for quarterly report
}

interface IncomeTaxReportResponse {
  period: string;
  companyInfo: {
    name: string;
    registrationNumber: string;
    taxNumber: string;
  };
  income: {
    grossIncome: number;
    otherIncome: number;
    totalIncome: number;
  };
  expenses: {
    operatingExpenses: number;
    administrativeExpenses: number;
    otherExpenses: number;
    totalExpenses: number;
  };
  taxCalculation: {
    taxableIncome: number;
    taxRate: number;
    incomeTax: number;
    prepaidTax: number;
    taxPayable: number;
  };
  monthlyBreakdown: {
    month: string;
    income: number;
    expense: number;
    profit: number;
  }[];
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

    const { year, quarter }: IncomeTaxReportRequest = await req.json();

    console.log('Generating Income Tax report:', { year, quarter, userId: user.id });

    // Get company settings
    const { data: companySettings, error: settingsError } = await supabaseClient
      .from('company_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError || !companySettings) {
      throw new Error('Компанийн тохиргоо олдсонгүй');
    }

    const incomeTaxRate = companySettings.income_tax_rate || 10;

    // Calculate date range based on quarter or full year
    let startDate: string;
    let endDate: string;
    let periodLabel: string;

    if (quarter) {
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = quarter * 3;
      startDate = `${year}-${startMonth.toString().padStart(2, '0')}-01`;
      endDate = new Date(year, endMonth, 0).toISOString().split('T')[0];
      periodLabel = `${year} оны ${quarter}-р улирал`;
    } else {
      startDate = `${year}-01-01`;
      endDate = `${year}-12-31`;
      periodLabel = `${year} он`;
    }

    // Fetch transactions for the period
    const { data: transactions, error: transError } = await supabaseClient
      .from('transactions')
      .select('*, categories(name, type)')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (transError) {
      console.error('Error fetching transactions:', transError);
      throw transError;
    }

    // Calculate income and expenses
    let totalIncome = 0;
    let totalExpenses = 0;
    const monthlyData: Record<string, { income: number; expense: number }> = {};

    // Initialize monthly data
    const monthNames = ['1-р сар', '2-р сар', '3-р сар', '4-р сар', '5-р сар', '6-р сар', 
                        '7-р сар', '8-р сар', '9-р сар', '10-р сар', '11-р сар', '12-р сар'];
    
    const startMonthIndex = quarter ? (quarter - 1) * 3 : 0;
    const endMonthIndex = quarter ? quarter * 3 - 1 : 11;
    
    for (let i = startMonthIndex; i <= endMonthIndex; i++) {
      monthlyData[i + 1] = { income: 0, expense: 0 };
    }

    // Process transactions
    (transactions || []).forEach((t: any) => {
      const amount = Number(t.amount);
      const month = new Date(t.date).getMonth() + 1;

      if (t.type === 'income') {
        totalIncome += amount;
        if (monthlyData[month]) {
          monthlyData[month].income += amount;
        }
      } else {
        totalExpenses += amount;
        if (monthlyData[month]) {
          monthlyData[month].expense += amount;
        }
      }
    });

    // Calculate VAT to exclude from income (if VAT registered)
    const vatRate = companySettings.vat_rate || 10;
    const vatOnIncome = companySettings.vat_registered 
      ? (totalIncome * vatRate) / (100 + vatRate)
      : 0;
    const vatOnExpenses = companySettings.vat_registered 
      ? (totalExpenses * vatRate) / (100 + vatRate)
      : 0;

    // Income without VAT
    const grossIncome = totalIncome - vatOnIncome;
    const operatingExpenses = totalExpenses - vatOnExpenses;

    // Taxable income calculation
    const taxableIncome = Math.max(0, grossIncome - operatingExpenses);
    const incomeTax = Math.round((taxableIncome * incomeTaxRate) / 100);

    // Build monthly breakdown
    const monthlyBreakdown = Object.entries(monthlyData).map(([month, data]) => ({
      month: monthNames[parseInt(month) - 1],
      income: Math.round(data.income * 100) / 100,
      expense: Math.round(data.expense * 100) / 100,
      profit: Math.round((data.income - data.expense) * 100) / 100,
    }));

    const result: IncomeTaxReportResponse = {
      period: periodLabel,
      companyInfo: {
        name: companySettings.company_name,
        registrationNumber: companySettings.registration_number,
        taxNumber: companySettings.tax_number || '',
      },
      income: {
        grossIncome: Math.round(grossIncome * 100) / 100,
        otherIncome: 0,
        totalIncome: Math.round(grossIncome * 100) / 100,
      },
      expenses: {
        operatingExpenses: Math.round(operatingExpenses * 100) / 100,
        administrativeExpenses: 0,
        otherExpenses: 0,
        totalExpenses: Math.round(operatingExpenses * 100) / 100,
      },
      taxCalculation: {
        taxableIncome: Math.round(taxableIncome * 100) / 100,
        taxRate: incomeTaxRate,
        incomeTax,
        prepaidTax: 0,
        taxPayable: incomeTax,
      },
      monthlyBreakdown,
    };

    console.log('Income Tax report generated:', {
      period: result.period,
      taxableIncome,
      incomeTax,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in generate-income-tax-report function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
