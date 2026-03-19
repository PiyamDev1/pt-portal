import { createClient } from '@supabase/supabase-js'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'

export async function POST(request: Request) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Delete all installment records
    const { error, count } = await supabase
      .from('loan_installments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all (using impossible condition to delete everything)

    if (error) {
      return apiError(error.message, 500)
    }

    return apiOk({
      deletedInstallmentCount: count || 0,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to wipe installments'), 500)
  }
}
