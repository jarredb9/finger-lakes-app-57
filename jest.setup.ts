import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util';

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Polyfill Request, Response, Headers for Next.js App Router tests in JSDOM
// Next.js 14+ relies on these globals for server components/actions.
if (typeof global.Request === 'undefined') {
  global.Request = class Request extends (require('node-fetch').Request) {};
}
if (typeof global.Response === 'undefined') {
  global.Response = class Response extends (require('node-fetch').Response) {};
}
if (typeof global.Headers === 'undefined') {
  global.Headers = class Headers extends (require('node-fetch').Headers) {};
}

// Mock the 'next/cache' functions that are used by server actions
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));