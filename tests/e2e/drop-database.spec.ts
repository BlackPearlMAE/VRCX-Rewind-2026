import { enterSite } from '../fixtures/startup';
import { expect, test } from '@playwright/test';

for (const names of [['VRCX.sqlite3'], ['wrong.txt'], ['first.sqlite3', 'second.sqlite3']]) {
  test(`drop handles ${names.join(', ')}`, async ({ page }) => {
    await page.goto('/');
    await enterSite(page);
    const transfer = await page.evaluateHandle(fileNames => {
      const data = new DataTransfer();
      for (const name of fileNames) data.items.add(new File(['synthetic fixture'], name));
      return data;
    }, names);
    await page.locator('.import-panel').dispatchEvent('dragenter', { dataTransfer: transfer });
    await expect(page.locator('.import-panel')).toHaveClass(/is-dragging/);
    await page.locator('.import-panel').dispatchEvent('drop', { dataTransfer: transfer });
    const message = names.length > 1 ? 'one VRCX.sqlite3' : 'not a SQLite database';
    await expect(page.getByRole('status')).toContainText(message);
    await expect(page.locator('.import-panel')).not.toHaveClass(/is-dragging/);
  });
}