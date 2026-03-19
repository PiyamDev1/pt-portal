/**
 * API Route: Manage NADRA Record
 *
 * PUT    /api/nadra/manage-record  - Update an existing application record
 * DELETE /api/nadra/manage-record  - Soft-delete / cancel an application
 *
 * The PUT handler accepts a partial payload and updates only the provided
 * fields (cleanPayload strips undefined values). Supports full record edits
 * including agent, service type, fees, and person details.
 *
 * The DELETE handler marks the record as cancelled rather than hard-deleting.
 *
 * Request Body: { applicationId: string, ...fields }
 * Response Success (200): { updatedApplicationId } or { cancelledApplicationId }
 * Response Errors: 400 Missing applicationId | 500 DB error
 *
 * Authentication: Service role key
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

export const dynamic = 'force-dynamic'

const createSupabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const cleanPayload = (payload) =>
  Object.fromEntries(Object.entries(payload).filter(([_, value]) => value !== undefined))

export async function POST(request) {
  try {
    const supabase = createSupabase()
    const body = await request.json()
    const { action, type, id, data = {}, authCode, userId } = body || {}

    if (!action || !type) {
      return apiError('Missing action or type', 400)
    }

    if (!id) {
      return apiError('Missing record id', 400)
    }

    const normalizedType = type === 'family_head' ? 'family_head' : 'application'

    // ---------------------------------------------------------
    // HANDLE DELETION
    // ---------------------------------------------------------
    if (action === 'delete') {
      if (!authCode) {
        return apiError('Auth code required', 403)
      }

      const table = normalizedType === 'family_head' ? 'applicants' : 'nadra_services'
      const { data: recordToDelete, error: fetchError } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .single()

      if (fetchError) {
        if (fetchError.code === 'PGRST116') {
          return apiError('Record not found', 404)
        }
        throw fetchError
      }

      if (!recordToDelete) {
        return apiError('Record not found', 404)
      }

      const { error: logError } = await supabase.from('deletion_logs').insert({
        record_type: normalizedType === 'family_head' ? 'Family Head' : 'Nadra Application',
        deleted_record_data: recordToDelete,
        deleted_by: userId || null,
        auth_code_used: authCode,
      })

      if (logError) throw logError

      if (normalizedType === 'family_head') {
        // Check if family head has any linked applications/members
        const { data: linkedApps, error: checkError } = await supabase
          .from('applications')
          .select('id')
          .eq('family_head_id', id)

        if (checkError) throw checkError

        if (linkedApps && linkedApps.length > 0) {
          return apiError('Cannot delete family head with existing members', 409, {
            details: `Please delete all ${linkedApps.length} member application(s) first.`,
          })
        }

        // Check if this person is themselves an applicant in any application
        const { data: applicantApps, error: applicantCheckError } = await supabase
          .from('applications')
          .select('id')
          .eq('applicant_id', id)

        if (applicantCheckError) throw applicantCheckError

        if (applicantApps && applicantApps.length > 0) {
          return apiError('Cannot delete: Person has active applications', 409, {
            details: `This person has ${applicantApps.length} application(s) as an applicant. Delete those first.`,
          })
        }

        const { error: deleteHeadError } = await supabase.from('applicants').delete().eq('id', id)

        if (deleteHeadError) throw deleteHeadError
      } else {
        const appId = recordToDelete.application_id
        const applicantId = recordToDelete.applicant_id

        const { error: deleteServiceError } = await supabase
          .from('nadra_services')
          .delete()
          .eq('id', id)

        if (deleteServiceError) throw deleteServiceError

        if (appId) {
          const { error: deleteAppError } = await supabase
            .from('applications')
            .delete()
            .eq('id', appId)

          if (deleteAppError) throw deleteAppError
        }

        if (applicantId) {
          const { error: deleteApplicantError } = await supabase
            .from('applicants')
            .delete()
            .eq('id', applicantId)

          if (deleteApplicantError) throw deleteApplicantError
        }
      }

      return apiOk({
        deletedRecordType: normalizedType,
        deletedRecordId: id,
      })
    }

    // ---------------------------------------------------------
    // HANDLE UPDATE
    // ---------------------------------------------------------
    if (action === 'update') {
      if (normalizedType === 'family_head') {
        const payload = cleanPayload({
          first_name: data.firstName,
          last_name: data.lastName,
          citizen_number: data.cnic,
          phone_number: data.phone,
        })

        const { error: updateHeadError } = await supabase
          .from('applicants')
          .update(payload)
          .eq('id', id)

        if (updateHeadError) throw updateHeadError
      } else {
        if (data.applicantId) {
          const zeroPlaceholder = typeof data.cnic === 'string' && data.cnic.startsWith('00000')
          const isNewBorn = data.newBorn === true || zeroPlaceholder
          const citizenNumber = isNewBorn ? null : data.cnic || null

          const applicantPayload = cleanPayload({
            first_name: data.firstName,
            last_name: data.lastName,
            citizen_number: citizenNumber,
            email: data.email,
            is_new_born: isNewBorn,
          })

          const { error: updateApplicantError } = await supabase
            .from('applicants')
            .update(applicantPayload)
            .eq('id', data.applicantId)

          if (updateApplicantError) throw updateApplicantError
        }

        const servicePayload = cleanPayload({
          service_type: data.serviceType,
          tracking_number: data.trackingNumber,
          application_pin: data.pin,
          notes: data.notes,
        })

        const { error: updateServiceError } = await supabase
          .from('nadra_services')
          .update(servicePayload)
          .eq('id', id)

        if (updateServiceError) throw updateServiceError

        if (data.employeeId) {
          const { data: employees, error: employeesError } = await supabase
            .from('employees')
            .select('id, manager_id, roles ( name )')

          if (employeesError) throw employeesError

          const currentUser = employees?.find((emp) => emp.id === userId)
          if (!currentUser) {
              return apiError('User not found', 404)
          }

          const roleName = Array.isArray(currentUser.roles)
            ? currentUser.roles[0]?.name
            : currentUser.roles?.name

          const isMasterAdmin = roleName === 'Master Admin'

          const { data: nadraRecord, error: nadraFetchError } = await supabase
            .from('nadra_services')
            .select('id, employee_id')
            .eq('id', id)
            .single()

          if (nadraFetchError) {
            if (nadraFetchError.code === 'PGRST116') {
              return apiError('Nadra record not found', 404)
            }
            throw nadraFetchError
          }

          const managerMap = new Map()
          employees?.forEach((emp) => managerMap.set(emp.id, emp.manager_id || null))

          const isManagerOf = (managerId, employeeId) => {
            let current = employeeId
            while (current) {
              if (current === managerId) return true
              current = managerMap.get(current)
            }
            return false
          }

          if (!isMasterAdmin) {
            const managesTarget = isManagerOf(userId, data.employeeId)

            if (!managesTarget) {
              return apiError(
                'Only the manager in the hierarchy of the selected agent or a master admin can reassign this agent.',
                403,
              )
            }
          }

          const { error: updateAgentError } = await supabase
            .from('nadra_services')
            .update({ employee_id: data.employeeId })
            .eq('id', id)

          if (updateAgentError) throw updateAgentError
        }

        if (data.trackingNumber && data.applicationId) {
          const { error: updateAppTrackingError } = await supabase
            .from('applications')
            .update({ tracking_number: data.trackingNumber })
            .eq('id', data.applicationId)

          if (updateAppTrackingError) throw updateAppTrackingError
        }

        if (data.serviceOption !== undefined) {
          const { error: detailError } = await supabase
            .from('nicop_cnic_details')
            .upsert({ id, service_option: data.serviceOption })

          if (detailError) throw detailError
        }
      }

      return apiOk({
        updatedRecordType: normalizedType,
        updatedRecordId: id,
      })
    }

    return apiError('Invalid action', 400)
  } catch (error) {
    console.error('Manage Record Error:', error)
    return apiError(toErrorMessage(error), 500)
  }
}
