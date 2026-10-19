import { expect, test } from '@playwright/test'

const SETUP_KEY = 'e2e-local-session-secret-0123456789'
const PASSWORD = 'correct horse battery'

test('setup -> Today shell -> logout -> login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/setup$/)

  await page.getByLabel('Setup key').fill(SETUP_KEY)
  await page.getByLabel('Business name').fill('Example Co')
  await page.getByLabel('Your name').fill('Test Admin')
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Create workspace' }).click()

  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.getByText('Nothing to follow up yet')).toBeVisible()

  await page.getByRole('button', { name: 'Log out' }).first().click()
  await expect(page).toHaveURL(/\/login$/)

  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('wrong password here')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('alert')).toContainText('incorrect')

  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()

  // reload keeps the session; /setup is locked
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  expect((await page.request.get('/api/setup/status')).ok()).toBe(true)
  expect(await (await page.request.get('/api/setup/status')).json()).toMatchObject({ needs_setup: false })
})
