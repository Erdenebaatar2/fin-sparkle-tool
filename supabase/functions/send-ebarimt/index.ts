import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.82.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EbarimtRequest {
  transactionId: string;
  customerTin?: string; // Татвар төлөгчийн дугаар
  customerName?: string;
  items: {
    name: string;
    quantity: number;
    unitPrice: number;
    totalAmount: number;
  }[];
}

interface EbarimtResponse {
  success: boolean;
  billId?: string;
  qrData?: string;
  lottery?: string;
  message?: string;
  testMode: boolean;
}

// E-Barimt Test API endpoints
const EBARIMT_TEST_URL = 'https://ebarimt.mn/rest/merchant/info';
const EBARIMT_PROD_URL = 'https://ebarimt.mn/rest/merchant/info';

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

    const { transactionId, customerTin, customerName, items }: EbarimtRequest = await req.json();

    console.log('Sending E-Barimt:', { transactionId, customerTin, itemCount: items.length });

    // Get company settings
    const { data: companySettings, error: settingsError } = await supabaseClient
      .from('company_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (settingsError) {
      console.error('Error fetching company settings:', settingsError);
      throw new Error('Компанийн тохиргоо олдсонгүй');
    }

    if (!companySettings) {
      throw new Error('Эхлээд компанийн мэдээллээ тохируулна уу');
    }

    const isTestMode = companySettings.ebarimt_test_mode ?? true;
    
    // Calculate totals
    const totalAmount = items.reduce((sum, item) => sum + item.totalAmount, 0);
    const vatAmount = companySettings.vat_registered 
      ? (totalAmount * (companySettings.vat_rate || 10)) / (100 + (companySettings.vat_rate || 10))
      : 0;

    // In test mode, simulate E-Barimt response
    if (isTestMode) {
      console.log('Running in TEST MODE - simulating E-Barimt response');
      
      const testResponse: EbarimtResponse = {
        success: true,
        billId: `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        qrData: `https://ebarimt.mn/test?id=${transactionId}`,
        lottery: Math.random().toString().substr(2, 8),
        message: 'Тест горимд амжилттай илгээлээ',
        testMode: true,
      };

      // Update transaction with E-Barimt info (if tracking table exists)
      console.log('E-Barimt test response:', testResponse);

      return new Response(JSON.stringify(testResponse), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Production mode - actual E-Barimt API call would go here
    // This requires actual E-Barimt merchant credentials
    const ebarimtApiKey = companySettings.ebarimt_api_key;
    
    if (!ebarimtApiKey) {
      throw new Error('E-Barimt API түлхүүр тохируулаагүй байна');
    }

    // Build E-Barimt request payload
    const ebarimtPayload = {
      amount: totalAmount.toString(),
      vat: vatAmount.toFixed(2),
      cashAmount: totalAmount.toString(),
      nonCashAmount: '0',
      cityTax: '0',
      districtCode: '',
      posNo: '1',
      customerNo: customerTin || '',
      billType: customerTin ? '3' : '1', // 1 = B2C, 3 = B2B
      billIdSuffix: '',
      returnBillId: '',
      taxType: companySettings.vat_registered ? '1' : '3',
      invoiceId: '',
      reportMonth: '',
      stocks: items.map(item => ({
        code: '',
        name: item.name,
        measureUnit: 'ш',
        qty: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        totalAmount: item.totalAmount.toString(),
        cityTax: '0',
        vat: companySettings.vat_registered 
          ? ((item.totalAmount * (companySettings.vat_rate || 10)) / (100 + (companySettings.vat_rate || 10))).toFixed(2)
          : '0',
        barCode: '',
      })),
    };

    console.log('Sending to E-Barimt API:', JSON.stringify(ebarimtPayload));

    // Note: Actual E-Barimt API integration would require their SDK or direct API calls
    // This is a placeholder for the production implementation
    const result: EbarimtResponse = {
      success: false,
      message: 'Продакшн горим хараахан идэвхжээгүй. E-Barimt SDK-г нэмэх шаардлагатай.',
      testMode: false,
    };

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in send-ebarimt function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
