import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { initialState, reducer, type AppAction, type AppStateState } from './reducer';

export interface AppContextValue {
  state: AppStateState;
  dispatch: Dispatch<AppAction>;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  return <AppContext.Provider value={{ state, dispatch }}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
}
