
import { render, screen } from '@testing-library/react'
import { Button } from '../button'
 
describe('Button', () => {
  it('renders a button', () => {
    render(<Button>Click me</Button>)
 
    const button = screen.getByRole('button', { name: /click me/i })
 
    expect(button).toBeInTheDocument()
  })
})
