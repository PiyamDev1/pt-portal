/**
 * Root App Page
 * Redirects all root traffic to the login flow.
 *
 * @module app/page
 */

import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/login')
}
