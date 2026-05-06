import { expect, test } from '@playwright/test';
import { createApiContext, primeAuthenticatedPage, waitForHubModuleReady } from './support';

test.describe('Project manager workspace E2E', () => {
  test('user can open project manager and see plan workspace', async ({ page }) => {
    const api = await createApiContext();
    try {
      await primeAuthenticatedPage(page, api);
      await page.goto('/');
      await waitForHubModuleReady(page, 'projekt');
      await page.getByTestId('landing-open-projekt').click();
      await expect(page.getByTestId('workspace-active-tab-label')).toContainText('plan', {
        timeout: 30_000,
      });

      const planRoot = page.getByTestId('project-manager-plan');
      await expect(planRoot).toBeVisible({ timeout: 30_000 });
      await expect(planRoot.getByPlaceholder('Projektnamn...')).toBeVisible();
      await expect(planRoot.getByText(/Ansvars-spärrar \(Stop Gates\)/i)).toBeVisible();
      await expect(planRoot.getByRole('button', { name: /Föreslå Intressenter/i })).toBeVisible();
    } finally {
      await api.dispose();
    }
  });

  test('user sees project plan structure and archive panel', async ({ page }) => {
    const api = await createApiContext();
    try {
      await primeAuthenticatedPage(page, api);
      await page.goto('/');
      await waitForHubModuleReady(page, 'projekt');
      await page.getByTestId('landing-open-projekt').click();
      await expect(page.getByTestId('workspace-active-tab-label')).toContainText('plan', {
        timeout: 30_000,
      });

      const planRoot = page.getByTestId('project-manager-plan');
      await expect(planRoot).toBeVisible({ timeout: 30_000 });
      await expect(planRoot.getByPlaceholder('Projektnamn...')).toBeVisible();
      await expect(planRoot.getByText('Projektbeskrivning')).toBeVisible();
      const moduleReadiness = planRoot.getByRole('heading', { name: 'Integrated Module Readiness' });
      await moduleReadiness.scrollIntoViewIfNeeded();
      await expect(moduleReadiness).toBeVisible();
    } finally {
      await api.dispose();
    }
  });
});
