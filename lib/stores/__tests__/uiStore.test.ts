import { useUIStore } from '../uiStore';
import { Winery, Visit, GooglePlaceId, WineryDbId } from '@/lib/types';

describe('uiStore', () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  const mockWinery: Winery = {
    id: 'place1' as GooglePlaceId,
    dbId: 101 as WineryDbId,
    name: 'Test Winery',
    address: '123 Test St',
    lat: 40,
    lng: -70
  };

  const mockVisit: Visit = {
    id: 'visit1',
    visit_date: '2026-04-23',
    user_review: 'Great!',
    rating: 5
  };

  it('should reset singleton modal state when closeWineryModal is called', () => {
    useUIStore.getState().openVisitForm(mockWinery, mockVisit);
    useUIStore.getState().openWineryNoteEditor(101, 'notes', () => {});
    
    useUIStore.getState().closeWineryModal();
    
    const state = useUIStore.getState();
    expect(state.activeVisitWinery).toBeNull();
    expect(state.editingVisit).toBeNull();
    expect(state.activeNoteWineryDbId).toBeNull();
    expect(state.activeNoteInitialValue).toBe('');
    expect(state.onNoteSave).toBeNull();
  });

  it('should reset singleton modal state when closeModal is called', () => {
    useUIStore.getState().openVisitForm(mockWinery, mockVisit);
    
    useUIStore.getState().closeModal();
    
    const state = useUIStore.getState();
    expect(state.activeVisitWinery).toBeNull();
    expect(state.editingVisit).toBeNull();
  });

  it('should reset singleton modal state when closeVisitForm is called', () => {
    useUIStore.getState().openVisitForm(mockWinery, mockVisit);
    
    useUIStore.getState().closeVisitForm();
    
    const state = useUIStore.getState();
    expect(state.activeVisitWinery).toBeNull();
    expect(state.editingVisit).toBeNull();
  });

  it('should reset singleton modal state when closeWineryNoteEditor is called', () => {
    useUIStore.getState().openWineryNoteEditor(101, 'notes', () => {});
    
    useUIStore.getState().closeWineryNoteEditor();
    
    const state = useUIStore.getState();
    expect(state.activeNoteWineryDbId).toBeNull();
    expect(state.onNoteSave).toBeNull();
  });
});
