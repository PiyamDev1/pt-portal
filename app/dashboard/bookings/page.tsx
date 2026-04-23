import { getRouteSupabaseClient } from '@/lib/api/serverSupabase';
import {
  Booking,
  BookingStatus,
  BookingSource,
} from '@/app/types/bookings';

/**
 * Bookings Dashboard
 * Displays all bookings for today
 * Server Component - fetches directly from Supabase
 */
export const revalidate = 60; // Revalidate every 60 seconds

async function getTodayBookings(): Promise<Booking[]> {
  const supabase = getRouteSupabaseClient();

  // Get today's date in UTC
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select(`
      *,
      booking_services:service_id(name, duration_minutes)
    `)
    .gte('start_time', today.toISOString())
    .lt('start_time', tomorrow.toISOString())
    .neq('status', 'cancelled')
    .order('start_time', { ascending: true });

  if (error) {
    console.error('Error fetching bookings:', error);
    return [];
  }

  return bookings || [];
}

function getStatusBadgeColor(
  status: string
): 'bg-yellow-100 text-yellow-800' | 'bg-green-100 text-green-800' | 'bg-gray-100 text-gray-800' {
  switch (status) {
    case BookingStatus.PENDING:
      return 'bg-yellow-100 text-yellow-800';
    case BookingStatus.CONFIRMED:
      return 'bg-green-100 text-green-800';
    case BookingStatus.COMPLETED:
      return 'bg-gray-100 text-gray-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

function getSourceLabel(source: string): string {
  const sourceMap: Record<string, string> = {
    [BookingSource.PORTAL]: 'Portal',
    [BookingSource.WHATSAPP]: 'WhatsApp',
    [BookingSource.WEBSITE]: 'Website',
  };
  return sourceMap[source] || source;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return 'Invalid date';
  }
}

export default async function BookingsDashboard() {
  const bookings = await getTodayBookings();

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">
            Today's Appointments
          </h1>
          <p className="mt-2 text-gray-600">
            Manage all bookings and appointments for today
          </p>
        </div>

        {/* Stats Card */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-600">Total Bookings</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {bookings.length}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-600">Pending</p>
            <p className="mt-2 text-3xl font-bold text-yellow-600">
              {
                bookings.filter((b) => b.status === BookingStatus.PENDING)
                  .length
              }
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-gray-600">Confirmed</p>
            <p className="mt-2 text-3xl font-bold text-green-600">
              {
                bookings.filter((b) => b.status === BookingStatus.CONFIRMED)
                  .length
              }
            </p>
          </div>
        </div>

        {/* Bookings Table */}
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
          {bookings.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                No appointments today
              </h3>
              <p className="mt-2 text-gray-600">
                There are no scheduled appointments for today.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-200 bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Customer
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Phone
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Service
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-sm font-semibold text-gray-900">
                      Source
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {bookings.map((booking) => (
                    <tr key={booking.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">
                          {booking.customer_name}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600">
                          {booking.customer_phone}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-900">
                          {formatTime(booking.start_time)}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-600">
                          {typeof (booking as any).booking_services === 'object' &&
                          (booking as any).booking_services?.name
                            ? (booking as any).booking_services.name
                            : 'Service'}
                        </p>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${getStatusBadgeColor(booking.status)}`}
                        >
                          {booking.status.charAt(0).toUpperCase() +
                            booking.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className="inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800">
                          {getSourceLabel(booking.source)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Last updated: {new Date().toLocaleTimeString('en-GB')}</p>
        </div>
      </div>
    </div>
  );
}
