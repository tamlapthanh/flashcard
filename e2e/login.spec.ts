import { expect, test } from './fixtures';

test.describe('login', () => {
  test('wrong password shows an error and stays on the login screen', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill('alice');
    await page.getByLabel('Password', { exact: true }).fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('Wrong username or password');
    await expect(page).toHaveURL(/#\/login/);
  });

  test('correct password opens the deck screen and sign out returns to login', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Username').fill('alice');
    await page.getByLabel('Password', { exact: true }).fill('pw1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('button', { name: /始める/ })).toBeVisible();

    await page.getByRole('button', { name: 'Open the menu' }).click();
    await expect(page.getByText(/alice/)).toBeVisible();
    await page.getByText('Sign out').click();
    await expect(page).toHaveURL(/#\/login/);
  });

  test('a signed-out visitor is redirected from /study to login', async ({ page }) => {
    await page.goto('/#/study');
    await expect(page).toHaveURL(/#\/login/);
  });
});
