import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  lookupMemberService: vi.fn(),
  consumeMemberService: vi.fn(),
}))

vi.mock('@/lib/loyalty/memberService', () => ({
  lookupMemberService: mocks.lookupMemberService,
  consumeMemberService: mocks.consumeMemberService,
  MemberServiceError: class MemberServiceError extends Error {
    constructor(
      message: string,
      readonly status: number,
      readonly code: string,
    ) {
      super(message)
    }
  },
}))

const locationId = '20000000-0000-4000-8000-000000000001'
const customerCode = 'PYM-7K4M-9Q2D-H'

describe('Member Service routes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('looks up a scanned QR payload without changing an allowance', async () => {
    const data = { member: { customerCode }, canUse: true, remaining: 2 }
    mocks.lookupMemberService.mockResolvedValue(data)
    const { POST } = await import('@/app/api/loyalty/walk-ins/lookup/route')
    const rawCode = JSON.stringify({ type: 'piyam.customer', version: 1, customerCode })
    const response = await POST(
      new Request('http://localhost/api/loyalty/walk-ins/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerCode: rawCode, locationId }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(data)
    expect(mocks.lookupMemberService).toHaveBeenCalledWith({ rawCode, locationId })
    expect(mocks.consumeMemberService).not.toHaveBeenCalled()
  })

  it('consumes one use with server-owned staff identity and no service selection', async () => {
    mocks.consumeMemberService.mockResolvedValue({ remaining: 1 })
    const { POST } = await import('@/app/api/loyalty/walk-ins/route')
    const idempotencyKey = '40000000-0000-4000-8000-000000000001'
    const response = await POST(
      new Request('http://localhost/api/loyalty/walk-ins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerCode, locationId, idempotencyKey }),
      }),
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ remaining: 1 })
    expect(mocks.consumeMemberService).toHaveBeenCalledWith({
      rawCode: customerCode,
      locationId,
      actorEmployeeId: 'u-1',
      idempotencyKey,
    })
  })
})
