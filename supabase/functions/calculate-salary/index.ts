import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.82.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SalaryCalculationRequest {
  employeeName: string;
  baseSalary: number;
  workDays: number;
  totalWorkDays: number;
  bonus?: number;
  deductions?: number;
}

interface SalaryCalculationResponse {
  employeeName: string;
  baseSalary: number;
  actualSalary: number;
  bonus: number;
  grossSalary: number;
  socialInsurance: number;
  healthInsurance: number;
  personalIncomeTax: number;
  totalDeductions: number;
  netSalary: number;
  employerSocialInsurance: number;
  totalEmployerCost: number;
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

    const { 
      employeeName, 
      baseSalary, 
      workDays, 
      totalWorkDays, 
      bonus = 0, 
      deductions = 0 
    }: SalaryCalculationRequest = await req.json();

    console.log('Calculating salary for:', { employeeName, baseSalary, workDays, totalWorkDays });

    // Calculate actual salary based on work days
    const actualSalary = (baseSalary / totalWorkDays) * workDays;
    const grossSalary = actualSalary + bonus - deductions;

    // Mongolian tax rates (2024)
    // Social Insurance: 11.5% (employee) + 12.5% (employer)
    // Health Insurance: 2% (employee) + 2% (employer)
    // Personal Income Tax: 10%

    const socialInsuranceRate = 0.115; // 11.5%
    const healthInsuranceRate = 0.02; // 2%
    const personalIncomeTaxRate = 0.10; // 10%

    // Employer contributions
    const employerSocialInsuranceRate = 0.125; // 12.5%
    const employerHealthInsuranceRate = 0.02; // 2%

    // Calculate employee deductions
    const socialInsurance = Math.round(grossSalary * socialInsuranceRate);
    const healthInsurance = Math.round(grossSalary * healthInsuranceRate);
    
    // Taxable income (after social and health insurance)
    const taxableIncome = grossSalary - socialInsurance - healthInsurance;
    const personalIncomeTax = Math.round(taxableIncome * personalIncomeTaxRate);

    const totalDeductionsAmount = socialInsurance + healthInsurance + personalIncomeTax;
    const netSalary = grossSalary - totalDeductionsAmount;

    // Employer costs
    const employerSocialInsurance = Math.round(grossSalary * (employerSocialInsuranceRate + employerHealthInsuranceRate));
    const totalEmployerCost = grossSalary + employerSocialInsurance;

    const result: SalaryCalculationResponse = {
      employeeName,
      baseSalary,
      actualSalary: Math.round(actualSalary),
      bonus,
      grossSalary: Math.round(grossSalary),
      socialInsurance,
      healthInsurance,
      personalIncomeTax,
      totalDeductions: totalDeductionsAmount,
      netSalary: Math.round(netSalary),
      employerSocialInsurance,
      totalEmployerCost: Math.round(totalEmployerCost),
    };

    console.log('Salary calculation result:', result);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Error in calculate-salary function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
