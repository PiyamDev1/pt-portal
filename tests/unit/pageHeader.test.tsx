import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ pathname: '/dashboard/applications/passports' }))

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}))

vi.mock('next/image', () => ({
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => {
    const { priority: _priority, ...imageProps } = props
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...imageProps} alt={imageProps.alt || ''} />
  },
}))

vi.mock('@/app/dashboard/logout-button.client', () => ({
  default: () => <button type="button">Sign out</button>,
}))

import PageHeader from '@/app/components/PageHeader.client'

describe('PageHeader', () => {
  beforeEach(() => {
    mocks.pathname = '/dashboard/applications/passports'
  })

  it('places stable parent navigation after the company and branch identity', () => {
    render(<PageHeader employeeName="Amina" role="Admin" location={{ name: 'Bradford' }} />)

    const links = screen.getAllByRole('link')
    expect(links[0].getAttribute('href')).toBe('/dashboard')
    expect(links[1].getAttribute('href')).toBe('/dashboard/applications')
    expect(links[1].getAttribute('aria-label')).toBe('Back to Applications')
    expect(links[1].previousElementSibling?.textContent).toContain('Piyam Travels')
    expect(links[1].previousElementSibling?.textContent).toContain('Bradford')
  })

  it('keeps mobile settings navigation available to Super Admins', () => {
    mocks.pathname = '/dashboard/settings'
    render(<PageHeader employeeName="Amina" role="Super Admin" location={{ name: 'Bradford' }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open mobile menu' }))

    expect(screen.getByRole('link', { name: 'Notice Board' }).getAttribute('href')).toBe(
      '/dashboard/settings?tab=notice-board',
    )
  })

  it('uses My performance as the canonical staff activity and earnings destination', () => {
    mocks.pathname = '/dashboard/my-performance'
    render(<PageHeader employeeName="Amina" role="Employee" location={{ name: 'Bradford' }} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open mobile menu' }))

    expect(screen.getByRole('link', { name: 'My performance' }).getAttribute('href')).toBe(
      '/dashboard/my-performance',
    )
    expect(screen.getByRole('link', { name: 'Activity' }).getAttribute('href')).toBe(
      '/dashboard/my-performance?view=activity',
    )
    expect(screen.getByRole('link', { name: 'Attendance' }).getAttribute('href')).toBe(
      '/dashboard/my-performance?view=attendance',
    )
    expect(screen.getByRole('link', { name: 'Earnings & commission' }).getAttribute('href')).toBe(
      '/dashboard/my-performance?view=earnings',
    )
  })
})
