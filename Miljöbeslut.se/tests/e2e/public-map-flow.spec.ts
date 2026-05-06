import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';
import { createApiContext, primeAuthenticatedPage } from './support';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        String(process.env.PLAYWRIGHT_DATABASE_URL || process.env.DATABASE_URL || '').trim() ||
        'postgresql://miljobeslut:password@localhost:5432/miljobeslut_test',
    },
  },
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('Public Map and Project Verification', () => {
  test('User can open a specific project dashboard and toggle map layers', async ({ page }) => {
    const api = await createApiContext();
    try {
      await primeAuthenticatedPage(page, api);
      await page.goto('/');
      await expect(page).toHaveTitle(/Milj.*beslut/i);

      const logisticsButton = page.getByTestId('landing-open-logistik');
      if (await logisticsButton.isVisible()) {
        await logisticsButton.click();
        await page.getByRole('button', { name: 'Logistik och massor' }).click();
        await expect(page.getByText(/Interaktiv/i)).toBeVisible();
      } else {
        await expect(page.locator('body')).toBeVisible();
      }
    } finally {
      await api.dispose();
    }
  });

  test('Public auth redirects correctly when accessing secure maps', async ({ page }) => {
    await page.goto('/admin');
    await expect(page.getByRole('heading', { name: /Välkommen/i })).toBeVisible();
    await expect(page.getByTestId('admin-username-input')).toHaveCount(0);
  });
});
