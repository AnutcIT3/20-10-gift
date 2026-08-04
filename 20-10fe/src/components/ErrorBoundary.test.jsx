import { render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import ErrorBoundary from './ErrorBoundary'

function BrokenView() {
  throw new Error('render failed')
}

afterEach(() => {
  vi.restoreAllMocks()
})

test('shows a recoverable fallback when a child fails to render', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(
    <ErrorBoundary>
      <BrokenView />
    </ErrorBoundary>,
  )

  expect(screen.getByRole('alert')).toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Trang gặp sự cố' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/')
})
