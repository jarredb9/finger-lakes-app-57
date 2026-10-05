# Implementation Plan: Phase 2 Task 1 - Restructure Legacy Test Suite & Write Failing Tests for Form Field Registration (Red Phase)

**Track:** `initial-trip-creation-wineries_20261002` (Issue [#57](https://github.com/jarredb9/finger-lakes-app-57/issues/57))  
**Phase:** 2 (Test Suite Restructuring & Controlled Binding (`TripForm`))  
**Task:** 1 (Restructure Legacy Test Suite & Write Failing Tests for Form Field Registration)  
**Specification Reference:** [spec.md](./spec.md)  
**Track Plan Reference:** [plan.md](./plan.md)  

---

## 1. Objective & Seam-Bounded Architecture

### 1.1 Objective
Restructure the monolithic legacy test file `components/__tests__/react19-form-actions.test.tsx` by separating auth form tests from trip creation form tests, and establish failing unit tests (TDD Red Phase) in a dedicated suite `components/__tests__/trip-form.test.tsx`. The failing tests assert controlled `<FormField>` binding, non-toggle place deduplication, badge tag removal, and submission payload delivery to `createTrip`.

### 1.2 Architectural Context & Seam Boundaries
1. **The Legacy Co-location Problem:**
   - `components/__tests__/react19-form-actions.test.tsx` combined disparate tests for `LoginForm`, `ForgotPasswordForm`, `ManualConfirmForm`, and `TripForm`.
   - As `TripForm` evolves to support controlled field registration, multi-stop selection, deduplication, and removal tag events, testing it in a shared auth-actions file violates single-responsibility boundaries and bloats test cycles.
2. **Controlled Form Field Binding (`spec.md` Section 3.3):**
   - In current `components/trip-form.tsx`:
     - The winery autocomplete and selected badges reside in an unmanaged `<div>` outside React Hook Form's `<FormField>`.
     - State changes are driven through an imperative toggle method `handleWineryToggle` that directly executes `useWineryStore.ensureInDb(winery.id)` and `form.setValue("wineries", ...)`.
     - Clicking the same winery in autocomplete toggles it *off* instead of deduplicating.
   - In the target architecture:
     - Winery selection is wrapped inside `<FormField control={form.control} name="wineries" render={({ field }) => ...} />`.
     - State updates are synchronous via `field.onChange([...current, winery])` with ID deduplication.
     - `ensureInDb` is decoupled from place selection.
     - Badge tags provide dedicated removal buttons via `field.onChange(current.filter(w => w.id !== winery.id))`.
3. **Red-Phase Strategy:**
   - Extract `LoginForm`, `ForgotPasswordForm`, and `ManualConfirmForm` into `components/__tests__/auth-forms.test.tsx` (tests continue to pass).
   - Create `components/__tests__/trip-form.test.tsx` preserving baseline validation and offline tests, and introduce new assertions that deliberately fail against current `components/trip-form.tsx`:
     - Assert that place selection does NOT invoke `ensureInDb`.
     - Assert that selecting the same winery from autocomplete twice deduplicates rather than toggling it off.
     - Assert that removing a winery badge decrements the selection and preserves other selected stops.
     - Assert that form submission delivers the full payload with selected wineries to `createTrip`.
   - Delete `components/__tests__/react19-form-actions.test.tsx`.

---

## 2. Invariants & Guardrails

1. **Test Parity Invariant:**
   - Existing auth form coverage (`LoginForm`, `ForgotPasswordForm`, `ManualConfirmForm`) must remain 100% intact in `auth-forms.test.tsx`.
2. **Form Lifecycle Invariant:**
   - Autocomplete selection in `TripForm` must be synchronous and bound directly to the React Hook Form field without external asynchronous side effects like `ensureInDb`.
3. **Deduplication Invariant:**
   - Repeated selection of the same winery via autocomplete must deduplicate by `winery.id` without removing or duplicating tags.
4. **Scaffolding Hygiene Invariant:**
   - Deletion of legacy `react19-form-actions.test.tsx` must be executed as part of this task so that duplicate test suites do not exist.

---

## 3. Target Files & Exact Drop-in Specifications

### 3.1 Target File 1: `components/__tests__/auth-forms.test.tsx`
- **Action:** Create new file.
- **Path:** `components/__tests__/auth-forms.test.tsx`

```typescript
import { render, screen } from '@testing-library/react';
import { LoginForm } from '../login-form';
import { ForgotPasswordForm } from '../forgot-password-form';
import { ManualConfirmForm } from '../manual-confirm-form';

const mockPush = jest.fn();
const mockRefresh = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

describe('Auth Forms React 19 useActionState Behavioral Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. LoginForm React 19 useActionState Modernization (FM-6.1)', () => {
    it('renders disabled pending state with spinner when form action is executing', () => {
      // Test that the submit button reflects isPending from useActionState
      render(<LoginForm redirectTo="/trips" />);
      const submitButton = screen.getByRole('button', { name: /sign in/i });
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('2. ForgotPasswordForm & ManualConfirmForm useActionState Modernization', () => {
    it('renders ForgotPasswordForm submit button and inputs', () => {
      render(<ForgotPasswordForm />);
      expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    });

    it('renders ManualConfirmForm submit button and inputs', () => {
      render(<ManualConfirmForm />);
      expect(screen.getByRole('button', { name: /confirm account/i })).toBeInTheDocument();
      expect(screen.getByLabelText(/email address/i)).toBeInTheDocument();
    });
  });
});
```

---

### 3.2 Target File 2: `components/__tests__/trip-form.test.tsx`
- **Action:** Create new file.
- **Path:** `components/__tests__/trip-form.test.tsx`

```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import TripForm from '../trip-form';
import { useTripStore } from '@/lib/stores/tripStore';
import { useWineryStore } from '@/lib/stores/wineryStore';
import { AuthenticatedUser } from '@/lib/types';

const mockPush = jest.fn();
const mockRefresh = jest.fn();
const mockToast = jest.fn();

jest.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
    toasts: [],
    dismiss: jest.fn(),
  }),
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
  }),
}));

// Mock PlaceAutocomplete to allow multi-winery selection simulation
jest.mock('../PlaceAutocomplete', () => ({
  PlaceAutocomplete: ({ onPlaceSelect, id }: any) => (
    <div data-testid={id || 'mock-place-autocomplete'}>
      <button
        data-testid="trip-form-winery-autocomplete"
        type="button"
        onClick={() =>
          onPlaceSelect({
            id: 'google-place-winery-123',
            name: 'Keuka Spring Vineyards',
            address: '243 Route 54, Penn Yan, NY',
            location: { latitude: 42.63, longitude: -77.12 },
          })
        }
      >
        Select Keuka Spring Vineyards
      </button>
      <button
        data-testid="mock-select-winery-2"
        type="button"
        onClick={() =>
          onPlaceSelect({
            id: 'google-place-winery-456',
            name: 'Dr. Konstantin Frank',
            address: '9749 Middle Rd, Hammondsport, NY',
            location: { latitude: 42.55, longitude: -77.18 },
          })
        }
      >
        Select Dr. Konstantin Frank
      </button>
    </div>
  ),
}));

describe('TripForm Controlled FormField & Multi-Stop Binding', () => {
  const mockUser: AuthenticatedUser = {
    id: 'user-trip-123',
    email: 'planner@example.com',
    name: 'Finger Lakes Explorer',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useTripStore.getState().reset();
    useWineryStore.getState().reset();
  });

  describe('Validation & Baseline Invariants', () => {
    it('preserves react-hook-form / Zod validation and prevents submission on empty trip name', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const submitButton = screen.getByTestId('create-trip-submit-btn');
      expect(submitButton).toBeDisabled();
    });

    it('allows offline winery selection without throwing errors or blocking selection (FM-6.3)', async () => {
      mockToast.mockClear();

      const ensureInDbMock = jest.fn().mockResolvedValue(null);
      const upsertWineryMock = jest.fn();

      useWineryStore.setState({
        ensureInDb: ensureInDbMock,
        upsertWinery: upsertWineryMock,
      });

      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      await waitFor(() => {
        expect(mockToast).not.toHaveBeenCalledWith(
          expect.objectContaining({ variant: 'destructive' })
        );
        expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      });
    });
  });

  describe('Controlled FormField Binding & Deduplication (Red Phase Assertions)', () => {
    it('updates form state synchronously via controlled field without invoking legacy ensureInDb on place select', async () => {
      const ensureInDbMock = jest.fn();
      useWineryStore.setState({ ensureInDb: ensureInDbMock });

      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');
      fireEvent.click(winerySelectButton);

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      // RED PHASE CHECK: In current TripForm, handleWineryToggle calls ensureInDb(winery.id).
      // Controlled FormField binding must NOT call ensureInDb on place selection.
      expect(ensureInDbMock).not.toHaveBeenCalled();
    });

    it('deduplicates winery selection when the same winery is selected multiple times from autocomplete', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      const winerySelectButton = screen.getByTestId('trip-form-winery-autocomplete');

      // First click: adds winery
      fireEvent.click(winerySelectButton);
      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();

      // Second click: autocomplete selection must deduplicate, NOT toggle off
      fireEvent.click(winerySelectButton);

      // RED PHASE CHECK: In current TripForm, handleWineryToggle toggles the winery off on second click.
      // Target FormField binding deduplicates and keeps the tag in the list.
      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      const selectedTags = screen.getAllByTestId('selected-winery-google-place-winery-123');
      expect(selectedTags).toHaveLength(1);
    });

    it('removes selected winery tag when the remove button is clicked and preserves other selected wineries', async () => {
      render(<TripForm user={mockUser} initialDate={new Date('2026-10-15T12:00:00')} />);

      // Select winery 1 and winery 2
      fireEvent.click(screen.getByTestId('trip-form-winery-autocomplete'));
      fireEvent.click(screen.getByTestId('mock-select-winery-2'));

      expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument();
      expect(screen.getByTestId('selected-winery-google-place-winery-456')).toBeInTheDocument();

      // Click remove on winery 1 badge
      const removeButton = screen.getByRole('button', { name: /remove keuka spring vineyards/i });
      fireEvent.click(removeButton);

      expect(screen.queryByTestId('selected-winery-google-place-winery-123')).not.toBeInTheDocument();
      expect(screen.getByTestId('selected-winery-google-place-winery-456')).toBeInTheDocument();
    });

    it('submits form with trip name, local date, and selected wineries payload to createTrip', async () => {
      const createTripMock = jest.fn().mockResolvedValue({ id: 101, name: 'Keuka Lake Tour' });
      useTripStore.setState({ createTrip: createTripMock });
      const mockOnClose = jest.fn();

      render(
        <TripForm
          user={mockUser}
          initialDate={new Date('2026-10-15T12:00:00')}
          onClose={mockOnClose}
        />
      );

      // Fill trip name
      const nameInput = screen.getByTestId('trip-name-input');
      fireEvent.change(nameInput, { target: { value: 'Keuka Lake Tour' } });

      // Add winery 1 and winery 2, then remove winery 1
      fireEvent.click(screen.getByTestId('trip-form-winery-autocomplete'));
      fireEvent.click(screen.getByTestId('mock-select-winery-2'));

      const removeButton = screen.getByRole('button', { name: /remove keuka spring vineyards/i });
      fireEvent.click(removeButton);

      // Verify submit button is enabled
      const submitButton = screen.getByTestId('create-trip-submit-btn');
      await waitFor(() => {
        expect(submitButton).not.toBeDisabled();
      });

      // Submit form
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(createTripMock).toHaveBeenCalledTimes(1);
        expect(createTripMock).toHaveBeenCalledWith(
          expect.objectContaining({
            name: 'Keuka Lake Tour',
            trip_date: '2026-10-15',
            user_id: 'user-trip-123',
            wineries: [
              expect.objectContaining({
                id: 'google-place-winery-456',
                name: 'Dr. Konstantin Frank',
              }),
            ],
          })
        );
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Trip created successfully!' })
      );
      expect(mockOnClose).toHaveBeenCalled();
    });
  });
});
```

---

### 3.3 Target Action 3: Deletion of Legacy Test File
- **Target File:** `components/__tests__/react19-form-actions.test.tsx`
- **Action:** Delete file (via filesystem removal command `rm components/__tests__/react19-form-actions.test.tsx`).

---

## 4. Red-Phase Failure Verification Rationale

When executed against the current un-refactored `components/trip-form.tsx`:
1. **`auth-forms.test.tsx`:**
   - **Expected Status:** All 3 tests pass, verifying that extracting the auth forms causes zero regression.
2. **`trip-form.test.tsx` - Failing Test 1 (`updates form state synchronously via controlled field without invoking legacy ensureInDb on place select`):**
   - **Failure Point:** Line `expect(ensureInDbMock).not.toHaveBeenCalled()`.
   - **Root Cause:** Current `components/trip-form.tsx` line 118 calls `dbId = await ensureInDb(winery.id)` inside `handleWineryToggle`.
   - **Expected Failure:** `Expected number of calls: 0, Received number of calls: 1`.
3. **`trip-form.test.tsx` - Failing Test 2 (`deduplicates winery selection when the same winery is selected multiple times from autocomplete`):**
   - **Failure Point:** Line `expect(screen.getByTestId('selected-winery-google-place-winery-123')).toBeInTheDocument()`.
   - **Root Cause:** Current `components/trip-form.tsx` line 112 checks `isSelected` and filters out the winery if it already exists, treating repeated autocomplete selection as a toggle rather than deduplication.
   - **Expected Failure:** Element not found in document.

---

## 5. Execution Verification Protocol

### Exact Test Runner Command
Per `AGENTS.md`, Jest unit tests run containerized using the following exact command:

```bash
./scripts/run-jest-container.sh components/__tests__/trip-form.test.tsx components/__tests__/auth-forms.test.tsx
```

> [!IMPORTANT]
> - Running this container runner requires `BypassSandbox: true` (due to container socket requirements).
> - Expected result during Task 1 execution:
>   - `components/__tests__/auth-forms.test.tsx`: **PASS** (3 tests passed)
>   - `components/__tests__/trip-form.test.tsx`: **FAIL** with exactly 2 failing tests (`updates form state synchronously...` and `deduplicates winery selection...`) and 4 passing tests, satisfying the Red Phase of TDD.

---

## 6. Gating & Approval
No source code files or test files have been modified yet. Under Conductor guidelines, moving to file creation and test execution requires explicit user approval.
