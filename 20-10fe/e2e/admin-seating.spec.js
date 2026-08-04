import { expect, test } from '@playwright/test'

test('admin can sign in, open the seating map, and assign an empty seat', async ({ page }) => {
  const students = [
    { id: 17, full_name: 'Phượng', nickname: 'Phượng', class_name: '12A1', is_active: true, seat_row: 0, seat_col: 9 },
    { id: 22, full_name: 'Hương', nickname: 'Hương', class_name: '12A1', is_active: true, seat_row: null, seat_col: null },
  ]

  await page.route('**/*', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    if (!url.pathname.startsWith('/api/')) {
      await route.continue()
      return
    }
    if (url.pathname === '/api/auth/admin/login') {
      await route.fulfill({ json: { success: true, data: { token: 'test-admin-token' } } })
      return
    }
    if (url.pathname === '/api/auth/admin/me') {
      await route.fulfill({ json: { success: true, data: { id: 1 } } })
      return
    }
    if (url.pathname === '/api/students' && request.method() === 'GET') {
      await route.fulfill({ json: { success: true, data: students } })
      return
    }
    if (url.pathname === '/api/students/22/seat' && request.method() === 'PATCH') {
      const body = request.postDataJSON()
      await route.fulfill({
        json: {
          success: true,
          data: {
            action: 'moved',
            student: { ...students[1], seat_row: body.seat_row, seat_col: body.seat_col },
            affectedStudent: null,
          },
        },
      })
      return
    }
    await route.fulfill({ status: 404, json: { success: false, message: 'Unhandled test route' } })
  })

  await page.goto('/admin/seating')
  await page.getByLabel('Tên đăng nhập').fill('admin')
  await page.getByLabel('Mật khẩu').fill('password')
  await page.getByRole('button', { name: 'Đăng nhập' }).click()

  await expect(page).toHaveURL(/\/admin$/)
  await page.getByRole('link', { name: 'Sơ đồ lớp' }).click()
  await expect(page).toHaveURL(/\/admin\/seating$/)
  await expect(page.getByRole('heading', { name: 'Sơ đồ lớp' })).toBeVisible()
  await page.getByLabel('Thành viên').selectOption('22')
  await page.getByRole('button', { name: 'Ghế hàng 1, cột 1' }).click()
  await expect(page.getByRole('status')).toContainText('Đã xếp Hương vào hàng 1, cột 1.')
})
