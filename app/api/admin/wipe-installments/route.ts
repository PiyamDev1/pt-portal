import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Delete all installment records
    const { error, count } = await supabase
      .from('loan_installments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (using impossible condition to delete everything)

    if (error) {
      console.error('Error wiping installments:', error)
      return NextResponse.json({ 
        success: false, 
        error: error.message 
      }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      message: `All installment records wiped`,
      count 
    })
  } catch (error: any) {
    console.error('Error in wipe-installments:', error)
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 })
  }
}
