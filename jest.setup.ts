import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Polyfill Request, Response, Headers for Next.js App Router tests in JSDOM
// Next.js 14+ relies on these globals for server components/actions.
if (typeof global.Request === 'undefined') {
  global.Request = (require('node-fetch').Request) as any;
}
if (typeof global.Response === 'undefined') {
  global.Response = (require('node-fetch').Response) as any;
}
if (typeof global.Headers === 'undefined') {
  global.Headers = (require('node-fetch').Headers) as any;
}

// Mock the 'next/cache' functions that are used by server actions
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));