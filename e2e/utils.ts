/**
 * Backward-compatible delegation façade for E2E testing utilities.
 * All implementations have been decomposed into modular fixtures under e2e/fixtures/.
 */
export {
  test,
  expect,
  MockMapsManager,
  createDefaultMockState,
  getAdminClient,
  supabase,
  createTestUser,
  deleteTestUser,
  mockGoogleMapsApi,
  createMockTrip,
  createMockVisitWithWinery,
  createMockMapMarkerRpc,
  MapsFixtureManager,
  mapsFixture,
  AuthFixtureManager,
  authFixture,
  TripsFixtureManager,
  tripsFixture,
} from './fixtures';

export type {
  RpcVisitWithWinery,
  FriendActivityFeedItem,
  TripMember,
  Profile,
  MapMarker,
  TripDetails,
  VisitItem,
  TestUser,
  MockMapsState,
} from './fixtures';
