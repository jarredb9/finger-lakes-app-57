import { render } from '@testing-library/react'
import { Button } from '../button'
 
describe('Button', () => {
  it('renders a button', () => {
    const { getByRole } = render(<Button>Click me</Button>)
 
    const button = getByRole('button', { name: /click me/i })
 
    expect(button).toBeInTheDocument()
  })
})