import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import type { MapRef } from 'react-map-gl/mapbox';
import { Source, Layer, Marker, MapProvider, useMap } from 'react-map-gl/mapbox';
import { createClient as createBrowserClient } from '@/utils/supabase/client';
import { createClient as createServerClient } from '@/utils/supabase/server';
import { createAdminClient } from '@/utils/supabase/admin';

/**
 * Compile-time guard detecting if type T is 'any'.
 * In TypeScript, 0 extends (1 & any) evaluates to true, whereas for any concrete type or unknown it evaluates to false.
 */
export type IsAny<T> = 0 extends 1 & T ? true : false;

/**
 * Asserts that T is NOT 'any'. Evaluates to true if concrete, false if 'any'.
 */
export type AssertNotAny<T> = IsAny<T> extends true ? false : true;

/**
 * Asserts that two types are strictly equal.
 */
export type AssertEqual<T, U> = [T] extends [U] ? ([U] extends [T] ? true : false) : false;

/**
 * Extracts Database generic from SupabaseClient instance C and asserts it matches Database and is not any.
 */
export type AssertClientIsDatabaseTyped<C> = C extends SupabaseClient<infer DB, any, any>
  ? (IsAny<DB> extends true ? false : (DB extends Database ? true : false))
  : false;

/**
 * Type-level assertion constraint. Fails compilation with TS2344 if argument is not true.
 */
export type ExpectTrue<T extends true> = T;

// -----------------------------------------------------------------------------
// 1. Compile-Time Type Assertions: Supabase Clients
// -----------------------------------------------------------------------------

// Assert createBrowserClient returns SupabaseClient<Database>
export type BrowserClientTypedCheck = ExpectTrue<
  AssertClientIsDatabaseTyped<ReturnType<typeof createBrowserClient>>
>;

// Assert createServerClient returns SupabaseClient<Database>
export type ServerClientTypedCheck = ExpectTrue<
  AssertClientIsDatabaseTyped<Awaited<ReturnType<typeof createServerClient>>>
>;

// Assert createAdminClient returns SupabaseClient<Database>
export type AdminClientTypedCheck = ExpectTrue<
  AssertClientIsDatabaseTyped<Awaited<ReturnType<typeof createAdminClient>>>
>;

// Assert invalid tables and columns are rejected at compile time
export async function typeCheckQueries() {
  const client = createBrowserClient();

  // @ts-expect-error Querying non-existent table should fail when client is typed with Database
  client.from('non_existent_table_seam_check');

  // @ts-expect-error Inserting non-existent column should fail when client is typed with Database
  await client.from('wineries').insert({ non_existent_column_seam_check: 123 });
}

// -----------------------------------------------------------------------------
// 2. Compile-Time Type Assertions: Mapbox Types (no 'any' shims)
// -----------------------------------------------------------------------------

export type MapRefTypedCheck = ExpectTrue<AssertNotAny<MapRef>>;
export type SourceTypedCheck = ExpectTrue<AssertNotAny<typeof Source>>;
export type LayerTypedCheck = ExpectTrue<AssertNotAny<typeof Layer>>;
export type MarkerTypedCheck = ExpectTrue<AssertNotAny<typeof Marker>>;
export type MapProviderTypedCheck = ExpectTrue<AssertNotAny<typeof MapProvider>>;
export type UseMapCurrentTypedCheck = ExpectTrue<AssertNotAny<ReturnType<typeof useMap>['current']>>;

// -----------------------------------------------------------------------------
// 3. Runtime Jest Seam Tests
// -----------------------------------------------------------------------------

jest.mock('next/headers', () => ({
  cookies: jest.fn().mockResolvedValue({
    getAll: jest.fn().mockReturnValue([]),
    set: jest.fn(),
  }),
}));

describe('Supabase Client and Mapbox Runtime Seams', () => {
  it('browser client instantiates with expected Supabase client interface methods', () => {
    const client = createBrowserClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
    expect(typeof client.rpc).toBe('function');
    expect(client.auth).toBeDefined();
    expect(client.storage).toBeDefined();
  });

  it('server client instantiates with expected Supabase client interface methods', async () => {
    const client = await createServerClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
    expect(typeof client.rpc).toBe('function');
    expect(client.auth).toBeDefined();
    expect(client.storage).toBeDefined();
  });

  it('admin client instantiates with expected Supabase client interface methods', async () => {
    const client = await createAdminClient();
    expect(client).toBeDefined();
    expect(typeof client.from).toBe('function');
    expect(typeof client.rpc).toBe('function');
    expect(client.auth).toBeDefined();
    expect(client.storage).toBeDefined();
  });

  it('mapbox components and hooks are defined at runtime', () => {
    expect(Source).toBeDefined();
    expect(Layer).toBeDefined();
    expect(MapProvider).toBeDefined();
    expect(typeof useMap).toBe('function');
  });
});
