import '@testing-library/jest-dom'
import { TextEncoder, TextDecoder } from 'util';
import * as dotenv from 'dotenv';
import path from 'path';
import { useUIStore } from './lib/stores/uiStore';
import { useFriendStore } from './lib/stores/friendStore';
import { useMapStore } from './lib/stores/mapStore';
import { useTripStore } from './lib/stores/tripStore';
import { useUserStore } from './lib/stores/userStore';
import { useVisitStore } from './lib/stores/visitStore';
import { useWineryDataStore } from './lib/stores/wineryDataStore';
import { useWineryStore } from './lib/stores/wineryStore';

// Load env vars from .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Reset all Zustand stores before each test to prevent state bleed
beforeEach(() => {
  useUIStore.getState().reset?.();
  useFriendStore.getState().reset?.();
  useMapStore.getState().reset?.();
  useTripStore.getState().reset?.();
  useUserStore.getState().reset?.();
  useVisitStore.getState().reset?.();
  useWineryDataStore.getState().reset?.();
  useWineryStore.getState().reset?.();
});

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Polyfill Request, Response, Headers for Next.js App Router tests in JSDOM
// Next.js 14+ relies on these globals for server components/actions.
if (typeof global.fetch === 'undefined') {
  global.fetch = require('node-fetch');
}
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