import React from "react";
import { BrowserRouter } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import AppRouter from "@/router";

const App: React.FC = () => (
  <BrowserRouter>
    <AppShell>
      <AppRouter />
    </AppShell>
  </BrowserRouter>
);

export default App;
