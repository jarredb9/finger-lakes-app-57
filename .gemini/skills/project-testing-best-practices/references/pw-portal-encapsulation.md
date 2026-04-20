---
title: Portal-Based Modal Encapsulation
impact: CRITICAL
impactDescription: Eliminates global state pollution, enables parallel feature testing
tags: modals, portals, encapsulation, testing
---

## Portal-Based Modal Encapsulation

The "Global Singleton Modal" pattern is **DEPRECATED**. Modals MUST be owned by their respective features and rendered via React Portals into a root-level `#modal-host`.

### 1. The Local Context Rule (Jest)
When unit-testing a component that contains a modal, you MUST verify the modal's presence in the local component tree (even if it portals out).
- **Incorrect:** Mocking a global UI store and checking if `openModal` was called.
- **Correct:** Mount the component and verify the `Dialog` content is rendered.

```typescript
// Component-driven verification
render(<TripShareDialog tripId="123" />);
const btn = screen.getByTestId('share-trigger');
fireEvent.click(btn);
expect(screen.getByTestId('trip-share-dialog')).toBeInTheDocument();
```

### 2. State Isolation (Playwright)
Because modals are now decoupled from a global singleton state, Test A's modal state CANNOT leak into Test B.
- **Requirement:** Ensure each test cleans up its own local state. 
- **Verification:** Verify that the modal unmounts from the DOM completely on close.

### 3. The Portaling Target
All encapsulated modals MUST render into the `#modal-host` element defined in `layout.tsx`.
- **E2E Strategy:** Use `page.locator('#modal-host')` as a scope for modal-specific interactions to avoid disambiguation errors with background content.

### 4. The SSR Stability Rule (MANDATORY)
To prevent hydration mismatches and "Portal target not found" race conditions, all Portal-based modals MUST implement a `mounted` check and use `requestAnimationFrame` for state synchronization.
- **Pattern:** 
    1.  Render `null` if `!mounted`.
    2.  Use `requestAnimationFrame` inside `useEffect` to set `mounted = true` and target the `modal-root`.
    3.  This satisfies ESLint `react-hooks/set-state-in-effect` and ensures the DOM target is ready.

```typescript
const [mounted, setMounted] = useState(false);
useEffect(() => {
    const handle = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(handle);
}, []);
if (!mounted) return null;
return createPortal(<Dialog ... />, document.getElementById('modal-root')!);
```

### 5. Why this is Senior-Level:
1.  **Open/Closed Principle:** You can add or delete features without modifying the "Global Renderer."
2.  **No Pollution:** Tests no longer need massive `beforeEach` store resets because the UI state is local to the component.
3.  **Parallelism:** Multiple modals can be open or tested simultaneously without state conflicts.

