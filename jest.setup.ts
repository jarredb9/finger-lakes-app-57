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
import { useWineryStore } from './lib/stores/wineryStore';

// Load env vars from .env.local
dotenv.config({ path: path.resolve(__dirname, '.env.local') });

// Mock idb-keyval globally as it's used in syncStore and initialized at top level
jest.mock('idb-keyval', () => ({
  get: jest.fn().mockResolvedValue(null),
  set: jest.fn().mockResolvedValue(undefined),
  del: jest.fn().mockResolvedValue(undefined),
  clear: jest.fn().mockResolvedValue(undefined),
  keys: jest.fn().mockResolvedValue([]),
}));

// Reset all Zustand stores before each test to prevent state bleed
// And setup modal-root for Portals
beforeEach(() => {
  useUIStore.getState().reset?.();
  useFriendStore.getState().reset?.();
  useMapStore.getState().reset?.();
  useTripStore.getState().reset?.();
  useUserStore.getState().reset?.();
  useVisitStore.getState().reset?.();
  useWineryStore.getState().reset?.();

  // Ensure modal-root exists for Portals
  if (typeof document !== 'undefined') {
    let modalRoot = document.getElementById('modal-root');
    if (!modalRoot) {
      modalRoot = document.createElement('div');
      modalRoot.setAttribute('id', 'modal-root');
      document.body.appendChild(modalRoot);
    } else {
      modalRoot.innerHTML = '';
    }
  }
});

global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder as any;

// Expose Node 24 native Web Fetch & Streams APIs (fetch, Request, Response, Headers, FormData, Streams)
// to JSDOM global context directly from Node's root execution context
if (typeof global.Request === 'undefined') {
  const vm = require('node:vm');
  const nodeGlobals = vm.runInThisContext('globalThis');
  global.fetch = nodeGlobals.fetch;
  global.Request = nodeGlobals.Request;
  global.Response = nodeGlobals.Response;
  global.Headers = nodeGlobals.Headers;
  global.FormData = nodeGlobals.FormData;
  if (typeof global.ReadableStream === 'undefined') {
    global.ReadableStream = nodeGlobals.ReadableStream;
    global.WritableStream = nodeGlobals.WritableStream;
    global.TransformStream = nodeGlobals.TransformStream;
  }
}

// Polyfill matchMedia for JSDOM
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: jest.fn(), // Deprecated
      removeListener: jest.fn(), // Deprecated
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  });
}

// Mock the 'next/cache' functions that are used by server actions
jest.mock('next/cache', () => ({
  revalidatePath: jest.fn(),
  revalidateTag: jest.fn(),
}));

jest.mock('./lib/utils/quota', () => {
  const actual = jest.requireActual('./lib/utils/quota');
  return {
    ...actual,
    checkAndCleanupQuota: jest.fn(actual.checkAndCleanupQuota),
    isQuotaError: jest.fn(actual.isQuotaError),
  };
});

// Mock react-map-gl/mapbox and react-map-gl
jest.mock('react-map-gl/mapbox', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children, ...props }: any) => React.createElement('div', { 'data-testid': 'mock-mapbox-map', ...props }, children),
    Map: ({ children, ...props }: any) => React.createElement('div', { 'data-testid': 'mock-mapbox-map', ...props }, children),
    Source: ({ children }: any) => children || null,
    Layer: () => null,
    MapProvider: ({ children }: any) => children,
    useMap: () => ({
      current: {
        getBounds: jest.fn().mockReturnValue({
          getNorthEast: () => ({ lat: () => 42.9, lng: () => -76.3 }),
          getSouthWest: () => ({ lat: () => 42.2, lng: () => -77.2 }),
        }),
        getZoom: jest.fn().mockReturnValue(10),
        fitBounds: jest.fn(),
        setCenter: jest.fn(),
        setZoom: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        flyTo: jest.fn(),
      }
    }),
  };
}, { virtual: true });

jest.mock('react-map-gl', () => {
  const React = require('react');
  return {
    __esModule: true,
    default: ({ children, ...props }: any) => React.createElement('div', { 'data-testid': 'mock-mapbox-map', ...props }, children),
    Map: ({ children, ...props }: any) => React.createElement('div', { 'data-testid': 'mock-mapbox-map', ...props }, children),
    Source: ({ children }: any) => children || null,
    Layer: () => null,
    MapProvider: ({ children }: any) => children,
    useMap: () => ({
      current: {
        getBounds: jest.fn().mockReturnValue({
          getNorthEast: () => ({ lat: () => 42.9, lng: () => -76.3 }),
          getSouthWest: () => ({ lat: () => 42.2, lng: () => -77.2 }),
        }),
        getZoom: jest.fn().mockReturnValue(10),
        fitBounds: jest.fn(),
        setCenter: jest.fn(),
        setZoom: jest.fn(),
        on: jest.fn(),
        off: jest.fn(),
        flyTo: jest.fn(),
      }
    }),
  };
}, { virtual: true });

// Mock mapbox-gl
jest.mock('mapbox-gl', () => ({
  Map: jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    off: jest.fn(),
    remove: jest.fn(),
    getBounds: jest.fn(),
    getZoom: jest.fn(),
  })),
  NavigationControl: jest.fn(),
  GeolocateControl: jest.fn(),
}), { virtual: true });