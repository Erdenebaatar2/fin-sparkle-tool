import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.82.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface VatReportRequest {
  year: number;
  month: number; // 1-12
}

interface VatReportResponse {
  period: string;
  companyInfo: {
    name: string;
    registrationNumber: string;
    taxNumber: string;
    vatRegistered: boolean;
  };
  sales: {
    totalSales: number;
    vatableSales: number;
    vatOnSales: number;
    exemptSales: number;
  };
  purchases: {
    totalPurchases: number;
    vatablePurchases: number;
    vatOnPurchases: number;
    exemptPurchases: number;
  };
  vatSummary: {
    outputVat: number;
    inputVat: number;
    vatPayable: number;
    vatRefundable: number;
  };
  transactionDetails: {
    sales: any[];
    purchases: any[];
  };
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

    const { year, month }: VatReportRequest = await req.json();

    console.log('Generating VAT report:', { year, month, userId: user.id });

    // Get company settings
    const { data: companySettings, error: settingsError } = await supabaseClient
      .from('company_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError || !companySettings) {
      throw new Error('Компанийн тохиргоо олдсонгүй');
    }

    const vatRate = companySettings.vat_rate || 10;

    // Calculate date range
    const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
    const endDate = new Date(year, month, 0).toISOString().split('T')[0];

    // Fetch transactions for the period
    const { data: transactions, error: transError } = await supabaseClient
      .from('transactions')
      .select('*, categories(name)')
      .eq('user_id', user.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (transError) {
      console.error('Error fetching transactions:', transError);
      throw transError;
    }

    // Calculate VAT figures
    let totalSales = 0;
    let totalPurchases = 0;
    const salesTransactions: any[] = [];
    const purchaseTransactions: any[] = [];

    (transactions || []).forEach((t: any) => {
      const amount = Number(t.amount);
      const vatAmount = companySettings.vat_registered 
        ? (amount * vatRate) / (100 + vatRate)
        : 0;
      const amountWithoutVat = amount - vatAmount;

      const transactionDetail = {
        date: t.date,
        documentNo: t.document_no,
        description: t.description,
        category: t.categories?.name,
        totalAmount: amount,
        vatAmount: Math.round(vatAmount * 100) / 100,
        amountWithoutVat: Math.round(amountWithoutVat * 100) / 100,
      };

      if (t.type === 'income') {
        totalSales += amount;
        salesTransactions.push(transactionDetail);
      } else {
        totalPurchases += amount;
        purchaseTransactions.push(transactionDetail);
      }
    });

    // Calculate VAT amounts
    const vatOnSales = companySettings.vat_registered 
      ? (totalSales * vatRate) / (100 + vatRate)
      : 0;
    const vatOnPurchases = companySettings.vat_registered 
      ? (totalPurchases * vatRate) / (100 + vatRate)
      : 0;

    const outputVat = Math.round(vatOnSales * 100) / 100;
    const inputVat = Math.round(vatOnPurchases * 100) / 100;
    const vatPayable = Math.max(0, outputVat - inputVat);
    const vatRefundable = Math.max(0, inputVat - outputVat);

    const result: VatReportResponse = {
      period: `${year} оны ${month}-р сар`,
      companyInfo: {
        name: companySettings.company_name,
        registrationNumber: companySettings.registration_number,
        taxNumber: companySettings.tax_number || '',
        vatRegistered: companySettings.vat_registered || false,
      },
      sales: {
        totalSales: Math.round(totalSales * 100) / 100,
        vatableSales: Math.round((totalSales - vatOnSales) * 100) / 100,
        vatOnSales: outputVat,
        exemptSales: 0,
      },
      purchases: {
        totalPurchases: Math.round(totalPurchases * 100) / 100,
        vatablePurchases: Math.round((totalPurchases - vatOnPurchases) * 100) / 100,
        vatOnPurchases: inputVat,
        exemptPurchases: 0,
      },
      vatSummary: {
        outputVat,
        inputVat,
        vatPayable,
        vatRefundable,
      },
      transactionDetails: {
        sales: salesTransactions,
        purchases: purchaseTransactions,
      },
    };

    console.log('VAT report generated:', {
      period: result.period,
      outputVat,
      inputVat,
      vatPayable,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in generate-vat-report function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
