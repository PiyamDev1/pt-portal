import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NoticeBoardClient } from '@/app/dashboard/NoticeBoardClient'

describe('NoticeBoardClient', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          slides: [
            {
              id: 'notice-1',
              title: 'Portrait notice',
              body: 'Full notice details',
              image_url: '/api/dashboard/notice-board/image?id=notice-1',
              hyperlink_url: null,
              display_seconds: 10,
              sort_order: 0,
            },
          ],
        }),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows the complete portrait artwork in a taller fixed-width desktop rail', async () => {
    render(<NoticeBoardClient showMobilePopup={false} />)

    const image = await screen.findByRole('img', { name: 'Portrait notice' })
    expect(image.className).toContain('object-contain')
    expect(image.parentElement?.className).toContain('aspect-[1504/2816]')
    expect(image.closest('aside')?.textContent).toContain('Notice board')
  })
})
