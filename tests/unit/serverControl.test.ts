import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getConfiguredServiceDefinitions,
  getServerControlStatus,
  runServerControlAction,
} from '@/lib/serverControl'

describe('server control helpers', () => {
  beforeEach(() => {
    delete process.env.HETZNER_API_TOKEN
    delete process.env.HETZNER_SERVER_ID
    delete process.env.HETZNER_SERVER_IP
    delete process.env.HETZNER_SERVER_LABEL
    delete process.env.SERVER_CONTROL_SERVICES
    delete process.env.SERVER_CONTROL_SERVICE_HEALTH_URLS
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('combines service names with health URL overrides', () => {
    process.env.SERVER_CONTROL_SERVICES = 'Coolify,Chatwoot=https://chatwoot.example.com/health'
    process.env.SERVER_CONTROL_SERVICE_HEALTH_URLS = 'Coolify=https://coolify.example.com/status'

    const services = getConfiguredServiceDefinitions()

    expect(services).toEqual([
      {
        name: 'Coolify',
        description: 'Hosted on this server',
        healthUrl: 'https://coolify.example.com/status',
      },
      {
        name: 'Chatwoot',
        description: 'Hosted on this server',
        healthUrl: 'https://chatwoot.example.com/health',
      },
    ])
  })

  it('normalizes bare service hostnames into probe URLs', () => {
    process.env.SERVER_CONTROL_SERVICES =
      'Chatwoot=hub.piyamtravel.com,Coolify=http://178.104.107.217:8000'

    const services = getConfiguredServiceDefinitions()

    expect(services).toMatchObject([
      {
        name: 'Chatwoot',
        healthUrl: 'https://hub.piyamtravel.com/',
      },
      {
        name: 'Coolify',
        healthUrl: 'http://178.104.107.217:8000/',
      },
    ])
  })

  it('returns Hetzner status with online service probe details', async () => {
    process.env.HETZNER_API_TOKEN = 'token'
    process.env.HETZNER_SERVER_ID = '123'
    process.env.SERVER_CONTROL_SERVICES = 'Coolify'
    process.env.SERVER_CONTROL_SERVICE_HEALTH_URLS = 'Coolify=https://coolify.example.com/status'

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('api.hetzner.cloud')) {
        return Response.json({
          server: {
            id: 123,
            name: 'pt-host',
            status: 'running',
            public_net: { ipv4: { ip: '203.0.113.10' } },
          },
        })
      }

      expect(init?.method).toBe('HEAD')
      return new Response(null, { status: 204 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const status = await getServerControlStatus()

    expect(status.configured).toBe(true)
    expect(status.server?.name).toBe('pt-host')
    expect(status.server?.primaryIpv4).toBe('203.0.113.10')
    expect(status.services[0]).toMatchObject({
      name: 'Coolify',
      healthUrlConfigured: true,
      healthUrlHost: 'coolify.example.com',
      status: 'online',
      statusCode: 204,
      error: null,
    })
  })

  it('keeps service probe failures isolated from server configuration', async () => {
    process.env.SERVER_CONTROL_SERVICES = 'Chatwoot'
    process.env.SERVER_CONTROL_SERVICE_HEALTH_URLS = 'Chatwoot=https://chatwoot.example.com/health'

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down')
      }),
    )

    const status = await getServerControlStatus()

    expect(status.configured).toBe(false)
    expect(status.server).toBeNull()
    expect(status.services[0]).toMatchObject({
      name: 'Chatwoot',
      healthUrlConfigured: true,
      healthUrlHost: 'chatwoot.example.com',
      status: 'offline',
      statusCode: null,
      error: 'network down',
    })
  })

  it('resolves Hetzner actions by configured public IP or IPv6 allocation when server ID is absent', async () => {
    process.env.HETZNER_API_TOKEN = 'token'
    process.env.HETZNER_SERVER_IP = '178.104.107.217,2a01:4f8:1c19:b70d::/64'

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/servers?page=')) {
        return Response.json({
          servers: [
            {
              id: 456,
              name: 'pt-host',
              status: 'running',
              public_net: { ipv6: { ip: '2a01:4f8:1c19:b70d::/64' } },
            },
          ],
          meta: { pagination: { next_page: null } },
        })
      }

      if (url.includes('/servers/456/actions/reboot')) {
        expect(init?.method).toBe('POST')
        return Response.json({
          action: {
            id: 99,
            command: 'reboot_server',
            status: 'running',
            progress: 0,
            started: '2026-07-09T00:00:00.000Z',
            finished: null,
          },
        })
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await runServerControlAction('restart')

    expect(result.providerAction.id).toBe(99)
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/servers/456/actions/reboot'),
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
