import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import ClassFlower from './ClassFlower'

afterEach(cleanup)

test('mỗi thành viên lớp là một cánh, bạn nào mở quà thì cánh đó nở', () => {
  const { container } = render(<ClassFlower opened={3} total={23} />)
  expect(container.querySelectorAll('.flower__petal')).toHaveLength(23)
  expect(container.querySelectorAll('.flower__petal.is-open')).toHaveLength(3)
  expect(screen.getByRole('img', { name: '3 trên 23 bạn đã mở quà' })).toBeTruthy()
  expect(screen.getByText('3/23')).toBeTruthy()
})

test('mọi bạn nữ mở quà thì hoa nở trọn và đổi lời', () => {
  const { container } = render(<ClassFlower opened={25} total={23} />)
  expect(container.querySelectorAll('.flower__petal.is-open')).toHaveLength(23)
  expect(container.querySelector('.flower').classList.contains('is-complete')).toBe(true)
  expect(screen.getByText(/Cả 23 bạn nữ đã mở quà rồi/)).toBeTruthy()
})

test('chưa có thành viên nào thì không vẽ hoa; tắt caption thì chỉ còn hình', () => {
  const empty = render(<ClassFlower opened={0} total={0} />)
  expect(empty.container.querySelector('.flower')).toBeNull()
  empty.unmount()

  const { container } = render(<ClassFlower opened={1} total={5} caption={false} />)
  expect(container.querySelector('.flower__caption')).toBeNull()
  // Có người mở quà thì có cánh hoa rơi vào giữa
  expect(container.querySelector('.flower__drop')).toBeTruthy()
})
