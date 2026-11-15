import { useState } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AuthProvider } from './auth/AuthProvider';
import { routes } from './routes';

export default function App() {
  const [router] = useState(() => createBrowserRouter(routes));
  return (
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  );
}
