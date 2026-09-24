"use client";

import { Provider } from "react-redux";
import { store } from "./store";
import { SnackbarProvider } from "./contexts/SnackbarContext";
import Snackbar from "../components/ui/Snackbar";
import IdleSessionManager from "../features/account/components/IdleSessionManager";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <SnackbarProvider>
        <IdleSessionManager />
        {children}
        <Snackbar />
      </SnackbarProvider>
    </Provider>
  );
}
