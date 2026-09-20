import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppLayout } from '../components/layout/AppLayout';
import { RegisterPage } from '../pages/RegisterPage';
import { DashboardPage } from '../pages/DashboardPage';
import { LinksPage } from '../pages/LinksPage';
import { LinkDetailPage } from '../pages/LinkDetailPage';
import { RoutingBuilderPage } from '../pages/RoutingBuilderPage';
import { AnalyticsPage } from '../pages/AnalyticsPage';
import { ApiKeysPage } from '../pages/ApiKeysPage';
import { SystemStatusPage } from '../pages/SystemStatusPage';
import { NotFoundPage } from '../pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppLayout />,
    children: [
      {
        index: true,
        element: <Navigate to="/dashboard" replace />,
      },
      {
        path: 'register',
        element: <RegisterPage />,
      },
      {
        path: 'dashboard',
        element: <DashboardPage />,
      },
      {
        path: 'links',
        element: <LinksPage />,
      },
      {
        path: 'links/:code',
        element: <LinkDetailPage />,
      },
      {
        path: 'links/:code/routing',
        element: <RoutingBuilderPage />,
      },
      {
        path: 'analytics',
        element: <AnalyticsPage />,
      },
      {
        path: 'keys',
        element: <ApiKeysPage />,
      },
      {
        path: 'status',
        element: <SystemStatusPage />,
      },
      {
        path: '*',
        element: <NotFoundPage />,
      },
    ],
  },
]);
